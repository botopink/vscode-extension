// Real TextMate tokenization of `syntaxes/botopink.tmLanguage.json`, so a
// grammar rule is checked by the scopes it actually produces instead of by
// reading its regex. Uses the same engine VS Code ships (`vscode-textmate` over
// `vscode-oniguruma`), so rule order, lookbehind and begin/end nesting behave
// exactly as they do in the editor.
//
// No `vscode` import and no editor host — the unit suite drives it directly.
import * as fs from "node:fs";
import * as path from "node:path";

// Both packages are CommonJS: under Node's ESM loader only their default
// export carries the API, so `import * as` would hand back an empty namespace.
import oniguruma from "vscode-oniguruma";
import vsctm from "vscode-textmate";

/** One token of a tokenized line: its span, its text and the scope stack over it. */
export interface ScopedToken {
  start: number;
  end: number;
  text: string;
  scopes: string[];
}

/** Tokenizes botopink source into one `ScopedToken[]` per line. */
export type Tokenize = (source: string) => ScopedToken[][];

/**
 * Loads the grammar and returns a line tokenizer. `repoRoot` is the extension
 * checkout — the grammar and the oniguruma wasm are read from it.
 */
export async function createTokenizer(repoRoot: string): Promise<Tokenize> {
  const wasm = fs.readFileSync(
    path.join(repoRoot, "node_modules", "vscode-oniguruma", "release", "onig.wasm"),
  );
  await oniguruma.loadWASM(
    wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  );

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scopeName: string) => {
      if (scopeName !== "source.botopink") return null;
      const file = path.join(repoRoot, "syntaxes", "botopink.tmLanguage.json");
      return vsctm.parseRawGrammar(fs.readFileSync(file, "utf8"), file);
    },
  });

  const grammar = await registry.loadGrammar("source.botopink");
  if (!grammar) throw new Error("source.botopink failed to load");

  return (source: string): ScopedToken[][] => {
    let stack = vsctm.INITIAL;
    const lines: ScopedToken[][] = [];
    for (const line of source.split("\n")) {
      const result = grammar.tokenizeLine(line, stack);
      lines.push(
        result.tokens.map((t) => ({
          start: t.startIndex,
          end: t.endIndex,
          text: line.slice(t.startIndex, t.endIndex),
          scopes: t.scopes,
        })),
      );
      stack = result.ruleStack;
    }
    return lines;
  };
}

/**
 * The tokens of a single line, flattened — the common case for a grammar
 * assertion, which reads one construct at a time.
 */
export function tokensOf(tokenize: Tokenize, line: string): ScopedToken[] {
  return tokenize(line).flat();
}

/**
 * The innermost botopink scope covering `offset`, or `""` when the token there
 * carries none (unscoped runs are merged into one token, so asking by text
 * would miss them). Throws when no token covers the offset.
 */
export function scopeAt(tokens: ScopedToken[], offset: number): string {
  const token = tokens.find((t) => t.start <= offset && offset < t.end);
  if (!token) throw new Error(`no token at offset ${offset}`);
  const scoped = token.scopes.filter((s) => s !== "source.botopink");
  return scoped.length === 0 ? "" : scoped[scoped.length - 1];
}

/**
 * The innermost botopink scope the grammar gives the `nth` occurrence of
 * `needle` in `line` — the form every grammar assertion is written in.
 */
export function scopeOfWord(
  tokenize: Tokenize,
  line: string,
  needle: string,
  nth = 0,
): string {
  let offset = -1;
  for (let i = 0; i <= nth; i += 1) {
    offset = line.indexOf(needle, offset + 1);
    if (offset < 0) throw new Error(`"${needle}" #${nth} not in ${JSON.stringify(line)}`);
  }
  return scopeAt(tokensOf(tokenize, line), offset);
}
