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
 * Walks a symbol tree depth-first, yielding each symbol together with the symbol
 * that declares it — `undefined` for a top-level one, which is what
 * `isTestSymbolNode` needs.
 */
export function* flattenSymbolNodesWithParent<T extends SymbolNode>(
  symbols: readonly T[],
  parent?: T,
): Generator<{ symbol: T; parent?: T }> {
  for (const symbol of symbols) {
    yield { symbol, parent };
    if (symbol.children && symbol.children.length > 0) {
      yield* flattenSymbolNodesWithParent(symbol.children as T[], symbol);
    }
  }
}

/**
 * A `test "…"` block is a `Method` symbol named after the test string — and so
 * is a method of a `type`, an `enum` or a `behavior` since botopink-lang's
 * language server started emitting the right kind for them (decision 7 of
 * 1.0.5-beta; `engine.zig` `collectChildren`).
 *
 * The two are told apart **by their place in the tree**, not by the kind: a
 * `test` block is a child of the *file*, a method is a child of the declaration
 * it belongs to. `parent === undefined` therefore means "top level" and is the
 * whole test. The LSP protocol has no `Test` kind, so the alternative would have
 * been to abuse one, or to invent a marker in `detail` that the server writes
 * and the extension agrees on; the parent is already in the tree.
 *
 * `parent` is a required argument on purpose: a caller that flattens the tree
 * and forgets it would silently list every method in the workspace as a
 * runnable test, which is the defect this replaced.
 */
export function isTestSymbolNode(
  symbol: SymbolNode,
  parent: SymbolNode | undefined,
): boolean {
  return symbol.kind === SYMBOL_KIND_METHOD && parent === undefined;
}

/** The `test "…"` blocks of a document, in source order. */
export function* testSymbolNodes<T extends SymbolNode>(
  symbols: readonly T[],
): Generator<T> {
  for (const symbol of symbols) {
    if (isTestSymbolNode(symbol, undefined)) yield symbol;
  }
}

/** `fn main` is exposed as a `Function` symbol named `main`. */
export function isMainSymbolNode(symbol: SymbolNode): boolean {
  return symbol.kind === SYMBOL_KIND_FUNCTION && symbol.name === "main";
}
