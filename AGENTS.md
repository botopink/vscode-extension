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
| Test Explorer (`src/testExplorer.ts`) | discovers `test "…"` blocks, runs `botopink test`, maps pass/fail | LSP `documentSymbol` + CLI output |

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
├── snippets.json                   ← snippets for fn/val/record/case/loop/…
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
│   ├── targetConfig.ts             ← TARGETS + resolve/parse/write botopink.json target
│   └── pathResolve.ts              ← resolveBinPath (CLI/LSP executable resolution)
└── test/
    ├── package.json                ← `{"type":"module"}` for Node's native-TS test runner
    └── unit.test.ts                ← 15 pure-function scenarios (no vscode host)
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
support (tests import the leaf modules with explicit `.ts` extensions). Like
`zig build test-libs`, `test-vscode` is **not** wired into `zig build test` —
it needs `node`/`npm` on PATH. When you touch a pure helper, keep its wrapper in
the host file a one-line delegation so the tested code is the shipped code.

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
  `check`/`build`/`test`/`format`/`run`); only `build`/`test` take
  `--target`.
- **Keywords list must stay in sync** with the lexer keyword table in
  [`../botopink-lang/modules/compiler-core/src/lexer.zig`](../botopink-lang/modules/compiler-core/src/lexer.zig)
  (`keywordOrIdent`) — `token.zig` only holds the enum; the actual
  surface keywords are the strings matched there. When you add or remove a
  keyword, update `syntaxes/botopink.tmLanguage.json`. Beyond plain
  keywords the grammar also scopes: `#[@external(…)]` attribute blocks,
  the builtin `@`-types (`@Expr`/`@Result`/`@Option`/`@Iterator`), the
  `*fn` effect marker, `|>` pipeline, `?.` optional chaining, and `${…}`
  string interpolation holes.
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
```

Press <kbd>F5</kbd> in VS Code on this folder to launch the Extension
Development Host. Make sure `botopink-lsp` is on `PATH` (or set
`botopink.path` in the dev-host's settings).

## See also

- LSP server it launches → [`../botopink-lang/modules/language-server/AGENTS.md`](../botopink-lang/modules/language-server/AGENTS.md).
- Token kinds the grammar mirrors → [`../botopink-lang/modules/compiler-core/src/lexer/token.zig`](../botopink-lang/modules/compiler-core/src/lexer/token.zig).
- Language reference for snippet bodies → [`../botopink-lang/docs.md`](../botopink-lang/docs.md).
