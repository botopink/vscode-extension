# Botopink for VS Code

Botopink language support for Visual Studio Code:

- Syntax highlighting for `.bp` files (and ```` ```bp ```` fenced code blocks in Markdown), including `#[@external]` attributes, the builtin `@`-types (`@Expr`/`@Result`/`@Option`/`@Iterator`), the `*fn` effect marker, `|>` pipelines, `?.` optional chaining, and `${…}` string interpolation.
- Snippets for the most common declarations (`fn`, `val`, `record`, `struct`, `enum`, `case`, `loop`, `comptime`, …) plus `test` blocks, `#[@external]` declares, `*fn` generators, and `import { … } from "std"`.
- Full LSP integration via [`botopink-lsp`](../botopink-lang/modules/language-server/): diagnostics, formatting, hover, go-to-definition (same-file, cross-module, and into the embedded `std` modules), completion (members, `list.`/`io.` std members, interface methods on primitive/array/string receivers, labeled args), document symbols (incl. `test` blocks), folding, references, rename, signature help, semantic tokens, and inlay hints (all server-driven).
- Tasks for the `botopink` CLI (`check`, `build`, `test`, `format`) plus a `$botopink` problem matcher that routes `botopink check` errors into the Problems panel.
- CodeLens "Run" / "Run test" actions above `fn main` and each `test "…"` block (driven by LSP document symbols).
- A status-bar codegen-target switcher (`commonJS` / `erlang` / `beam` / `wasm`) that reads and writes the `target` field of `botopink.json`.
- Test Explorer integration: `test "…"` blocks are discovered across the workspace and runnable from the gutter / Testing view, with pass/fail and assertion messages mapped back from `botopink test`.

## Requirements

Install the Botopink toolchain first. The extension launches the
`botopink-lsp` binary, so it must be reachable on your `PATH`:

```bash
# from the repo root
zig build
# the resulting binary lives at modules/language-server/zig-out/bin/botopink-lsp
```

Either add that directory to your `PATH`, or set the extension setting
`botopink.path` to the absolute path of the binary.

## Settings

| Setting | Default | Description |
|---|---|---|
| `botopink.path` | `null` | Absolute path (or workspace-relative path) to `botopink-lsp`. When unset, the extension looks it up on `PATH`. |
| `botopink.cliPath` | `null` | Absolute path (or workspace-relative path) to the `botopink` CLI used by tasks, CodeLens run/test, and the Test Explorer. When unset, the extension looks it up on `PATH`. |
| `botopink.trace.server` | `"off"` | LSP trace level (`off` / `messages` / `verbose`). |

## Commands

| Command | Title |
|---|---|
| `botopink.restartServer` | `Botopink: Restart Botopink Server` |
| `botopink.selectTarget` | `Botopink: Select Codegen Target` |
| `botopink.run` | `Botopink: Run main` |
| `botopink.runTest` | `Botopink: Run Test` |

## Development

```bash
cd repository/vscode-extension
npm install
npm run compile      # one-off build → out/extension.js
npm run watch        # rebuild on changes
```

Then press <kbd>F5</kbd> in VS Code (with this folder opened) to launch
an *Extension Development Host* — open any `.bp` file there to drive
the extension against your local `botopink-lsp`.

To produce a `.vsix` for sideloading:

```bash
npm run vscode:package
```
