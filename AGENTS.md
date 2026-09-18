# vscode-extension · AGENTS.md

> Path: `repository/vscode-extension/`
> Parent (workspace): [`../AGENTS.md`](../AGENTS.md) · Sibling (core): [`../botopink-lang/AGENTS.md`](../botopink-lang/AGENTS.md)
> Sibling docs: [`./docs.md`](docs.md)

VS Code extension for the `.bp` language. Adapted from
[`gleam-lang/vscode-gleam`](https://github.com/gleam-lang/vscode-gleam).
Thin TypeScript wrapper that:

1. Registers `.bp` as a language (`botopink`).
2. Ships a TextMate grammar + snippets for offline highlighting.
3. Launches the `botopink-lsp` binary (built from
   [`../botopink-lang/modules/language-server/`](../botopink-lang/modules/language-server/)) and
   speaks LSP over stdio via `vscode-languageclient`.
4. Provides UI-only editor integrations that shell the `botopink` CLI or
   consume LSP results — tasks + problem matcher, CodeLens run/test, a
   status-bar codegen-target switcher, and Test Explorer. None of these
   parse `.bp`: test/`main` targets come from LSP `documentSymbol`s and
   pass/fail comes from the CLI's textual output.

## Contributions

| Contribution | What | Driven by |
|---|---|---|
| `languages` / `grammars` / `snippets` | `.bp` registration, TextMate colouring, snippets | static / lexical |
| `configuration` | `botopink.path` (LSP), `botopink.cliPath` (CLI), `botopink.trace.server` | settings |
| `commands` | `restartServer`, `selectTarget`, `run`, `runTest` | UI |
| `taskDefinitions` (`botopink`) | `check` / `build` / `test` / `format` tasks (props: `command`, `target`, `filter`) | shells the `botopink` CLI |
| `problemMatchers` (`$botopink`) | parses `error: <msg> at <file>:<line>:<col>` from `botopink check` | CLI stderr |
| CodeLens (`src/codeLens.ts`) | "▶ Run" over `fn main`, "▶ Run test" over each `test "…"` | LSP `documentSymbol` |
| status bar (`src/target.ts`) | active codegen target; click → QuickPick → writes `target` in `botopink.json` | `botopink.json` |
| Test Explorer (`src/testExplorer.ts`) | discovers `test "…"` blocks, runs `botopink test` on a target it accepts (`TEST_TARGETS`), maps pass/fail | LSP `documentSymbol` + CLI output |

Semantic classification (semantic tokens, inlay hints, symbols, …) is
**always** served by `botopink-lsp`. The extension only wires the UI.

### Sub-language highlighting (`erika "…"`, `html """…"""`)

The interior of a sub-language string is coloured by the **LSP's semantic
tokens**, never by a hand-written SQL/HTML grammar — VSCode is a pure renderer
of what the compiler computed at comptime (`@ExprCustom` → `CustomNode` →
`semanticTokens`). Two manifest pieces let those tokens win:

- `configurationDefaults["[botopink]"]."editor.semanticHighlighting.enabled": true`
  forces semantic highlighting on for `.bp` regardless of the active theme, so
  the LSP tokens override the TextMate `string.quoted` scope per-range. (Default
  dark/light themes already opt in; this makes every theme behave.)
- `contributes.semanticTokenScopes` maps each sub-language token type
  (`keyword`/`property`/`string`/`number`/`operator`) to fallback TextMate
  scopes so a theme that doesn't directly style the semantic type still colours
  it.

The TextMate grammar deliberately does **not** sub-scope string interiors (see
the `strings` repository comment in `syntaxes/botopink.tmLanguage.json`): a plain
string carries no semantic tokens and stays `string`-coloured, so non-sub-language
strings are visually unchanged. No `extension.ts` change is needed — the
`vscode-languageclient` registers the semantic-tokens feature automatically once
the server advertises the provider.

## Tree

```text
vscode-extension/
├── AGENTS.md                       ← you are here
├── README.md                       ← user-facing install + dev notes
├── CHANGELOG.md                    ← per-version feature notes (marketplace tab)
├── docs.md                         ← deep-dive: design, LSP wiring
├── package.json                    ← extension manifest (contributes/commands/config)
├── tsconfig.json
├── language-configuration.json     ← brackets / auto-close / on-enter rules
├── snippets.json                   ← snippets for fn/val/type/behavior/case/loop/…
│                                     (each needs a fixture in scripts/snippetFixtures.ts)
├── syntaxes/
│   ├── botopink.tmLanguage.json    ← TextMate grammar for `.bp`
│   └── botopink.codeblock.json     ← markdown injection for ```bp blocks
├── images/                         ← extension icon + language icon
├── src/
│   ├── extension.ts                ← activate() / deactivate() / LSP client + feature wiring
│   ├── cli.ts                      ← resolve `botopink` CLI path + shared OutputChannel
│   ├── target.ts                   ← codegen-target status bar + botopink.json read/write
│   ├── tasks.ts                    ← TaskProvider for check/build/test/format
│   ├── symbols.ts                  ← LSP documentSymbol helpers (test / main detection)
│   ├── codeLens.ts                 ← CodeLens "Run" / "Run test" provider
│   ├── testExplorer.ts             ← Testing API controller + `botopink test` runner
│   │                                 (re-exports parseTestOutput from ./testOutput)
│   │   ── vscode-free leaf modules (pure logic, unit-tested under test/) ──
│   ├── testOutput.ts               ← parseTestOutput + OK/FAIL line regexes
│   ├── taskArgs.ts                 ← argsFor / taskLabel / taskGroupKind
│   ├── quoting.ts                  ← quoteArg (POSIX shell quoting)
│   ├── symbolNodes.ts              ← flatten + test/main predicates + DocumentSymbol[] guard
│   ├── targetConfig.ts             ← TARGETS (build/run) + TEST_TARGETS (test) +
│   │                                 testTargetFor + resolve/parse/write botopink.json target
│   └── pathResolve.ts              ← resolveBinPath (CLI/LSP executable resolution)
├── scripts/
│   ├── compilerCheck.ts            ← CI `compiler` job: lexer-keyword pin + every snippet
│   │                                 through `botopink check` (`npm run compiler-check`)
│   ├── snippetFixtures.ts          ← per-snippet tabstop values + wrapper → a checkable module
│   ├── lexerKeywords.ts            ← keywordOrIdent extraction + grammar keyword-rule parsing
│   ├── tokenize.ts                 ← loads the grammar into vscode-textmate/oniguruma → scopes per token
│   └── git-hooks/                  ← tracked pre-commit gate
└── test/
    ├── package.json                ← `{"type":"module"}` for Node's native-TS test runner
    ├── lexerKeywords.json          ← pinned `keywordOrIdent` words (checked against lexer.zig in CI)
    ├── grammar.test.ts             ← what the grammar actually paints, tokenized for real
    └── unit.test.ts                ← pure-function scenarios (no vscode host)
```

## Testing

The pure logic lives in **`vscode`-free leaf modules** (`src/{testOutput,
taskArgs,quoting,symbolNodes,targetConfig,pathResolve}.ts`); the host-coupled
files (`testExplorer.ts`, `tasks.ts`, `symbols.ts`, `target.ts`, `cli.ts`,
`extension.ts`) import and thinly wrap them. That split keeps `vscode` out of
the test-reachable path so the unit suite needs **no Electron host**:

```bash
npm test                # tsc --noEmit typecheck (pretest) + node --test test/
zig build test-vscode   # same, from the repo gate (needs node + `npm install`)
```

`test/unit.test.ts` runs on Node's built-in runner with native TypeScript
support (tests import the leaf modules with explicit `.ts` extensions). A leaf
module that imports another leaf module uses the explicit `.ts` extension too
(`taskArgs.ts` → `./targetConfig.ts`): Node's ESM loader needs it, and
`tsconfig.json`'s `rewriteRelativeImportExtensions` turns it into `.js` on emit.

The suite also guards what the extension ships, without a compiler: every
grammar control/declaration keyword must be in `test/lexerKeywords.json`, every
pinned lexer keyword must be highlighted, and every `snippets.json` entry must
have a fixture in `scripts/snippetFixtures.ts`. One test reaches outside when it
can — `grammar: the pinned keywords equal keywordOrIdent, when a botopink-lang
checkout is reachable` re-extracts the lexer table from `$BOTOPINK_LANG` or the
sibling `../botopink-lang` and **skips** when neither exists, so a standalone
clone stays green. The compiler-backed half runs in CI (below) and locally with

```bash
npm run compiler-check -- --lang ../botopink-lang   # needs a built zig-out/bin/botopink
```

which fails when `test/lexerKeywords.json` drifts from `keywordOrIdent` or when
any snippet, expanded by its fixture, does not pass `botopink check`. Like
`zig build test-libs`, `test-vscode` is **not** wired into `zig build test` —
it needs `node`/`npm` on PATH. When you touch a pure helper, keep its wrapper in
the host file a one-line delegation so the tested code is the shipped code.

**A grammar rule is proved by the scopes it produces, never by reading its
regex.** `test/grammar.test.ts` loads `syntaxes/botopink.tmLanguage.json` into
the tokenizer VS Code itself uses (`vscode-textmate` over `vscode-oniguruma`,
both devDependencies) through `scripts/tokenize.ts`, and asserts the innermost
scope at a given offset. Rule order, lookbehind and begin/end nesting therefore
behave in the test exactly as they do in the editor. Add a case there for every
rule you add or reorder — the `...` before `..` ordering and the tuple's
begin/end nesting are both silent when only the regex is read.

## Conventions

- **No compiler-internal knowledge.** The extension does not parse `.bp`
  itself — all semantic features come from `botopink-lsp`. The TextMate
  grammar is a separate, purely lexical view used only for syntax
  colouring. CodeLens and Test-Explorer targets come from LSP
  `documentSymbol`s (test blocks are `Method` symbols named after the test
  string; `fn main` is a `Function` symbol named `main`), never from
  reading source. Pass/fail comes from shelling the `botopink` CLI.
- **CLI coupling points** (keep in sync when the CLI changes):
  - the `$botopink` problem-matcher regexp in `package.json`
    (`contributes.problemMatchers`) tracks `botopink check`'s
    `error: <msg> at <file>:<line>:<col>` stderr format;
  - `parseTestOutput` in `src/testExplorer.ts` tracks the commonJS test
    runner lines emitted by
    [`../botopink-lang/modules/compiler-core/src/codegen/commonJS.zig`](../botopink-lang/modules/compiler-core/src/codegen/commonJS.zig)
    (`  ok   <name>` / `  FAIL <name>  (<msg>)  at <loc>`).
  The `botopink` CLI surface lives in
  [`../botopink-lang/modules/compiler-cli/src/main.zig`](../botopink-lang/modules/compiler-cli/src/main.zig) (subcommands
  `check`/`build`/`test`/`format`/`run`); only `build`/`run`/`test` take
  `--target`;
  - `TEST_TARGETS` in `src/targetConfig.ts` tracks the targets `botopink test`
    accepts (`compiler-cli/src/cli/test_cmd.zig` refuses all but commonJS and
    erlang). Every test invocation — Test Explorer, CodeLens "Run test", the
    `test` task — resolves its target through `testTargetFor`, which falls back
    to commonJS (with a warning for the two UI paths) instead of forwarding
    `beam`/`wasm`.
- **Keywords list must stay in sync** with the lexer keyword table in
  [`../botopink-lang/modules/compiler-core/src/lexer.zig`](../botopink-lang/modules/compiler-core/src/lexer.zig)
  (`keywordOrIdent`) — `token.zig` only holds the enum; the actual
  surface keywords are the strings matched there. When you add or remove a
  keyword, update `syntaxes/botopink.tmLanguage.json` and
  `test/lexerKeywords.json` (the unit suite and the CI `compiler` job fail
  otherwise). **Three things assert the pin, because a keyword is added in
  botopink-lang and not here**, so a push-triggered job never runs on the
  change that breaks it — `unknown` drifted for exactly that reason and shipped
  red: (1) the `compiler` job of `.github/workflows/test.yml`, which now also
  runs **daily** (`schedule`) and on `workflow_dispatch`, not only on push/PR;
  (2) `npm test`'s `grammar: the pinned keywords equal keywordOrIdent, when a
  botopink-lang checkout is reachable`, which re-extracts `keywordOrIdent` from
  `$BOTOPINK_LANG` or the sibling `../botopink-lang` and skips when neither is
  there; (3) `npm run compiler-check -- --lang <checkout>` by hand.
  `unknown` is the one keyword painted as a **type**: it has a rule of its own in
  `repository.keywords` carrying the `support.type.primitive.botopink` scope, so
  `grammar: every lexer keyword is highlighted by some keyword rule` (which reads
  only `repository.keywords`) sees it while the colour stays the one every other
  primitive gets. It is listed twice on purpose — the keyword pin here and
  `registerBuiltins` in `repository.constants` — and both lists are asserted.
  `const` and `struct` are not keywords and must not be listed, nor
  are `delegate`, `new`, `record`, `enum`, `interface` (removed by the 1.0.4-beta surface cutover and botopink-lang front 06 N27), nor
  the dead keywords `auto`, `derive`, `get`, `macro`, `opaque`, `private` and
  `set` (identifiers since botopink-lang `ecac19d`).
  The `case` snippet teaches decision 8's `Pattern { body }` arms. It kept
  `pattern -> result;` while those arms were `error: Unexpected token` (measured at
  botopink-lang `0e5ff66` and again at `2b098eda`); botopink-lang `d0c27f6` landed the grammar and
  the form now parses, checks and runs, so the snippet was flipped —
  `case n { 1 { "one" } _ { "other" } }` passes `npm run compiler-check` with the fixture it
  already had. Both arm forms parse at `c2dd780`; the snippet teaches the one decision 8 §5.1
  writes. `test/grammar.test.ts` pins the snippet's body *and* what it paints, so a grammar
  regression or a flip back to the arrow arms reds `npm test`. Every other snippet is already on
  the 1.0.3 surface.
  The tuple rule is a **begin/end** block, not a bare `#\(` match: it scopes the closing `)` and
  paints a written type's labels as `variable.other.property.botopink` (decision 8 §6). Its
  `#parenGroup` include is what keeps a nested `(…)` — `#(f(1), 2)`, `#((1 + 2), 3)` — from closing
  the tuple at the first inner `)`. In `operators`, `\.\.\.` **must** precede `\.\.`: a pattern
  range `1...9` otherwise reads as a `..` plus an unscoped dot.
  Beyond plain
  keywords the grammar also scopes: `#[@External.<Target>(…)]` attribute blocks,
  `#[@<effect>]` annotation prefixes (`#[@result]` / `#[@future]` /
  `#[@iterator]` / `#[@generator]` / `#[@asyncGenerator]` / `#[@context]`),
  the builtin `@`-types (`@Expr`/`@Result`/`@Option`/`@Iterator`),
  `|>` pipeline, `?.` optional chaining, and `${…}` string interpolation
  holes. Retired syntax gets no rule and no snippet: the legacy `*fn`
  prefix (`deprecated-star-fn`, removed in v0.beta.19) is gone from both, and
  the iterator snippet uses `#[@iterator] fn`.
- **`botopink-lsp` is launched with no args** — see
  [`../botopink-lang/modules/language-server/src/main.zig`](../botopink-lang/modules/language-server/src/main.zig).
  Do not add `lsp`/`serve`/etc. subcommands here.
- **Comment continuation** for `///` and `////` is wired through
  `continueTypingCommentsOnNewline()` in `src/extension.ts`. Keep that
  list aligned with the `commentDoc`/`commentModule` tokens.
- **No telemetry.** Do not add any analytics or auto-update channels.

## Local commands

```bash
npm install                # one-time
npm run compile            # tsc → out/extension.js
npm run watch              # rebuild on change
npm run vscode:package     # produces botopink-<version>.vsix
npm run package            # same, but writes to dist/ (matches release.yml)
```

Press <kbd>F5</kbd> in VS Code on this folder to launch the Extension
Development Host. Make sure `botopink-lsp` is on `PATH` (or set
`botopink.path` in the dev-host's settings).

## Release pipeline (CI)

Two workflows under `.github/workflows/`:

| Workflow      | Trigger          | What                                                                  |
| ------------- | ---------------- | --------------------------------------------------------------------- |
| `test.yml`    | push / PR / daily `schedule` / `workflow_dispatch` | job `test`: `npm ci && npm test`; job `compiler`: builds botopink-lang at `vars.BOTOPINK_LANG_REF` (default `feat`) and runs `npm run compiler-check`. ubuntu-22.04. The `schedule` trigger is what catches a keyword or a primitive type added in botopink-lang with no push on this side. |
| `release.yml` | tag push `v*`    | `package` → `publish-gh` → conditional `publish-marketplace`.         |

**`VSCE_PAT` secret.** The `publish-marketplace` job is gated on
`${{ secrets.VSCE_PAT != '' }}`. With the secret unset (fresh fork, contributor
PR, any non-trusted runner), the job is **skipped, not failed**, and the tag
push still produces a `.vsix` on the GitHub Release. To enable marketplace
publishing on a trusted repo:

1. Create a Personal Access Token at
   <https://dev.azure.com/<organization>/_usersSettings/tokens> with the
   `Marketplace › Manage` scope (publish includes packaging).
2. Add the token under `Settings → Secrets and variables → Actions → New
   repository secret` as `VSCE_PAT`.
3. Re-run the latest `release.yml` workflow or push a new tag — the
   `publish-marketplace` job now runs `vsce publish --packagePath dist/*.vsix
   --pat $VSCE_PAT`.

The marketplace publisher (`botopink` in `package.json`) must match the
account the PAT belongs to.

## See also

- LSP server it launches → [`../botopink-lang/modules/language-server/AGENTS.md`](../botopink-lang/modules/language-server/AGENTS.md).
- Token kinds the grammar mirrors → [`../botopink-lang/modules/compiler-core/src/lexer/token.zig`](../botopink-lang/modules/compiler-core/src/lexer/token.zig).
- Language reference for snippet bodies → [`../botopink-lang/docs.md`](../botopink-lang/docs.md).

## Tagging

This repo is auto-tagged on push by
[`./.github/workflows/tag.yml`](./.github/workflows/tag.yml):

- `<version>-feat` — moving; force-updated on each feat push.
- `<version>` — immutable; created once per master/main push. Re-push
  without bumping `botopink.json.version` → red gate.

`<version>` is `botopink.json.version`. The maintainer **must keep
`botopink.json.version` and `package.json.version` in sync** — the tag
job asserts equality and exits red with both numbers on drift. Bump
both fields in the same edit that lands the release-worthy changes.

`v*` tags (the marketplace release trigger in
[`./.github/workflows/release.yml`](./.github/workflows/release.yml)) are
unaffected by this workflow; they're created manually when a marketplace
publish is desired (see module-auto-tag spec Notes for the rationale).
Spec: [`../../tasks/v0.beta.18/specs/module-auto-tag.md`](../../tasks/v0.beta.18/specs/module-auto-tag.md).

## Local gate

`scripts/git-hooks/pre-commit` is the tracked pre-commit gate. It is
self-contained: it sources `scripts/git-hooks/lib/runner-standalone.sh`
from this repository and reaches nothing outside it, so a standalone
clone, a checkout inside the botopink meta workspace and a worktree run
the same gate. Install it once per clone:

```sh
git config core.hooksPath scripts/git-hooks
```

`core.hooksPath` is per clone and applies to every worktree of it. The
gate checks staged files for conflict markers, then runs
`npm test --silent`. On a first run after a fresh clone it runs `npm ci`
once and writes a marker under `node_modules/.botopink-installed` so
subsequent runs skip the install. If `npm` is missing the gate prints a
yellow warning and exits 0. Never commit with `--no-verify`; fix the red
instead.
