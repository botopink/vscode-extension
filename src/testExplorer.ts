import { spawn } from "child_process";
import * as vscode from "vscode";
import { getBotopinkCliPath, getOutputChannel, workspaceCwd } from "./cli";
import { fetchDocumentSymbols, flattenSymbols, isTestSymbol } from "./symbols";
import { TargetManager } from "./target";
import { parseTestOutput } from "./testOutput";

// `parseTestOutput` (and its regexes / `TestOutcome` shape) live in the
// `vscode`-free `./testOutput` module so they can be unit-tested without a host.
export { parseTestOutput };

const CONTROLLER_ID = "botopink";
const CONTROLLER_LABEL = "Botopink";

/**
 * Wires the VS Code Testing API for Botopink.
 *
 * Discovery is driven by LSP `documentSymbol`s (test blocks are `Method`
 * symbols whose name is the test string). Running shells `botopink test` and
 * maps its textual report back onto the `TestItem`s. No `.bp` parsing happens
 * here.
 */
export function createTestController(
  context: vscode.ExtensionContext,
  targets: TargetManager,
): vscode.TestController {
  const controller = vscode.tests.createTestController(
    CONTROLLER_ID,
    CONTROLLER_LABEL,
  );
  context.subscriptions.push(controller);

  controller.resolveHandler = async (item) => {
    if (!item) {
      await discoverAllTests(controller);
    } else if (item.uri) {
      await discoverFileTests(controller, item.uri);
    }
  };

  controller.createRunProfile(
    "Run",
    vscode.TestRunProfileKind.Run,
    (request, token) => runHandler(controller, targets, request, token),
    true,
  );

  // Keep the tree fresh as files are opened / saved / removed.
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.bp");
  watcher.onDidCreate((uri) => void discoverFileTests(controller, uri));
  watcher.onDidChange((uri) => void discoverFileTests(controller, uri));
  watcher.onDidDelete((uri) => controller.items.delete(uri.toString()));
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "botopink") {
        void discoverFileTests(controller, doc.uri);
      }
    }),
  );

  // Initial discovery (best-effort; the LSP may still be starting).
  void discoverAllTests(controller);

  return controller;
}

/** Finds every workspace `.bp` file and discovers its test blocks. */
async function discoverAllTests(
  controller: vscode.TestController,
): Promise<void> {
  const uris = await vscode.workspace.findFiles(
    "**/*.bp",
    "**/node_modules/**",
  );
  await Promise.all(uris.map((uri) => discoverFileTests(controller, uri)));
}

/** Discovers the test blocks in a single file and (re)builds its sub-tree. */
async function discoverFileTests(
  controller: vscode.TestController,
  uri: vscode.Uri,
): Promise<void> {
  const symbols = await fetchDocumentSymbols(uri);
  const tests = [...flattenSymbols(symbols)].filter(isTestSymbol);

  if (tests.length === 0) {
    controller.items.delete(uri.toString());
    return;
  }

  const fileItem = getOrCreateFileItem(controller, uri);
  const seen = new Set<string>();
  for (const symbol of tests) {
    const id = `${uri.toString()}::${symbol.name}`;
    seen.add(id);
    let testItem = fileItem.children.get(id);
    if (!testItem) {
      testItem = controller.createTestItem(id, symbol.name, uri);
      fileItem.children.add(testItem);
    }
    testItem.range = symbol.range;
  }
  // Drop test items that no longer exist.
  fileItem.children.forEach((child) => {
    if (!seen.has(child.id)) {
      fileItem.children.delete(child.id);
    }
  });
}

function getOrCreateFileItem(
  controller: vscode.TestController,
  uri: vscode.Uri,
): vscode.TestItem {
  const id = uri.toString();
  let item = controller.items.get(id);
  if (!item) {
    const label = vscode.workspace.asRelativePath(uri);
    item = controller.createTestItem(id, label, uri);
    item.canResolveChildren = true;
    controller.items.add(item);
  }
  return item;
}

/** Collects all leaf test items in scope for a run request. */
function gatherTestItems(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
): vscode.TestItem[] {
  const items: vscode.TestItem[] = [];
  const exclude = new Set(request.exclude ?? []);

  const visit = (item: vscode.TestItem) => {
    if (exclude.has(item)) {
      return;
    }
    if (item.children.size > 0) {
      item.children.forEach(visit);
    } else {
      items.push(item);
    }
  };

  if (request.include) {
    request.include.forEach(visit);
  } else {
    controller.items.forEach(visit);
  }
  return items;
}

/**
 * Runs the selected tests through `botopink test` and reports outcomes.
 *
 * `botopink test` runs the whole suite (optionally narrowed by `--filter`).
 * We run once per request: when a single test is selected we pass its name as
 * `--filter`; otherwise we run the full suite and map results by name.
 */
async function runHandler(
  controller: vscode.TestController,
  targets: TargetManager,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
): Promise<void> {
  const run = controller.createTestRun(request);
  const items = gatherTestItems(controller, request);
  for (const item of items) {
    run.enqueued(item);
  }

  const filter = items.length === 1 ? testNameOf(items[0]) : undefined;

  for (const item of items) {
    run.started(item);
  }

  try {
    const { stdout, stderr, exitError } = await runBotopinkTest(
      targets,
      filter,
      token,
    );
    const output = stdout + stderr;
    run.appendOutput(output.replace(/\r?\n/g, "\r\n"));

    const outcomes = parseTestOutput(output);
    for (const item of items) {
      const name = testNameOf(item);
      const outcome = outcomes.get(name);
      if (!outcome) {
        // The runner never reported this test (e.g. compile failure or it was
        // filtered out by an unrelated `--filter`). Surface the raw output.
        run.errored(
          item,
          new vscode.TestMessage(
            exitError
              ? exitError
              : "No result reported for this test — see the test output.",
          ),
        );
        continue;
      }
      if (outcome.passed) {
        run.passed(item);
      } else {
        run.failed(
          item,
          new vscode.TestMessage(outcome.message ?? "assertion failed"),
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const item of items) {
      run.errored(item, new vscode.TestMessage(message));
    }
  } finally {
    run.end();
  }
}

function testNameOf(item: vscode.TestItem): string {
  // Test item ids are `${uri}::${name}`; the label is the bare test name.
  return item.label;
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitError?: string;
}

/** Spawns `botopink test [--target T] [--filter F]` and buffers its output. */
async function runBotopinkTest(
  targets: TargetManager,
  filter: string | undefined,
  token: vscode.CancellationToken,
): Promise<CliResult> {
  const cli = await getBotopinkCliPath();
  const args = ["test", "--target", targets.target];
  if (filter) {
    args.push("--filter", filter);
  }
  const cwd = workspaceCwd();
  const channel = getOutputChannel();
  channel.appendLine(`$ ${cli} ${args.join(" ")}`);

  return await new Promise<CliResult>((resolve) => {
    const child = spawn(cli, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      channel.append(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      channel.append(text);
    });

    const onCancel = token.onCancellationRequested(() => child.kill());

    child.on("error", (err) => {
      onCancel.dispose();
      resolve({
        stdout,
        stderr,
        exitError: `Failed to run '${cli}': ${err.message}`,
      });
    });
    child.on("close", (code) => {
      onCancel.dispose();
      resolve({
        stdout,
        stderr,
        exitError:
          code && code !== 0
            ? `botopink test exited with code ${code}`
            : undefined,
      });
    });
  });
}
