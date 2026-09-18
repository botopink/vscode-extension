// Compiler-backed check for what the extension ships (7g).
//
// Proves, against a real `botopink` binary and botopink-lang checkout, that:
//   1. the lexer keyword list pinned in `test/lexerKeywords.json` (which the
//      unit tests compare the grammar against) still equals the keywords
//      `keywordOrIdent` recognises in `compiler-core/src/lexer.zig`;
//   2. every `snippets.json` body, expanded by its fixture, passes
//      `botopink check` — so no snippet offers syntax the compiler rejects;
//   3. the grammar's `support.type.primitive` words are exactly the types
//      `Env.registerBuiltins` registers, minus `any` (decision 8 §2.5) and plus
//      `unknown` (decision 8 §2, registered by front 06) — so the editor never
//      paints a word no program can name, nor leaves a real one unpainted.
//
// Usage:
//   node --experimental-strip-types scripts/compilerCheck.ts \
//     --lang <botopink-lang checkout> [--bin <botopink binary>]
// `--bin` defaults to `<lang>/zig-out/bin/botopink`. Exits 1 on any failure.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractBuiltinTypes,
  extractLexerKeywords,
  grammarPrimitiveTypes,
} from "./lexerKeywords.ts";
import { type Snippet, snippetModule } from "./snippetFixtures.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const lang = argValue("--lang");
if (!lang) {
  console.error("usage: compilerCheck.ts --lang <botopink-lang dir> [--bin <botopink>]");
  process.exit(2);
}
const bin = path.resolve(argValue("--bin") ?? path.join(lang, "zig-out", "bin", "botopink"));

let failures = 0;
function fail(message: string): void {
  failures += 1;
  console.error(`FAIL ${message}`);
}

// ── 1. pinned lexer keywords ────────────────────────────────────────────────
const lexerSource = fs.readFileSync(
  path.join(lang, "modules", "compiler-core", "src", "lexer.zig"),
  "utf8",
);
const actual = extractLexerKeywords(lexerSource);
const pinned = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "test", "lexerKeywords.json"), "utf8"),
) as string[];
if (JSON.stringify(actual) !== JSON.stringify([...pinned].sort())) {
  fail(
    "test/lexerKeywords.json is out of date with keywordOrIdent:\n" +
      `  lexer:  ${actual.join(" ")}\n  pinned: ${[...pinned].sort().join(" ")}`,
  );
} else {
  console.log(`ok lexer keywords match (${actual.length})`);
}

// ── 2. every snippet passes `botopink check` ────────────────────────────────
const snippets = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "snippets.json"), "utf8"),
) as Record<string, Snippet>;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "botopink-snippets-"));
try {
  for (const [name, snippet] of Object.entries(snippets)) {
    const project = fs.mkdtempSync(path.join(scratch, "p-"));
    fs.mkdirSync(path.join(project, "src"));
    fs.writeFileSync(
      path.join(project, "botopink.json"),
      JSON.stringify({ name: "snippet", version: "0.0.0", target: "commonJS", src: "src/" }) + "\n",
    );
    let source: string;
    try {
      source = snippetModule(name, snippet);
    } catch (err) {
      fail(`${name}: ${(err as Error).message}`);
      continue;
    }
    fs.writeFileSync(path.join(project, "src", "main.bp"), source);
    const result = spawnSync(bin, ["check"], { cwd: project, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0 || /\berror\b/.test(stripAnsi(output))) {
      fail(`snippet "${name}" does not pass \`botopink check\`:\n--- source\n${source}--- output\n${output}`);
    } else {
      console.log(`ok snippet "${name}"`);
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

// ── 3. the grammar's primitive types are the checker's ──────────────────────
//
// The same defect class as 1, one rule over: a name the compiler registers
// nowhere painted `type [defaultLibrary]` teaches a type that does not exist
// (`never` was painted for years; `fn c(x: never)` is `error: unknown type
// 'never'`), and a registered one left out is silently plain text.
//
// Two deliberate deltas, both from decision 8, both asserted here so they
// cannot rot into an accident:
//   - `any` is registered (the unconstrained error channel of `@Future<T, E =
//     any>`) but §2.5 gives the user no `any`, so the grammar must not paint it;
//   - `unknown` is §2's type, painted ahead of front 06 registering it.
const envSource = fs.readFileSync(
  path.join(lang, "modules", "compiler-core", "src", "comptime", "env.zig"),
  "utf8",
);
const grammar = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "syntaxes", "botopink.tmLanguage.json"), "utf8"),
) as unknown;
const expectedTypes = [
  ...extractBuiltinTypes(envSource).filter((t) => t !== "any"),
  "unknown",
].sort();
const paintedTypes = grammarPrimitiveTypes(grammar);
if (JSON.stringify(paintedTypes) !== JSON.stringify(expectedTypes)) {
  const extra = paintedTypes.filter((t) => !expectedTypes.includes(t));
  const missing = expectedTypes.filter((t) => !paintedTypes.includes(t));
  fail(
    "the grammar's primitive-type list is out of date with Env.registerBuiltins:" +
      (extra.length ? `\n  painted but registered nowhere: ${extra.join(" ")}` : "") +
      (missing.length ? `\n  registered but not painted: ${missing.join(" ")}` : ""),
  );
} else {
  console.log(`ok primitive types match (${paintedTypes.length})`);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("compiler check passed");
