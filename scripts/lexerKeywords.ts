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
