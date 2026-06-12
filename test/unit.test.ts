// Pure-function unit tests for the Botopink VS Code extension (Front-C, C4 F0).
//
// These exercise the `vscode`-free helper modules directly, with no Electron
// host: run via Node's built-in test runner + native TypeScript support
// (`npm test` → `node --test test/`). Every import targets a `vscode`-free leaf
// module, so no `vscode` shim is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { parseTestOutput } from "../src/testOutput.ts";
import { argsFor, taskGroupKind, taskLabel } from "../src/taskArgs.ts";
import { quoteArg } from "../src/quoting.ts";
import {
  flattenSymbolNodes,
  isDocumentSymbolArray,
  isMainSymbolNode,
  isTestSymbolNode,
  type SymbolNode,
  SYMBOL_KIND_FUNCTION,
  SYMBOL_KIND_METHOD,
} from "../src/symbolNodes.ts";
import {
  DEFAULT_TARGET,
  parseTargetFromJson,
  resolveTarget,
  writeTargetConfig,
} from "../src/targetConfig.ts";
import { resolveBinPath } from "../src/pathResolve.ts";

// ───────────────────────── parseTestOutput ─────────────────────────

test("parseTestOutput: an 'ok <name>' line marks the test passed", () => {
  const outcomes = parseTestOutput("ok adds two numbers\n");
  assert.deepEqual(outcomes.get("adds two numbers"), { passed: true });
});

test("parseTestOutput: a 'FAIL <name> (<msg>) at <loc>' line captures the message", () => {
  const line = "FAIL math works  (expected 4, got 5)  at src/main.bp:12";
  const outcomes = parseTestOutput(line + "\n");
  assert.deepEqual(outcomes.get("math works"), {
    passed: false,
    message: "expected 4, got 5",
  });
});

test("parseTestOutput: unrelated / malformed lines are ignored; empty output → empty map", () => {
  assert.equal(parseTestOutput("").size, 0);
  const noise = ["running 2 tests", "2 passed, 0 failed", "okkk nope", "   "];
  assert.equal(parseTestOutput(noise.join("\n")).size, 0);
});

test("parseTestOutput: duplicate names + special chars are handled (last wins, CRLF tolerated)", () => {
  const output = [
    'ok handles ${interp} & "quotes"',
    'FAIL handles ${interp} & "quotes"  (boom)  at a.bp:1',
  ].join("\r\n");
  const outcomes = parseTestOutput(output);
  // A later FAIL for the same name overrides the earlier ok.
  assert.deepEqual(outcomes.get('handles ${interp} & "quotes"'), {
    passed: false,
    message: "boom",
  });
  assert.equal(outcomes.size, 1);
});

// ───────────────────────── taskArgs ─────────────────────────

test("argsFor: check → ['check']; format → ['format'] (no extra args)", () => {
  assert.deepEqual(argsFor({ command: "check" }, "commonJS"), ["check"]);
  assert.deepEqual(argsFor({ command: "format" }, "commonJS"), ["format"]);
});

test("argsFor: build pins --target, falling back to the active target when unset", () => {
  assert.deepEqual(argsFor({ command: "build" }, "erlang"), [
    "build",
    "--target",
    "erlang",
  ]);
  assert.deepEqual(argsFor({ command: "build", target: "wasm" }, "erlang"), [
    "build",
    "--target",
    "wasm",
  ]);
});

test("argsFor: test carries --target and appends --filter only when given", () => {
  assert.deepEqual(argsFor({ command: "test" }, "commonJS"), [
    "test",
    "--target",
    "commonJS",
  ]);
  assert.deepEqual(argsFor({ command: "test", filter: "math" }, "commonJS"), [
    "test",
    "--target",
    "commonJS",
    "--filter",
    "math",
  ]);
});

test("taskLabel / taskGroupKind: labels show command+target; group only for build/test", () => {
  assert.equal(taskLabel({ command: "build" }, "wasm"), "build (wasm)");
  assert.equal(
    taskLabel({ command: "test", target: "erlang" }, "commonJS"),
    "test (erlang)",
  );
  assert.equal(taskLabel({ command: "check" }, "commonJS"), "check");
  assert.equal(taskLabel({ command: "format" }, "commonJS"), "format");

  assert.equal(taskGroupKind("build"), "build");
  assert.equal(taskGroupKind("test"), "test");
  assert.equal(taskGroupKind("check"), undefined);
  assert.equal(taskGroupKind("format"), undefined);
});

// ───────────────────────── quoteArg ─────────────────────────

test("quoteArg: plain identifiers pass through; spaces/specials quote; inner quotes escape", () => {
  assert.equal(quoteArg("botopink"), "botopink");
  assert.equal(quoteArg("./zig-out/bin/botopink"), "./zig-out/bin/botopink");
  assert.equal(quoteArg("with space"), "'with space'");
  assert.equal(quoteArg("a&b|c"), "'a&b|c'");
  assert.equal(quoteArg("it's"), "'it'\\''s'");
});

// ───────────────────────── symbol predicates ─────────────────────────

function sym(
  kind: number,
  name: string,
  children: SymbolNode[] = [],
): SymbolNode {
  return { kind, name, children };
}

test("flattenSymbolNodes: depth-first traversal of a nested tree, in order", () => {
  const tree = [
    sym(SYMBOL_KIND_FUNCTION, "a", [
      sym(SYMBOL_KIND_METHOD, "a.1"),
      sym(SYMBOL_KIND_METHOD, "a.2", [sym(SYMBOL_KIND_METHOD, "a.2.1")]),
    ]),
    sym(SYMBOL_KIND_FUNCTION, "b"),
  ];
  const names = [...flattenSymbolNodes(tree)].map((s) => s.name);
  assert.deepEqual(names, ["a", "a.1", "a.2", "a.2.1", "b"]);
});

test("isTestSymbolNode / isMainSymbolNode classify Method ⇒ test, Function 'main' ⇒ main", () => {
  assert.equal(isTestSymbolNode(sym(SYMBOL_KIND_METHOD, "a test")), true);
  assert.equal(isTestSymbolNode(sym(SYMBOL_KIND_FUNCTION, "main")), false);

  assert.equal(isMainSymbolNode(sym(SYMBOL_KIND_FUNCTION, "main")), true);
  assert.equal(isMainSymbolNode(sym(SYMBOL_KIND_FUNCTION, "other")), false);
  assert.equal(isMainSymbolNode(sym(SYMBOL_KIND_METHOD, "main")), false);
});

test("isDocumentSymbolArray distinguishes DocumentSymbol[] from SymbolInformation[]", () => {
  const docSymbols = [{ name: "x", kind: 5, range: {}, children: [] }];
  const flatSymbols = [{ name: "x", kind: 5, location: {} }];
  assert.equal(isDocumentSymbolArray(docSymbols), true);
  assert.equal(isDocumentSymbolArray(flatSymbols), false);
  assert.equal(isDocumentSymbolArray([]), false);
});

// ───────────────────────── target config ─────────────────────────

test("target fallback: a valid target loads; invalid/missing → DEFAULT_TARGET", () => {
  assert.equal(resolveTarget("erlang"), "erlang");
  assert.equal(resolveTarget("nonsense"), DEFAULT_TARGET);
  assert.equal(resolveTarget(undefined), DEFAULT_TARGET);

  assert.equal(parseTargetFromJson('{ "target": "wasm" }'), "wasm");
  assert.equal(parseTargetFromJson('{ "target": "nope" }'), DEFAULT_TARGET);
  assert.equal(parseTargetFromJson("{ not json"), DEFAULT_TARGET);
  assert.equal(parseTargetFromJson("{}"), DEFAULT_TARGET);
});

test("writeTargetConfig: round-trips botopink.json preserving sibling fields", () => {
  const existing =
    '{\n  "name": "demo",\n  "target": "commonJS",\n  "src": "src/"\n}\n';
  const written = writeTargetConfig(existing, "erlang");
  const parsed = JSON.parse(written);
  assert.equal(parsed.target, "erlang");
  assert.equal(parsed.name, "demo");
  assert.equal(parsed.src, "src/");
  assert.ok(written.endsWith("\n"));
  // A missing/invalid existing body still yields a valid single-field config.
  assert.deepEqual(JSON.parse(writeTargetConfig(undefined, "beam")), {
    target: "beam",
  });
  assert.deepEqual(JSON.parse(writeTargetConfig("garbage", "wasm")), {
    target: "wasm",
  });
});

// ───────────────────────── path resolution ─────────────────────────

test("resolveBinPath: absolute as-is; relative resolved vs folder; empty → bare default", async () => {
  const base = {
    isAbsolute: path.isAbsolute,
    resolve: path.resolve,
    workspaceFolders: ["/work/project"],
    defaultBin: "botopink",
    relativeMiss: "passthrough" as const,
  };

  // Nothing configured → bare default name.
  assert.equal(
    await resolveBinPath({
      ...base,
      configured: undefined,
      exists: () => false,
    }),
    "botopink",
  );

  // Absolute → used verbatim, no fs probing.
  assert.equal(
    await resolveBinPath({
      ...base,
      configured: "/opt/botopink",
      exists: () => false,
    }),
    "/opt/botopink",
  );

  // Relative that matches a file under a folder → that absolute path.
  assert.equal(
    await resolveBinPath({
      ...base,
      configured: "bin/botopink",
      exists: (p) => p === path.resolve("/work/project", "bin/botopink"),
    }),
    path.resolve("/work/project", "bin/botopink"),
  );

  // Relative miss, passthrough variant (CLI): the configured value is returned.
  assert.equal(
    await resolveBinPath({ ...base, configured: "bin/x", exists: () => false }),
    "bin/x",
  );

  // Relative miss, undefined variant (LSP): unresolved.
  assert.equal(
    await resolveBinPath({
      ...base,
      relativeMiss: "undefined",
      configured: "bin/x",
      exists: () => false,
    }),
    undefined,
  );
});
