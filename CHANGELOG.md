# Changelog

All notable changes to the Botopink VS Code extension are documented here.

## Unreleased

### Changed

- **The 1.0.4-beta surface.** The grammar highlights `type` and `behavior` as
  declarations and no longer `record`, `enum` or `interface`; `when` as a `case`-arm
  guard; `#(` tuples, `.Variant` shorthand, `|` union types, `unknown`,
  `@Future`/`@AsyncGenerator`; `any` is gone. Snippets: `type` (fields or variants),
  `behavior`, `#[@result] fn … -> @Result<T, E>`. `test/lexerKeywords.json` follows the
  botopink-lang lexer after the surface cutover (front 12); `npm run compiler-check` passes
  against it. **Waiting for front 06** (on branch `fix/new-surface-06`): `delegate` and `new`
  stop being keywords (N27), the `case` snippet's `Pattern { … }` arms (N22) and the
  `loop (condition)` snippet (N26) — until then `case` keeps `pattern -> result;` arms.

### Added

- **MIT license.** `LICENSE` (`Copyright (c) 2026 Eric Fillipe and botopink
  contributors`) and `"license": "MIT"` in `package.json`, so `vsce package`
  no longer warns and the Marketplace listing names the license.

### Fixed

- **The pre-commit hook is self-contained.** The dead delegation to a meta
  workspace runner is gone, and `AGENTS.md` documents the install
  (`git config core.hooksPath scripts/git-hooks`) instead of a
  `scripts/install-hooks.sh` that exists in no repository.

- **Snippets and grammar match the parser.** The `*fn` snippet (removed syntax)
  is now `iterator`, expanding to `#[@iterator] fn …`; the `struct` snippet is
  gone (`record` is the declaration); the `external` snippet emits
  `#[@External.Node(…), @External.Erlang(…)]` instead of a garbled mix of old
  and new forms. The grammar no longer highlights `struct`, `const` or the `*fn`
  prefix, and now highlights `is`.
- **The seven dead keywords are plain identifiers.** `auto`, `derive`, `get`,
  `macro`, `opaque`, `private` and `set` left the compiler's keyword table; the
  grammar no longer highlights them and `test/lexerKeywords.json` drops them.
- **Test runs never forward a target `botopink test` refuses.** With `beam` or
  `wasm` active, the Test Explorer, CodeLens "Run test" and the `test` task run
  on `commonJS` (the UI paths show a warning) instead of failing with the CLI's
  "supports only the commonJS and erlang targets" error.

### Added

- **Compiler-backed CI job.** `test.yml` gains a `compiler` job that builds
  botopink-lang (`vars.BOTOPINK_LANG_REF`, default `feat`) and runs
  `npm run compiler-check`: the pinned lexer keyword list must equal
  `keywordOrIdent`, and every snippet must pass `botopink check`.

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
- Snippets for the common declarations, `test` blocks, `#[@External.<targert>(...)]` declares,
  `*fn` generators (`*fn` was removed in v0.beta.19 — the snippet is pending
  cleanup), and `import { … } from "std"`.
- LSP integration via `botopink-lsp`: diagnostics, formatting, hover,
  go-to-definition, completion, document symbols, folding, references, rename,
  and signature help.
