// Keyword extraction shared by the unit tests and the compiler-backed check.
// Pure string functions — no `vscode`, no file I/O.

/**
 * Returns the sorted words `keywordOrIdent` in botopink-lang's
 * `compiler-core/src/lexer.zig` maps to a keyword token (every
 * `std.mem.eql(u8, text, "<word>")` in the function, minus `_`).
 */
export function extractLexerKeywords(lexerZig: string): string[] {
  const start = lexerZig.indexOf("fn keywordOrIdent(");
  if (start < 0) throw new Error("keywordOrIdent not found in lexer.zig");
  const end = lexerZig.indexOf("return .identifier;", start);
  if (end < 0) throw new Error("keywordOrIdent has no identifier fallback");
  const words = new Set<string>();
  const pattern = /std\.mem\.eql\(u8, text, "([^"]+)"\)/g;
  for (const match of lexerZig.slice(start, end).matchAll(pattern)) {
    if (match[1] !== "_") words.add(match[1]);
  }
  return [...words].sort();
}

/** The word alternations of the grammar's keyword rules, by scope name. */
export function grammarKeywordRules(grammar: unknown): Map<string, string[]> {
  const rules = new Map<string, string[]>();
  const patterns = (
    grammar as {
      repository?: { keywords?: { patterns?: { name?: string; match?: string }[] } };
    }
  ).repository?.keywords?.patterns;
  for (const rule of patterns ?? []) {
    if (!rule.name || !rule.match) continue;
    const alternation = /^\\b\(([^)]*)\)\\b$/.exec(rule.match);
    if (!alternation) {
      throw new Error(`keyword rule ${rule.name} is not a \\b(a|b|…)\\b alternation`);
    }
    rules.set(rule.name, alternation[1].split("|"));
  }
  return rules;
}

/**
 * Returns the sorted type names `Env.registerBuiltins` binds in botopink-lang's
 * `compiler-core/src/comptime/env.zig` (every quoted word of its `primitives`
 * array), minus `Self` — a keyword token of its own, which the grammar paints
 * with `constant.language`, not as a primitive type.
 */
export function extractBuiltinTypes(envZig: string): string[] {
  const start = envZig.indexOf("pub fn registerBuiltins(");
  if (start < 0) throw new Error("registerBuiltins not found in env.zig");
  const open = envZig.indexOf("const primitives = [_][]const u8{", start);
  if (open < 0) throw new Error("registerBuiltins has no primitives array");
  const end = envZig.indexOf("};", open);
  if (end < 0) throw new Error("the primitives array is not closed");
  const words = new Set<string>();
  for (const match of envZig.slice(open, end).matchAll(/"([^"]+)"/g)) {
    if (match[1] !== "Self") words.add(match[1]);
  }
  return [...words].sort();
}

/**
 * The words the grammar paints `support.type.primitive.botopink`.
 */
export function grammarPrimitiveTypes(grammar: unknown): string[] {
  const patterns = (
    grammar as {
      repository?: { constants?: { patterns?: { name?: string; match?: string }[] } };
    }
  ).repository?.constants?.patterns;
  for (const rule of patterns ?? []) {
    if (rule.name !== "support.type.primitive.botopink" || !rule.match) continue;
    const alternation = /^\\b\(([^)]*)\)\\b$/.exec(rule.match);
    if (!alternation) {
      throw new Error("the primitive-type rule is not a \\b(a|b|…)\\b alternation");
    }
    return alternation[1].split("|").sort();
  }
  throw new Error("no support.type.primitive.botopink rule in the grammar");
}
