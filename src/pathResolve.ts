// Pure resolution of the `botopink` / `botopink-lsp` executable path. Free of
// any `vscode` import so it is unit-testable without a host. `cli.ts` and
// `extension.ts` inject the real `path.isAbsolute` / `fs.stat` behaviour.

/** What to return for a relative path that resolves to no existing file. */
export type RelativeMiss = "passthrough" | "undefined";

export interface ResolveBinOptions {
  /** The configured path setting (`botopink.cliPath` / `botopink.path`). */
  configured: string | undefined;
  /** Absolute fs paths of the open workspace folders. */
  workspaceFolders: readonly string[];
  /** The bare binary name to fall back to when nothing is configured. */
  defaultBin: string;
  /** Behaviour when a relative configured path matches no file on disk. */
  relativeMiss: RelativeMiss;
  /** `path.isAbsolute`. */
  isAbsolute: (p: string) => boolean;
  /** `path.resolve`. */
  resolve: (a: string, b: string) => string;
  /** Whether a candidate file exists (and is a file). */
  exists: (p: string) => boolean | Promise<boolean>;
}

/**
 * Resolves a configured executable path:
 *   - nothing configured (or no folders, for the LSP) → the bare default name
 *   - absolute → used as-is
 *   - relative that matches a file under a workspace folder → that absolute path
 *   - relative that matches nothing → `passthrough` (let the shell try) or
 *     `undefined` (caller treats as unresolved), per `relativeMiss`
 */
export async function resolveBinPath(
  opts: ResolveBinOptions,
): Promise<string | undefined> {
  const { configured, workspaceFolders } = opts;
  if (!configured) {
    return opts.defaultBin;
  }
  if (opts.isAbsolute(configured)) {
    return configured;
  }
  // With no workspace folders there is nothing to resolve a relative path
  // against — let the shell try the bare value (both CLI and LSP behave so).
  if (workspaceFolders.length === 0) {
    return configured;
  }
  for (const folder of workspaceFolders) {
    const candidate = opts.resolve(folder, configured);
    if (await opts.exists(candidate)) {
      return candidate;
    }
  }
  // A relative path that matched no file: the CLI passes it through (shell
  // lookup), the LSP reports it unresolved.
  return opts.relativeMiss === "passthrough" ? configured : undefined;
}
