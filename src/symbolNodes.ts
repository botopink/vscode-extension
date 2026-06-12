// Pure, `vscode`-free predicates over the document-symbol tree, so they are
// unit-testable without a host. `symbols.ts` wraps these for `vscode`'s typed
// `DocumentSymbol` (which structurally satisfies `SymbolNode`).

/** The slice of `vscode.DocumentSymbol` these predicates rely on. */
export interface SymbolNode {
  kind: number;
  name: string;
  children: SymbolNode[];
}

// `vscode.SymbolKind` numeric values (0-based, matching the editor's enum, not
// the 1-based LSP wire enum). Method = 5, Function = 11.
export const SYMBOL_KIND_METHOD = 5;
export const SYMBOL_KIND_FUNCTION = 11;

/**
 * Distinguishes a hierarchical `DocumentSymbol[]` from a flat
 * `SymbolInformation[]`: only the former carries `range` + `children`.
 */
export function isDocumentSymbolArray(symbols: readonly unknown[]): boolean {
  if (symbols.length === 0) {
    return false;
  }
  const first = symbols[0];
  return (
    typeof first === "object" &&
    first !== null &&
    "range" in first &&
    "children" in first
  );
}

/** Walks a symbol tree depth-first, yielding every symbol. */
export function* flattenSymbolNodes<T extends SymbolNode>(
  symbols: readonly T[],
): Generator<T> {
  for (const symbol of symbols) {
    yield symbol;
    if (symbol.children && symbol.children.length > 0) {
      yield* flattenSymbolNodes(symbol.children as T[]);
    }
  }
}

/**
 * Test blocks are exposed by the LSP as `Method` symbols whose name is the test
 * string (landed in tooling-update F3).
 */
export function isTestSymbolNode(symbol: SymbolNode): boolean {
  return symbol.kind === SYMBOL_KIND_METHOD;
}

/** `fn main` is exposed as a `Function` symbol named `main`. */
export function isMainSymbolNode(symbol: SymbolNode): boolean {
  return symbol.kind === SYMBOL_KIND_FUNCTION && symbol.name === "main";
}
