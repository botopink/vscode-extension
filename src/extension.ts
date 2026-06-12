import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import {
  getBotopinkCliPath,
  getOutputChannel,
  disposeOutputChannel,
  workspaceCwd,
} from "./cli";
import {
  RUN_MAIN_COMMAND,
  RUN_TEST_COMMAND,
  BotopinkCodeLensProvider,
} from "./codeLens";
import { BOTOPINK_TASK_TYPE, BotopinkTaskProvider } from "./tasks";
import { createTestController } from "./testExplorer";
import { TargetManager } from "./target";
import { quoteArg } from "./quoting";
import { resolveBinPath } from "./pathResolve";

const enum BotopinkCommands {
  RestartServer = "botopink.restartServer",
  SelectTarget = "botopink.selectTarget",
}

const EXTENSION_NS = "botopink";
const DEFAULT_SERVER_BIN = "botopink-lsp";

let client: LanguageClient | undefined;
let configureLang: vscode.Disposable | undefined;
let targetManager: TargetManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const onEnterRules = [...continueTypingCommentsOnNewline()];

  configureLang = vscode.languages.setLanguageConfiguration("botopink", {
    onEnterRules,
  });

  const restartCommand = vscode.commands.registerCommand(
    BotopinkCommands.RestartServer,
    async () => {
      if (!client) {
        vscode.window.showErrorMessage("botopink client not found");
        return;
      }

      try {
        if (client.isRunning()) {
          await client.restart();
          vscode.window.showInformationMessage("botopink server restarted.");
        } else {
          await client.start();
        }
      } catch (err) {
        client.error("Restarting client failed", err, "force");
      }
    },
  );

  context.subscriptions.push(restartCommand);

  // ── Status-bar target switcher (F3) ──────────────────────────────────────
  const targets = new TargetManager(BotopinkCommands.SelectTarget);
  targetManager = targets;
  context.subscriptions.push(targets);
  context.subscriptions.push(
    vscode.commands.registerCommand(BotopinkCommands.SelectTarget, () =>
      targets.pick(),
    ),
  );
  await targets.init();

  // ── Tasks + problem matcher (F2) ─────────────────────────────────────────
  const taskProvider = new BotopinkTaskProvider(targets);
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(BOTOPINK_TASK_TYPE, taskProvider),
  );

  // ── CodeLens + run/test commands (F3) ────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "botopink" },
      new BotopinkCodeLensProvider(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(RUN_TEST_COMMAND, (testName: string) =>
      runCliInTerminal("test", targets, { filter: testName }),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(RUN_MAIN_COMMAND, () =>
      runCliInTerminal("run", targets),
    ),
  );

  // ── Test Explorer (F4) ───────────────────────────────────────────────────
  createTestController(context, targets);

  client = await createLanguageClient();
  client?.start();
}

export function deactivate(): Thenable<void> | undefined {
  configureLang?.dispose();
  targetManager?.dispose();
  targetManager = undefined;
  disposeOutputChannel();
  return client?.stop();
}

/**
 * Runs a `botopink` subcommand in an integrated terminal.
 *
 * Used by the CodeLens "Run" / "Run test" actions: a terminal gives the user a
 * live, interactive view (and re-runs are one keystroke away). The active
 * codegen target is honoured for the commands that accept `--target`.
 */
async function runCliInTerminal(
  command: "run" | "test",
  targets: TargetManager,
  opts: { filter?: string } = {},
): Promise<void> {
  const cli = await getBotopinkCliPath();
  const args = [command, "--target", targets.target];
  if (command === "test" && opts.filter) {
    args.push("--filter", quoteArg(opts.filter));
  }
  const cwd = workspaceCwd();
  const terminal = vscode.window.createTerminal({
    name: "Botopink",
    cwd,
  });
  getOutputChannel().appendLine(`$ ${cli} ${args.join(" ")}`);
  terminal.show();
  terminal.sendText(`${quoteArg(cli)} ${args.join(" ")}`);
}

async function createLanguageClient(): Promise<LanguageClient | undefined> {
  const command = await getBotopinkLspPath();
  if (!command) {
    const message = `Could not resolve the botopink-lsp executable. Ensure it is on the PATH used by VS Code, or set "botopink.path" to a valid executable.`;
    vscode.window.showErrorMessage(message);
    return;
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "botopink" }],
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher("**/*.bp"),
        workspace.createFileSystemWatcher("**/build.zig"),
      ],
    },
  };

  const serverOptions: ServerOptions = {
    command,
    args: [],
    options: {
      env: Object.assign({}, process.env),
    },
  };

  return new LanguageClient(
    "botopink_language_server",
    "Botopink Language Server",
    serverOptions,
    clientOptions,
  );
}

/**
 * `OnEnterRule`s to continue doc comments when pressing Enter.
 * Mirrors botopink's `//`, `///`, `////` comment levels.
 */
function continueTypingCommentsOnNewline(): vscode.OnEnterRule[] {
  const indentAction = vscode.IndentAction.None;
  return [
    {
      beforeText: /^\s*\/{4}.*$/,
      action: { indentAction, appendText: "//// " },
    },
    {
      beforeText: /^\s*\/{3}.*$/,
      action: { indentAction, appendText: "/// " },
    },
  ];
}

/** Returns the absolute path to the botopink-lsp command, or the bare name. */
export async function getBotopinkLspPath(): Promise<string | undefined> {
  return resolveBinPath({
    configured: getWorkspaceConfigLspPath(),
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath,
    ),
    defaultBin: DEFAULT_SERVER_BIN,
    relativeMiss: "undefined", // an unresolved relative path is reported unresolved
    isAbsolute: path.isAbsolute,
    resolve: path.resolve,
    exists: fileExists,
  });
}

function getWorkspaceConfigLspPath(): string | undefined {
  const exePath = vscode.workspace.getConfiguration(EXTENSION_NS).get("path");
  if (typeof exePath !== "string" || !exePath || exePath.trim().length === 0) {
    return undefined;
  }
  return exePath;
}

function fileExists(executableFilePath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fs.stat(executableFilePath, (err, stat) => {
      resolve(err == null && stat.isFile());
    });
  }).catch(() => false);
}
