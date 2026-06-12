import * as vscode from "vscode";
import {
  fetchDocumentSymbols,
  flattenSymbols,
  isMainSymbol,
  isTestSymbol,
} from "./symbols";

export const RUN_TEST_COMMAND = "botopink.runTest";
export const RUN_MAIN_COMMAND = "botopink.run";

/**
 * Places "Run test" / "Run" CodeLenses above `test "…"` blocks and `fn main`.
 *
 * The lens targets come purely from the LSP `documentSymbol` response — the
 * extension never parses `.bp` source. The lenses invoke commands wired in
 * `extension.ts`, which run the work through the `botopink` CLI.
 */
export class BotopinkCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChange.event;

  constructor() {
    // Re-query lenses when documents change so symbols stay in sync.
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "botopink") {
        this.onDidChange.fire();
      }
    });
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const symbols = await fetchDocumentSymbols(document.uri);
    if (token.isCancellationRequested) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    for (const symbol of flattenSymbols(symbols)) {
      if (isTestSymbol(symbol)) {
        lenses.push(
          new vscode.CodeLens(symbol.range, {
            title: "$(play) Run test",
            command: RUN_TEST_COMMAND,
            arguments: [symbol.name],
          }),
        );
      } else if (isMainSymbol(symbol)) {
        lenses.push(
          new vscode.CodeLens(symbol.range, {
            title: "$(play) Run",
            command: RUN_MAIN_COMMAND,
            arguments: [],
          }),
        );
      }
    }
    return lenses;
  }
}
