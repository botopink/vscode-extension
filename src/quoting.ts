// Minimal POSIX shell quoting for terminal command construction. Free of any
// `vscode` import so it is unit-testable without a host.

/** Quotes a single argument for a shell terminal `sendText`. */
export function quoteArg(value: string): string {
  if (/^[\w./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
