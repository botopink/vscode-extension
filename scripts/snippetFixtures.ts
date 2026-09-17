// Snippet fixtures: how each entry of `snippets.json` is expanded into a
// compilable botopink module, so the compiler-backed check
// (`scripts/compilerCheck.ts`) can prove every snippet body parses and
// type-checks against the compiler at HEAD.
//
// Free of any `vscode` import and of any file I/O, so the unit tests can assert
// that every snippet has a fixture and renders with no placeholder left over.

/** One `snippets.json` entry. */
export interface Snippet {
  prefix: string;
  body: string[] | string;
  description?: string;
}

/**
 * How a snippet becomes a module:
 * - `values` fills tabstops by index (`${1:name}` / `$0`); a tabstop without a
 *   value keeps its placeholder text (and `$N` with no text becomes empty).
 * - `wrap` places the rendered body inside the code it needs to compile — a
 *   declaration stays at module level, a statement goes inside a host fn.
 */
export interface SnippetFixture {
  values: Record<number, string>;
  wrap: (rendered: string) => string;
}

const moduleLevel = (rendered: string): string => rendered + "\n";

const insideFn =
  (preamble = "") =>
  (rendered: string): string =>
    [
      "fn snippetHost() {",
      preamble ? "    " + preamble : "",
      indent(rendered),
      "}",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n") + "\n";

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? "    " + line : line))
    .join("\n");
}

/** Keyed by the snippet's name in `snippets.json`. */
export const SNIPPET_FIXTURES: Record<string, SnippetFixture> = {
  Function: {
    values: { 1: "add", 2: "a: i32", 3: "i32", 0: "return a;" },
    wrap: moduleLevel,
  },
  "Public function": {
    values: { 1: "add", 2: "a: i32", 3: "i32", 0: "return a;" },
    wrap: moduleLevel,
  },
  "Value binding": {
    values: { 1: "answer", 0: "42" },
    wrap: insideFn(),
  },
  "Mutable variable": {
    values: { 1: "count", 0: "0" },
    wrap: insideFn(),
  },
  "Public value": {
    values: { 1: "LIMIT", 0: "10" },
    wrap: moduleLevel,
  },
  Import: {
    values: { 1: "math", 2: "std" },
    wrap: moduleLevel,
  },
  "Import from std": {
    values: { 1: "math" },
    wrap: moduleLevel,
  },
  "Test block": {
    values: { 1: "adds", 2: "got", 0: "1 + 1", 3: "2", 4: "one plus one" },
    wrap: moduleLevel,
  },
  Assertion: {
    values: { 1: "1 == 1", 0: "holds" },
    wrap: (rendered) => `test "assertion" {\n${indent(rendered)}\n}\n`,
  },
  "Iterator function": {
    values: { 1: "single", 2: "n: i32", 3: "i32", 0: "n" },
    wrap: moduleLevel,
  },
  "Result function": {
    values: {
      1: "parsePort",
      2: "s: string",
      3: "i32",
      4: "string",
      0: 'if (s == "") { throw "empty"; };\n\treturn 80;',
    },
    wrap: moduleLevel,
  },
  "External declaration": {
    values: {
      1: "process",
      2: "exit",
      3: "erlang",
      4: "halt",
      5: "halt",
      6: "code: i32",
      7: "void",
    },
    wrap: moduleLevel,
  },
  "Type (record)": {
    values: {
      1: "Point",
      2: "x",
      3: "i32",
      0: "fn norm(self: Self) -> i32 {\n\t\treturn self.x;\n\t}",
    },
    wrap: moduleLevel,
  },
  "Type (enum)": {
    values: { 1: "Color", 2: "Red", 0: "Green," },
    wrap: moduleLevel,
  },
  Behavior: {
    values: { 1: "Shape", 2: "area", 0: " -> i32;" },
    wrap: moduleLevel,
  },
  "Case expression": {
    values: { 1: "n", 2: "1", 3: '"one"', 0: '"other"' },
    wrap: insideFn("val n = 1;"),
  },
  "If expression": {
    values: { 1: "true", 0: "val a = 1;" },
    wrap: insideFn(),
  },
  "If-else expression": {
    values: { 1: "true", 2: "1", 0: "2" },
    wrap: insideFn(),
  },
  "Loop over collection": {
    values: { 1: "xs", 2: "x", 0: "val y = x;" },
    wrap: insideFn("val xs = [1, 2, 3];"),
  },
  "Loop while": {
    values: { 1: "attempts < 3", 0: "attempts = attempts + 1;" },
    wrap: insideFn("var attempts = 0;"),
  },
  "Loop with break value": {
    values: { 1: "doubled", 2: "xs", 3: "x", 0: "x * 2" },
    wrap: insideFn("val xs = [1, 2, 3];"),
  },
  "Comptime expression": {
    values: { 0: "1 + 2" },
    wrap: (rendered) => `val three = ${rendered};\n`,
  },
  "Try with catch": {
    values: { 1: "r", 2: "parsePort()", 0: "8080" },
    wrap: (rendered) =>
      [
        "#[@result]",
        "fn parsePort() -> @Result<i32, string> {",
        "    return 80;",
        "}",
        "",
        insideFn()(rendered),
      ].join("\n"),
  },
  "Implement for record": {
    values: {
      1: "PointShape",
      2: "Shape",
      3: "Point",
      4: "area",
      0: "return 0;",
    },
    wrap: (rendered) =>
      [
        "behavior Shape {",
        "    fn area(self: Self) -> i32;",
        "}",
        "",
        "type Point(x: i32)",
        "",
        rendered,
        "",
      ].join("\n"),
  },
};

const TABSTOP = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;

/** Expands a snippet body with the fixture's tabstop values. */
export function renderSnippet(
  body: string[] | string,
  values: Record<number, string>,
): string {
  const text = Array.isArray(body) ? body.join("\n") : body;
  return text
    .replace(TABSTOP, (_match, withText, placeholder, bare) => {
      const index = Number(withText ?? bare);
      if (Object.prototype.hasOwnProperty.call(values, index)) {
        return values[index];
      }
      return placeholder ?? "";
    })
    .replace(/\t/g, "    ");
}

/** Renders a snippet into the full module text its fixture describes. */
export function snippetModule(name: string, snippet: Snippet): string {
  const fixture = SNIPPET_FIXTURES[name];
  if (!fixture) {
    throw new Error(`snippet "${name}" has no fixture in snippetFixtures.ts`);
  }
  return fixture.wrap(renderSnippet(snippet.body, fixture.values));
}
