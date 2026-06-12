# vscode-extension — Botopink VS Code extension

> Path: `repository/vscode-extension/`
> Sibling (AGENTS): [`./AGENTS.md`](AGENTS.md)
> Parent (workspace): [`../AGENTS.md`](../AGENTS.md)

Design notes and rationale for the VS Code extension. For install / dev
instructions see [`README.md`](README.md); for file-by-file conventions
see [`AGENTS.md`](AGENTS.md).

## What lives in this package

The extension does the things the LSP cannot, all **UI-only** — it owns no
compiler knowledge:

1. **Static / lexical view** — TextMate grammar + snippets, used by
   VS Code's tokenizer for colouring and IntelliSense suggestions
   before the language server reports its analysis. Lives entirely in
   `syntaxes/` and `snippets.json`.
2. **LSP launcher** — TypeScript glue (`src/extension.ts`) that
   resolves `botopink-lsp` and connects it via
   `vscode-languageclient/node`. Everything semantic (diagnostics,
   hover, completion, rename, semantic tokens, inlay hints, …) is
   served by the LSP, not by this package.
3. **Editor integrations that shell the `botopink` CLI or consume LSP
   results** — tasks + a problem matcher, CodeLens run/test, a
   status-bar codegen-target switcher, and Test Explorer.

### Tasks + problem matcher (`src/tasks.ts`)

`BotopinkTaskProvider` yields `check` / `build` / `test` / `format` tasks
(contributed `taskDefinitions` type `botopink`, properties
`command` / `target` / `filter`). Each is a `ShellExecution` of the resolved
`botopink` CLI (`botopink.cliPath`, defaulting to `botopink` on `PATH`).
`build` / `test` append `--target <active>` from the status bar. The
`check` task attaches the `$botopink` problem matcher, whose regexp parses
`error: <msg> at <file>:<line>:<col>` from stderr into the Problems panel.

### CodeLens + run/test (`src/codeLens.ts`)

`BotopinkCodeLensProvider` reads LSP `documentSymbol`s for the active file
and places a "▶ Run" lens over `fn main` (Function symbol `main`) and a
"▶ Run test" lens over each `test "…"` block (Method symbol). The lenses
invoke `botopink.run` / `botopink.runTest`, which run the CLI in an
integrated terminal honouring the active target.

### Status-bar target (`src/target.ts`)

`TargetManager` shows the active codegen target in the status bar. It is
read from / written to the `target` field of the workspace-root
`botopink.json` (round-tripped via JSON, preserving other fields); clicking
the item opens a QuickPick of `commonJS` / `erlang` / `beam` / `wasm`. The
current value is held in module state so tasks, CodeLens, and the Test
Explorer all share one source of truth.

### Test Explorer (`src/testExplorer.ts`)

A `TestController` discovers `test "…"` blocks across workspace `.bp` files
(again via LSP `documentSymbol`), building a file → test tree. The Run
profile shells `botopink test` (with `--filter <name>` when a single test
is selected), then `parseTestOutput` maps the commonJS runner's
`  ok   <name>` / `  FAIL <name>  (<msg>)  at <loc>` lines back onto the
`TestItem`s. The parser is coupled to
`../compiler-core/src/codegen/commonJS.zig` — keep them in sync.

## TextMate grammar shape

The grammar mirrors the lexer keyword table in
`compiler-core/src/lexer.zig` (`keywordOrIdent`):

| Group | Patterns |
|---|---|
| Control keywords | `if`, `else`, `case`, `loop`, `for`, `break`, `continue`, `yield`, `return`, `try`, `catch`, `throw`, `await` |
| Declaration keywords | `fn`, `val`, `var`, `pub`, `private`, `struct`, `record`, `enum`, `interface`, `type`, `implement`, `extend`, `extends`, `delegate`, `declare`, `macro`, `use`, `from`, `import`, `new`, `opaque`, `const`, `default`, `derive`, `test`, `assert`, `syntax`, `comptime`, `auto`, `set`, `get`, `as` |
| Language constants | `true`, `false`, `null`, `Self` |
| Effect marker | `*fn` (the `*` scoped as `keyword.operator.effect`) |
| Attributes | `#[@external(…), …]` blocks — `@name` scoped as `entity.name.function.attribute` |
| Builtin `@`-types | `@Expr`, `@Result`, `@Option`, `@Iterator` (`support.type.builtin`, matched before generic `@identifier`) |
| Operators | `->`, `\|>`, `..`, `?.` (optional chaining), comparison, logical, bitwise, assignment, arithmetic, `?`, `\|` |
| Numbers | binary `0b…`, octal `0o…`, hex `0x…`, float (mantissa + `[eE][+-]?…` exponent), decimal — all support `_` separators |
| Strings | triple-quoted `"""…"""` (multiline) and `"…"` with `\u{…}`, `\n`, `\r`, `\t`, `\\`, `\"`, `\0`, `\$` escapes; `${…}` interpolation holes highlighted as embedded code |
| Builtins | `@identifier` |
| Comments | `////` module-level, `///` doc, `//` line |

Keep the grammar **purely lexical** — no parser semantics. If a future
feature needs scope-aware highlighting (e.g. semantic tokens for
inferred types), implement it server-side in `botopink-lsp` and consume
it via the LSP `semanticTokens` capability rather than complicating the
TextMate file.

## LSP wiring (`src/extension.ts`)

```text
activate(ctx)
  ├── setLanguageConfiguration   → onEnter rules for /// and ////
  ├── register `botopink.restartServer`
  └── createLanguageClient()
        ├── getBotopinkLspPath()
        │     ├── reads botopink.path setting
        │     ├── resolves relative paths against workspace folders
        │     └── falls back to "botopink-lsp" on PATH
        └── new LanguageClient(serverOptions, clientOptions)
              ├── serverOptions: { command, args: [], env: process.env }
              └── clientOptions:
                   ├── documentSelector: file/botopink
                   └── synchronize: watches **/*.bp + **/build.zig
```

Notes:

- The server is invoked **with no args**; see
  [`../botopink-lang/modules/language-server/src/main.zig`](../botopink-lang/modules/language-server/src/main.zig).
  Do not add subcommands here.
- `documentSelector` uses `scheme: "file"` only — untitled buffers will
  not currently bind to the LSP. Revisit if/when the LSP supports
  in-memory virtual documents.
- The file watcher includes `build.zig` so the server can re-resolve
  workspace boundaries when the build graph changes (the LSP does not
  yet act on this, but the wiring is in place).

## Why not bundle the binary?

Following the same model as `gleam-vscode`: keeping the binary out of
the extension means a single source of truth — whatever `botopink-lsp`
the user has on `PATH` (or pointed to via `botopink.path`) is what
runs. That keeps language-server fixes and grammar fixes on
independent release cadences and avoids shipping platform-specific
binaries inside the `.vsix`.

## Packaging

```bash
npm run vscode:package
```

Produces `botopink-<version>.vsix` at the repo root of this package.
Sideload via *Extensions → ⋯ → Install from VSIX…* in VS Code. Once
the language is stable enough for public release, publish with
`npx vsce publish` under the `botopink` publisher.

## Adding a new editor feature

| You want to add… | Where it goes |
|---|---|
| A new keyword to highlight | `syntaxes/botopink.tmLanguage.json` (`keywords` repo) + `AGENTS.md` |
| A new snippet | `snippets.json` |
| A new LSP feature consumed by the client | nothing here — implement in `../botopink-lang/modules/language-server/src/engine.zig` and the standard LSP capability negotiation will surface it |
| A new VS Code command (e.g. "compile current file") | `package.json` `contributes.commands` + a handler in `src/extension.ts` |
| A new user-tunable setting | `package.json` `contributes.configuration.properties` + read it in `src/extension.ts` |
| A new CLI-backed task | `package.json` `contributes.taskDefinitions` + a branch in `src/tasks.ts` |
| A new CodeLens / Test action | derive targets from LSP `documentSymbol`s in `src/codeLens.ts` / `src/testExplorer.ts` — do not parse `.bp` |

## See also

- Language server it talks to → [`../botopink-lang/modules/language-server/docs.md`](../botopink-lang/modules/language-server/docs.md).
- Token kinds reflected in the grammar → [`../botopink-lang/modules/compiler-core/src/lexer/docs.md`](../botopink-lang/modules/compiler-core/src/lexer/docs.md).
- Snippet bodies follow the surface syntax in → [`../botopink-lang/docs.md`](../botopink-lang/docs.md).
