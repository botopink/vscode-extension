// Grammar tests — what `syntaxes/botopink.tmLanguage.json` actually paints.
//
// `unit.test.ts` only checks that the grammar's keyword alternations agree with
// the lexer's table; a rule can name the right word and still match nothing, or
// match the wrong span. These tests run the grammar through the tokenizer VS
// Code itself uses (`vscode-textmate` over `vscode-oniguruma`), so rule order,
// lookbehind and begin/end nesting behave here exactly as they do in the editor.
//
// The surface under test is the 1.0.3 one (`specs/1.0.4-beta/MIGRATION.md`) plus
// decision 8: `type` / `behavior`, `#(…)` tuples with labels, unions, `unknown`,
// `is`, `when` guards, `loop`, `A...B` pattern ranges, `#[@effect]`.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTokenizer,
  scopeOfWord,
  tokensOf,
  type Tokenize,
} from "../scripts/tokenize.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let tokenize: Tokenize;
before(async () => {
  tokenize = await createTokenizer(repoRoot);
});

/** The scope the grammar gives the `nth` occurrence of `word` on `line`. */
const scope = (line: string, word: string, nth = 0): string =>
  scopeOfWord(tokenize, line, word, nth);

// ── declarations ─────────────────────────────────────────────────────────────

test("grammar: `type` and `behavior` are declaration keywords, and name a type", () => {
  assert.equal(scope("type Point(x: i32)", "type"), "keyword.declaration.botopink");
  assert.equal(scope("type Point(x: i32)", "Point"), "entity.name.type.botopink");

  assert.equal(scope("pub behavior Show { }", "pub"), "keyword.declaration.botopink");
  assert.equal(
    scope("pub behavior Show { }", "behavior"),
    "keyword.declaration.botopink",
  );
  assert.equal(scope("pub behavior Show { }", "Show"), "entity.name.type.botopink");
});

test("grammar: the removed spellings are painted as no keyword", () => {
  // `record`, `enum` and `interface` left the lexer with the surface cutover;
  // `new` and `delegate` with front 06 N27; `while` with decision 8 §10. None
  // of them may come back as a keyword — the editor would teach a parse error.
  assert.equal(scope("val r = record { x: 1 };", "record"), "");
  assert.equal(scope("val c = enum { Red };", "enum"), "");
  assert.equal(scope("pub interface Show { }", "interface"), "");
  assert.equal(scope('throw new Error("x");', "new"), "");
  assert.equal(scope("val d = delegate;", "delegate"), "");
  assert.equal(scope("val w = while;", "while"), "");
});

// ── tuples (decision 8 §6) ───────────────────────────────────────────────────

test("grammar: a `#(…)` tuple opens, closes, and labels its elements as properties", () => {
  const line = "fn load() -> #(name: string, pop: i32) { }";
  assert.equal(scope(line, "#("), "punctuation.definition.tuple.begin.botopink");
  assert.equal(scope(line, "name"), "variable.other.property.botopink");
  assert.equal(scope(line, "pop"), "variable.other.property.botopink");
  assert.equal(scope(line, "string"), "support.type.primitive.botopink");
  // The `)` that closes the tuple — not the empty parameter list before it.
  assert.equal(scope(line, ") { }"), "punctuation.definition.tuple.end.botopink");
});

test("grammar: a nested `(` inside a tuple does not close it", () => {
  // The tuple is a begin/end rule; without `#parenGroup` the first inner `)`
  // would end it and the rest of the line would lose its scopes.
  for (const [line, ends] of [
    ["val r = #(f(1), 2);", 1],
    ["val r = #((1 + 2), 3);", 1],
    ["val r = #(#(1, 2), 3);", 2],
  ] as const) {
    const tokens = tokensOf(tokenize, line);
    const closers = tokens.filter((t) =>
      t.scopes.includes("punctuation.definition.tuple.end.botopink"),
    );
    assert.equal(closers.length, ends, line);
    // The `;` after the tuple is outside it: the block closed where it should.
    assert.equal(scope(line, ";"), "", `${line}: the tuple leaked past its close`);
  }
});

test("grammar: a tuple type spanning several lines closes on its own line", () => {
  const source = [
    "fn load() -> #(",
    "    name: string,",
    ") { }",
    "val after = 1;",
  ].join("\n");
  const lines = tokenize(source);
  assert.equal(
    lines[1].find((t) => t.text === "name")?.scopes.at(-1),
    "variable.other.property.botopink",
  );
  assert.equal(
    lines[2][0].scopes.at(-1),
    "punctuation.definition.tuple.end.botopink",
  );
  // The declaration after it is tokenized normally — the block did not leak.
  assert.equal(lines[3][0].scopes.at(-1), "keyword.declaration.botopink");
});

test("grammar: `#(` inside a string or a comment opens no tuple", () => {
  assert.equal(
    scope('val s = "a #(b) c";', "#("),
    "string.quoted.double.botopink",
  );
  assert.equal(
    scope("// a #(b comment", "#("),
    "comment.line.double-slash.botopink",
  );
});

// ── patterns and guards (decision 8 §5) ──────────────────────────────────────

test("grammar: `A...B` is one inclusive-range operator, `..` stays iteration", () => {
  // `...` must win over `..`: the `..` rule alone took two dots and left the
  // third unscoped, so a pattern range read as a range plus a stray dot.
  const arm = 'case n { 1...9 { "digit" } _ { "other" } }';
  const dots = tokensOf(tokenize, arm).find((t) => t.text.startsWith(".."));
  assert.ok(dots, "no range token in the arm");
  assert.equal(dots.text, "...", "`..` split the inclusive range");
  assert.equal(dots.scopes.at(-1), "keyword.operator.range.inclusive.botopink");

  assert.equal(scope("loop (0..n) { i -> }", ".."), "keyword.operator.range.botopink");
  assert.equal(scope("val p = #(0, ..);", ".."), "keyword.operator.range.botopink");
});

test("grammar: `when` is a guard after a pattern, an identifier anywhere else", () => {
  const guarded = "Option.Some(value: v) when (v is string) { v.length }";
  assert.equal(scope(guarded, "when"), "keyword.control.guard.botopink");
  assert.equal(scope(guarded, "is"), "keyword.control.botopink");

  // Not after a pattern, not before `(` — an ordinary name.
  assert.equal(scope("val when = 1;", "when"), "");
  assert.equal(scope("val x = when;", "when"), "");
});

test("grammar: `.Variant` shorthand is an enum member, `Option.Some` a type", () => {
  assert.equal(
    scope("case o { .None { 0 } }", "None"),
    "variable.other.enummember.botopink",
  );
  assert.equal(scope("val o = Option.Some(1);", "Option"), "entity.name.type.botopink");
  assert.equal(scope("val o = Option.Some(1);", "Some"), "entity.name.type.botopink");
});

// ── types (decision 8 §2, §3) ────────────────────────────────────────────────

test("grammar: `unknown` is a primitive type and `any` is not a word we paint", () => {
  assert.equal(scope("val a: unknown = x;", "unknown"), "support.type.primitive.botopink");
  // Decision 8 §2.5: there is no `any`. It must not look like a type.
  assert.equal(scope("val a: any = x;", "any"), "");
});

test("grammar: `|` is a union type, apart from `||` and `|>`", () => {
  assert.equal(
    scope("val v: i32 | string = 1;", "|"),
    "keyword.operator.type.union.botopink",
  );
  assert.equal(scope("val b = a || c;", "||"), "keyword.operator.logical.botopink");
  assert.equal(scope("val b = xs |> f;", "|>"), "keyword.operator.pipe.botopink");
});

// ── control flow and effects (decision 8 §9, §10) ────────────────────────────

test("grammar: `loop` is a control keyword in every one of its forms", () => {
  for (const line of [
    "loop (xs) { x -> }",
    "loop (0..n) { i -> }",
    "loop (attempts < 3) { }",
    "loop { }",
  ]) {
    assert.equal(scope(line, "loop"), "keyword.control.botopink", line);
  }
});

test("grammar: an `#[@effect]` annotation names its effect inside the attribute", () => {
  for (const effect of ["@result", "@future", "@iterator", "@asyncGenerator"]) {
    const line = `#[${effect}]`;
    assert.equal(scope(line, effect), "entity.name.function.attribute.botopink", line);
    assert.equal(scope(line, "#["), "punctuation.definition.attribute.botopink");
  }
  assert.equal(
    scope("fn f() -> @Result<i32, string> { }", "@Result"),
    "support.type.builtin.botopink",
  );
});
