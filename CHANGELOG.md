# Changelog

All notable changes to the Botopink VS Code extension are documented here.

## Unreleased

### Fixed

- **`unknown` is a pinned keyword again, and the pin cannot drift unnoticed.**
  `unknown` became a lexer keyword in botopink-lang (`6c849ae`) and
  `test/lexerKeywords.json` never followed, so `npm run compiler-check` — the CI
  `compiler` job — was red while `npm test` was green. The word is pinned, and it
  is highlighted by a rule of its own carrying the `support.type.primitive`
  scope, so the colour is unchanged. Three guards now assert the pin instead of
  one: the `compiler` job also runs daily and on demand (a keyword is added in
  the *other* repository, where a push here never happens); `npm test` compares
  against `keywordOrIdent` whenever a botopink-lang checkout is reachable
  (`$BOTOPINK_LANG` or the sibling `../botopink-lang`), and skips when it is not.

### Changed

- **The 1.0.4-beta surface.** The grammar highlights `type` and `behavior` as
  declarations and no longer `record`, `enum` or `interface`; `when` as a `case`-arm
  guard; `#(` tuples, `.Variant` shorthand, `|` union types, `unknown`,
  `@Future`/`@AsyncGenerator`; `any` is gone. Snippets: `type` (fields or variants),
  `behavior`, `#[@result] fn … -> @Result<T, E>`. `test/lexerKeywords.json` follows the
  botopink-lang lexer after the surface cutover (front 12); `npm run compiler-check` passes
  against it.
- **The `case` snippet teaches `Pattern { body }` arms.** botopink-lang `d0c27f6` landed
  decision 8 §5's grammar, so `case n { 1 { "one" } _ { "other" } }` now parses, checks and
  runs where it used to be `error: Unexpected token`. The snippet was flipped, with the
  fixture it already had, and `npm run compiler-check` compiles the filled body.
  `test/grammar.test.ts` pins the arm shape so a grammar regression — or a flip back to the
  arrow arms — reds `npm test`.
- **botopink-lang front 06 G0.** `delegate` and `new` are no longer keywords (N27); a
  `loop (condition)` snippet (`loopwhile`) replaces `while` (N26).
- **The primitive types are the checker's again.** `never` was painted
  `support.type.primitive` and is registered nowhere — `fn c(x: never)` is
  `error: unknown type 'never'` — so the editor marked a word no program can name
  as a standard-library type, while `isize`, `usize`, `v128` and `noreturn`, which
  the checker does register, were plain text. The rule is now
  `Env.registerBuiltins` minus `Self` and minus `any` (decision 8 §2.5), plus
  `unknown` (decision 8 §2). `npm run compiler-check` compares the two lists
  against a real botopink-lang checkout, the way it already pins the lexer
  keywords, and `test/grammar.test.ts` tokenizes every one of them.
- **A `#(…)` tuple is a real block, and its labels are properties.** The tuple rule was a bare
  `#(` match that scoped nothing else; it is now a begin/end block that scopes the closing `)`
  and paints a written type's labels (`#(name: string, pop: i32)`) as
  `variable.other.property.botopink`, the scope the manifest already maps the LSP's `property`
  token to. A nested `(…)` no longer closes the tuple early.
- **The `behavior` snippet writes a complete member.** `fn method(self: Self) -> type;` — a
  behavior member with no body ends with `;`; the snippet used to stop after `)` and leave the
  `;` to the user. The `implement` snippet is named and described for the 1.0.3 surface
  ("Implement a behavior for a type"), and the README says `behavior` methods, not `interface`
  ones.

### Added

- **`A...B` pattern ranges highlight.** An inclusive pattern range (botopink-lang decision 8 §5.2)
  is one `keyword.operator.range.inclusive.botopink` token; the `..` rule used to take two of the
  three dots and leave the third unscoped. `..` stays iteration and slicing (`0..n`, `#(0, ..)`).
- **The grammar is tested by tokenizing, not by reading regexes.** `test/grammar.test.ts` loads
  the grammar into `vscode-textmate` over `vscode-oniguruma` (new devDependencies) through
  `scripts/tokenize.ts` and asserts the scope the editor would show: `type` / `behavior`
  declarations, the removed spellings staying unhighlighted, tuples and their labels, `A...B`
  versus `..`, `when` guards versus a `when` identifier, `unknown`, union `|` versus `||` / `|>`,
  every `loop` form, and `#[@effect]` annotations.
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
