# Changelog

All notable changes to the Botopink VS Code extension are documented here.

## Unreleased

### Added

- **Sub-language highlighting inside strings** — the interior of `erika "…"` /
  `html """…"""` is now coloured by the LSP's comptime-driven semantic tokens.
  Semantic highlighting is forced on for `.bp` and the sub-language token types
  (`keyword` / `property` / `string` / `number` / `operator`) get fallback theme
  mappings, so the tokens win over the `string.quoted` scope across dark/light
  themes. Plain (non-sub-language) strings are unchanged. No SQL/HTML grammar is
  shipped — VSCode is a pure renderer of what the LSP computed.

## 0.3.0

The editor-experience feature set (LSP semantic features + VS Code workbench
integration) that was scaffolded across the language server lands here.

### Added

- **Semantic tokens** (LSP) — server-driven classification of keywords, type /
  interface / enum declarations, parameters, and comments, driven from the typed
  AST (`botopink-lsp` `semanticTokens`).
- **Inlay hints** (LSP) — inferred `val` types after unannotated bindings and
  call-site parameter-name hints for known functions.
- **Tasks + problem matcher** — a `botopink` task type for `check` / `build` /
  `test` / `format` (with optional `target` and test `filter`) plus a
  `$botopink` problem matcher that routes `botopink check` diagnostics into the
  Problems panel.
- **CodeLens** — "▶ Run" over `fn main` and "▶ Run test" over each `test "…"`
  block, driven by LSP document symbols.
- **Status-bar codegen-target switcher** — reads / writes the `target` field of
  `botopink.json` (`commonJS` / `erlang` / `beam` / `wasm`); tasks, CodeLens, and
  the Test Explorer all respect the active target.
- **Test Explorer** (VS Code Testing API) — discovers `test "…"` blocks across
  the workspace, runs them via `botopink test`, and maps pass / fail and
  assertion messages back to each test item.

## 0.2.0

### Added

- Syntax highlighting for `.bp` files and fenced `bp` code blocks in Markdown.
- Snippets for the common declarations, `test` blocks, `#[@external]` declares,
  `*fn` generators, and `import { … } from "std"`.
- LSP integration via `botopink-lsp`: diagnostics, formatting, hover,
  go-to-definition, completion, document symbols, folding, references, rename,
  and signature help.
