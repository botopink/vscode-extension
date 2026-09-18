// Pure-function unit tests for the Botopink VS Code extension (Front-C, C4 F0).
//
// These exercise the `vscode`-free helper modules directly, with no Electron
// host: run via Node's built-in test runner + native TypeScript support
// (`npm test` → `node --test test/`). Every import targets a `vscode`-free leaf
// module, so no `vscode` shim is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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
  DEFAULT_TEST_TARGET,
  isTarget,
  isTestTarget,
  parseTargetFromJson,
  resolveTarget,
  TARGETS,
  TEST_TARGETS,
  testTargetFor,
  testTargetNotice,
  writeTargetConfig,
} from "../src/targetConfig.ts";
import { resolveBinPath } from "../src/pathResolve.ts";
import {
  extractLexerKeywords,
  grammarKeywordRules,
} from "../scripts/lexerKeywords.ts";
import {
  renderSnippet,
  type Snippet,
  SNIPPET_FIXTURES,
  snippetModule,
} from "../scripts/snippetFixtures.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));

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

test("argsFor: test never forwards a target `botopink test` refuses", () => {
  assert.deepEqual(argsFor({ command: "test" }, "erlang"), [
    "test",
    "--target",
    "erlang",
  ]);
  for (const refused of ["beam", "wasm"]) {
    assert.deepEqual(argsFor({ command: "test" }, refused), [
      "test",
      "--target",
      DEFAULT_TEST_TARGET,
    ]);
    assert.deepEqual(
      argsFor({ command: "test", target: refused }, "erlang"),
      ["test", "--target", DEFAULT_TEST_TARGET],
    );
    assert.equal(
      taskLabel({ command: "test" }, refused),
      `test (${DEFAULT_TEST_TARGET})`,
    );
  }
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

test("target sets: TEST_TARGETS is the commonJS/erlang subset of TARGETS", () => {
  assert.deepEqual([...TARGETS], ["commonJS", "erlang", "beam", "wasm"]);
  assert.deepEqual([...TEST_TARGETS], ["commonJS", "erlang"]);
  for (const t of TEST_TARGETS) assert.ok(isTarget(t));
  assert.ok(isTestTarget(DEFAULT_TEST_TARGET));
  assert.equal(isTestTarget("beam"), false);
  assert.equal(isTestTarget("wasm"), false);
  assert.equal(isTestTarget("nonsense"), false);
});

test("testTargetFor: a testable target is kept; beam/wasm fall back with a notice", () => {
  assert.deepEqual(testTargetFor("commonJS"), { target: "commonJS" });
  assert.deepEqual(testTargetFor("erlang"), { target: "erlang" });
  assert.equal(testTargetNotice(testTargetFor("erlang")), undefined);

  for (const refused of ["beam", "wasm"]) {
    const choice = testTargetFor(refused);
    assert.deepEqual(choice, { target: DEFAULT_TEST_TARGET, replaced: refused });
    const notice = testTargetNotice(choice);
    assert.ok(notice?.includes(refused));
    assert.ok(notice?.includes(DEFAULT_TEST_TARGET));
  }
});

// ───────────────────────── grammar + snippets ─────────────────────────

// `test/lexerKeywords.json` pins the words `keywordOrIdent` in botopink-lang's
// `compiler-core/src/lexer.zig` recognises; `scripts/compilerCheck.ts` (CI job
// `compiler`) fails when the pin drifts from the lexer.
const lexerKeywords = new Set(readJson("test/lexerKeywords.json") as string[]);
const grammarRules = grammarKeywordRules(
  readJson("syntaxes/botopink.tmLanguage.json"),
);
const LITERAL_CONSTANTS = new Set(["true", "false"]);

test("grammar: every control/declaration keyword is a lexer keyword", () => {
  for (const scope of ["keyword.control.botopink", "keyword.declaration.botopink"]) {
    const words = grammarRules.get(scope);
    assert.ok(words, `grammar has no ${scope} rule`);
    const unknown = words.filter((w) => !lexerKeywords.has(w));
    assert.deepEqual(unknown, [], `${scope} lists words keywordOrIdent does not`);
  }
  const constants = grammarRules.get("constant.language.botopink") ?? [];
  const unknownConstants = constants.filter(
    (w) => !LITERAL_CONSTANTS.has(w) && !lexerKeywords.has(w),
  );
  assert.deepEqual(unknownConstants, []);
});

test("grammar: every lexer keyword is highlighted by some keyword rule", () => {
  const highlighted = new Set([...grammarRules.values()].flat());
  const missing = [...lexerKeywords].filter((w) => !highlighted.has(w));
  assert.deepEqual(missing, []);
});

// The pin above is only as good as the moment it was taken: `unknown` became a
// keyword in botopink-lang and the drift shipped, because the extension's own
// CI runs on an extension push and the keyword landed in the *other*
// repository. This test closes the local half — when a botopink-lang checkout
// is reachable (`BOTOPINK_LANG`, or the sibling `../botopink-lang` of the meta
// workspace), `npm test` re-extracts `keywordOrIdent` and compares. With no
// checkout it skips, so a standalone clone still runs green; the scheduled
// `compiler` job in `.github/workflows/test.yml` is the half that does not
// depend on anybody having one.
function reachableLangCheckout(): string | undefined {
  const candidates = [
    process.env.BOTOPINK_LANG,
    path.resolve(repoRoot, "..", "botopink-lang"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(path.join(candidate, "modules/compiler-core/src/lexer.zig"))) {
      return candidate;
    }
  }
  return undefined;
}

test("grammar: the pinned keywords equal keywordOrIdent, when a botopink-lang checkout is reachable", (t) => {
  const lang = reachableLangCheckout();
  if (!lang) {
    t.skip("no botopink-lang checkout (set BOTOPINK_LANG to one)");
    return;
  }
  const actual = extractLexerKeywords(
    fs.readFileSync(path.join(lang, "modules/compiler-core/src/lexer.zig"), "utf8"),
  );
  assert.deepEqual(
    actual,
    [...lexerKeywords].sort(),
    `test/lexerKeywords.json is out of date with keywordOrIdent in ${lang}`,
  );
});

test("snippets: every snippet has a compiler-check fixture that fills it", () => {
  const snippets = readJson("snippets.json") as Record<string, Snippet>;
  assert.deepEqual(
    Object.keys(SNIPPET_FIXTURES).sort(),
    Object.keys(snippets).sort(),
  );
  for (const [name, snippet] of Object.entries(snippets)) {
    const source = snippetModule(name, snippet);
    assert.ok(!/\$\{?\d/.test(source), `${name} leaves a tabstop unexpanded`);
  }
});

test("renderSnippet: fills tabstops by index, keeps placeholders, drops bare $N", () => {
  assert.equal(
    renderSnippet(["val ${1:name} = ${0:value};", "\t$2"], { 1: "x" }),
    "val x = value;\n    ",
  );
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
