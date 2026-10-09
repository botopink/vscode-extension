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
// `is`, `when` guards, `loop` / `while` / `for`, `A...B` pattern ranges, and the
// effect surface of botopink-lang front 24 (the return wrapper decides the
// effect; `async` / `iter` / `stream` are contextual words).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
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

const readJson = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));

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

test("grammar: an enum-shaped `type` with sections names every level a type", () => {
  // Decision 8 §5.3b: a section declares a type of its own (`Token.Text`,
  // `Token.Text.Size`), written with the same path its values use. Every name
  // on the way down is a type name, and a payload variant's label is a label.
  const line = "type Token { Text { Bold, Size { Sm } }, Hover(inner: Token[]) }";
  assert.equal(scope(line, "type"), "keyword.declaration.botopink");
  for (const name of ["Token", "Text", "Bold", "Size", "Sm", "Hover"]) {
    assert.equal(scope(line, name), "entity.name.type.botopink", name);
  }
  assert.equal(scope(line, "inner"), "variable.parameter.botopink");
});

test("grammar: the removed spellings are painted as no keyword", () => {
  // `record`, `enum` and `interface` left the lexer with the surface cutover;
  // `new` and `delegate` with front 06 N27. None of them may come back as a
  // keyword — the editor would teach a parse error. (`while` left with
  // decision 8 §10 and came back with decision 105; it is a keyword again.)
  assert.equal(scope("val r = record { x: 1 };", "record"), "");
  assert.equal(scope("val c = enum { Red };", "enum"), "");
  assert.equal(scope("pub interface Show { }", "interface"), "");
  assert.equal(scope('throw new Error("x");', "new"), "");
  assert.equal(scope("val d = delegate;", "delegate"), "");
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

  assert.equal(scope("for (0..n) { i -> }", ".."), "keyword.operator.range.botopink");
  assert.equal(scope("val p = #(0, ..);", ".."), "keyword.operator.range.botopink");
});

test("grammar: `??` is one operator, and not the `?` of an optional type", () => {
  // `a ?? b` gives an optional its default (decision 28, botopink-lang
  // `fb230e5`). Without its own rule the `?` rule took the two characters one
  // at a time — two tokens, both `keyword.operator.optional.botopink`, the
  // scope that paints the `?` of `?i32` — so a theme could not tell an operator
  // from a type marker. Same class as `...` over `..` above.
  const line = "val got = maybe ?? 7;";
  const q = tokensOf(tokenize, line).find((t) => t.text.startsWith("?"));
  assert.ok(q, "no `?` token on the line");
  assert.equal(q.text, "??", "the `?` rule split `??`");
  assert.equal(q.scopes.at(-1), "keyword.operator.nullish.botopink");

  // The two neighbours it must not swallow, and must not be confused with.
  assert.equal(scope("val o: ?i32 = null;", "?"), "keyword.operator.optional.botopink");
  assert.equal(
    scope("val b = a?.c;", "?."),
    "keyword.operator.optional-chaining.botopink",
  );
});

test("grammar: the `case` snippet's arms are `Pattern { body }`, and paint as such", () => {
  // The snippet is the shape the editor teaches, so it is the shape the grammar
  // is pinned against: a regression in `botopink.tmLanguage.json` reds here, and
  // a snippet flipped back to the `pattern -> result;` arms reds on the `->`
  // assertion. The compiler half — that the filled body passes `botopink check`
  // — is `npm run compiler-check`; this half is what it paints.
  const body = (readJson("snippets.json") as Record<string, { body: string[] }>)[
    "Case expression"
  ].body.join("\n");
  assert.ok(!body.includes("->"), "the `case` snippet still writes arrow arms");
  assert.match(body, /\$\{2:pattern\} \{ \$\{3:result\} \}/);
  assert.match(body, /_ \{ \$\{0:fallback\} \}/);

  const filled = 'case n { 1 { "one" } _ { "other" } }';
  assert.equal(scope(filled, "case"), "keyword.control.botopink");
  assert.equal(scope(filled, "_"), "comment.unused.botopink");
  assert.equal(scope(filled, '"one"'), "string.quoted.double.botopink");
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

test("grammar: every primitive the checker registers is painted, and nothing else", () => {
  // `Env.registerBuiltins` (compiler-core/src/comptime/env.zig), minus `Self`
  // and `any`, plus `unknown`. `npm run compiler-check` compares the two lists
  // against a real checkout; this pins what the tokenizer actually does with
  // them, which a list comparison cannot see.
  for (const t of [
    "i8", "i16", "i32", "i64", "isize",
    "u8", "u16", "u32", "u64", "usize",
    "f32", "f64", "bool", "string", "void", "v128", "noreturn", "unknown",
  ]) {
    assert.equal(
      scope(`val a: ${t} = x;`, t),
      "support.type.primitive.botopink",
      t,
    );
  }

  // `never` is registered nowhere — `fn c(x: never)` is `error: unknown type
  // 'never'` — and used to be painted as a standard-library type.
  assert.notEqual(scope("val a: never = x;", "never"), "support.type.primitive.botopink");
});

test("grammar: `|` is a union type, apart from `||` and `|>`", () => {
  assert.equal(
    scope("val v: i32 | string = 1;", "|"),
    "keyword.operator.type.union.botopink",
  );
  assert.equal(scope("val b = a || c;", "||"), "keyword.operator.logical.botopink");
  assert.equal(scope("val b = xs |> f;", "|>"), "keyword.operator.pipe.botopink");
});

// ── control flow and effects (decision 105; botopink-lang front 24) ───────────

test("grammar: `loop`, `while` and `for` are control keywords in every form", () => {
  for (const [line, word] of [
    ["loop { }", "loop"],
    ["while (attempts < 3) { }", "while"],
    ["for (xs) { x -> }", "for"],
    ["for (0..n) { i -> }", "for"],
    ["for await (s) { x -> }", "for"],
    ["for await (s) { x -> }", "await"],
  ] as const) {
    assert.equal(scope(line, word), "keyword.control.botopink", line);
  }
});

test("grammar: `iter` / `stream` are keywords only before `loop` / `while` / `for`", () => {
  for (const [line, word] of [
    ["val xs = iter loop { yield 1; };", "iter"],
    ["val xs = iter while (i > 0) { yield i; };", "iter"],
    ["val xs = iter for (ys) { y -> yield y; };", "iter"],
    ["val s = stream loop { yield now(); };", "stream"],
    ["val s = stream while (more) { yield 1; };", "stream"],
    ["val s = stream for (ids) { id -> yield try await fetchUser(id); };", "stream"],
  ] as const) {
    assert.equal(scope(line, word), "keyword.control.generator.botopink", line);
    // The loop word after the prefix keeps its own scope.
    assert.equal(
      scope(line, line.match(/(?:iter|stream) (\w+)/)![1]),
      "keyword.control.botopink",
      line,
    );
  }

  // Anywhere else they are ordinary names (the guide's § 6.1 list).
  assert.equal(scope("val it = g.iter();", "iter"), "entity.name.function.botopink");
  assert.equal(scope("val stream = 1;", "stream"), "");
  assert.equal(scope('val s = http.stream("x");', "stream"), "entity.name.function.botopink");
  assert.equal(scope("val iter = stream;", "iter"), "");
  assert.equal(scope("val iter = stream;", "stream"), "");
  assert.equal(scope("val loops = xs.iter.loop;", "iter"), "");
});

test("grammar: `async` is a keyword only before `{`", () => {
  assert.equal(
    scope("val t = async { return 1; };", "async"),
    "keyword.control.async.botopink",
  );
  assert.equal(
    scope("fn f() { return async{ return 1; }; }", "async"),
    "keyword.control.async.botopink",
  );

  // `import {async} from "std"` and `async.allOf(…)` name the std module.
  assert.equal(scope('import {async} from "std";', "async"), "");
  assert.equal(scope("val all = async.allOf(ts);", "async"), "");
  assert.equal(scope("val async = 1;", "async"), "");
});

test("grammar: `try await` is two control keywords", () => {
  const line = "val u = try await fetchUser(1) catch null;";
  assert.equal(scope(line, "try"), "keyword.control.botopink");
  assert.equal(scope(line, "await"), "keyword.control.botopink");
  assert.equal(scope(line, "catch"), "keyword.control.botopink");
});

test("grammar: the effect wrappers are builtin types", () => {
  for (const [line, wrapper] of [
    ["fn f() -> @Result<i32, string> { }", "@Result"],
    ["fn f() -> @Task<@Result<User, string>> { }", "@Task"],
    ["fn f() -> @Component<Element> { }", "@Component"],
    ["fn f() -> @Iterator<i32> { }", "@Iterator"],
    ["fn f() -> @Stream<@Result<User, string>> { }", "@Stream"],
    ["pub type Element() implement @Renderable;", "@Renderable"],
  ] as const) {
    assert.equal(scope(line, wrapper), "support.type.builtin.botopink", line);
  }
  // The inner wrapper of a nested return is a builtin too.
  assert.equal(
    scope("fn f() -> @Task<@Result<User, string>> { }", "@Result"),
    "support.type.builtin.botopink",
  );
  // A user `@builtin` call is not a type.
  assert.equal(scope("@println(1);", "@println"), "support.function.builtin.botopink");
});

test("grammar: the wrappers front 24 retired are painted deprecated, never as current types", () => {
  for (const wrapper of [
    "@Future",
    "@Use",
    "@Generator",
    "@ResultGenerator",
    "@FutureGenerator",
    "@AsyncGenerator",
    "@AsyncIterator",
  ]) {
    const line = `fn f() -> ${wrapper}<i32> { }`;
    assert.equal(scope(line, wrapper), "invalid.deprecated.builtin.botopink", line);
  }
});

test("grammar: the owner marker decision 354 retired is painted deprecated", () => {
  const line = "type Element() implement @Context<ElementBase>";
  assert.equal(scope(line, "@Context"), "invalid.deprecated.builtin.botopink", line);
});

test("grammar: an effect annotation is painted deprecated inside its attribute", () => {
  for (const effect of [
    "@result",
    "@future",
    "@use",
    "@generator",
    "@resultGenerator",
    "@futureGenerator",
    "@iterator",
    "@asyncGenerator",
    "@context",
  ]) {
    const line = `#[${effect}]`;
    assert.equal(scope(line, effect), "invalid.deprecated.effect-annotation.botopink", line);
    assert.equal(scope(line, "#["), "punctuation.definition.attribute.botopink");
  }
  // Host bindings stay an attribute: they are not an effect.
  assert.equal(
    scope('#[@External.Node("m", "f")]', "@External"),
    "entity.name.function.attribute.botopink",
  );
});

test("grammar: no snippet writes an effect annotation or a retired wrapper", () => {
  const snippets = readJson("snippets.json") as Record<string, { body: string[] }>;
  const retired =
    /#\[@(result|future|use|generator|resultGenerator|futureGenerator|iterator|asyncGenerator|context)\b|@(Future|Use|Generator|ResultGenerator|FutureGenerator|AsyncGenerator|AsyncIterator)\b|\bloop \(/;
  for (const [name, snippet] of Object.entries(snippets)) {
    assert.doesNotMatch(snippet.body.join("\n"), retired, name);
  }
});
