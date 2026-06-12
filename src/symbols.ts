import * as vscode from "vscode";
import {
  flattenSymbolNodes,
  isDocumentSymbolArray as isDocumentSymbolArrayNode,
  isMainSymbolNode,
  isTestSymbolNode,
} from "./symbolNodes";

/**
 * Fetches document symbols for a `.bp` document.
 *
 * The extension owns no compiler knowledge: symbols come from `botopink-lsp`
 * via the standard `documentSymbol` request. Going through
 * `vscode.executeDocumentSymbolProvider` (rather than the raw LanguageClient)
 * lets VS Code route to the registered LSP and normalises the response into
 * `DocumentSymbol`s, while staying resilient if the server is still starting.
 */
export async function fetchDocumentSymbols(
  uri: vscode.Uri,
): Promise<vscode.DocumentSymbol[]> {
  const result = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[] | vscode.SymbolInformation[]
  >("vscode.executeDocumentSymbolProvider", uri);
  if (!result || result.length === 0) {
    return [];
  }
  // The provider may return either flat SymbolInformation or hierarchical
  // DocumentSymbols; we only consume the DocumentSymbol shape.
  if (isDocumentSymbolArray(result)) {
    return result;
  }
  return [];
}

function isDocumentSymbolArray(
  symbols: vscode.DocumentSymbol[] | vscode.SymbolInformation[],
): symbols is vscode.DocumentSymbol[] {
  return isDocumentSymbolArrayNode(symbols);
}

// The traversal + classification logic lives in the `vscode`-free
// `./symbolNodes` module (unit-testable without a host). `vscode.DocumentSymbol`
// structurally satisfies `SymbolNode`, so these re-exports just narrow the type.

/** Walks a symbol tree depth-first, yielding every symbol. */
export function flattenSymbols(
  symbols: vscode.DocumentSymbol[],
): Generator<vscode.DocumentSymbol> {
  return flattenSymbolNodes(symbols);
}

/**
 * Test blocks are exposed by the LSP as `Method` symbols whose name is the test
 * string (landed in tooling-update F3).
 */
export function isTestSymbol(symbol: vscode.DocumentSymbol): boolean {
  return isTestSymbolNode(symbol);
}

/** `fn main` is exposed as a `Function` symbol named `main`. */
export function isMainSymbol(symbol: vscode.DocumentSymbol): boolean {
  return isMainSymbolNode(symbol);
}
