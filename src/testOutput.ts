// Pure parsing of the `botopink test` textual report. Kept free of any `vscode`
// import so it is unit-testable with a plain `node:test` runner (no Electron
// host). `testExplorer.ts` re-exports these.

/**
 * Result of running `botopink test`, keyed by test name.
 *
 * The CLI's commonJS runner prints (see
 * `compiler-core/src/codegen/commonJS.zig`):
 *   running <N> tests
 *     ok   <name>
 *     FAIL <name>  (<message>)  at <loc>
 *   <P> passed, <F> failed
 */
export interface TestOutcome {
  passed: boolean;
  message?: string;
}

export const OK_LINE = /^\s*ok\s+(.+?)\s*$/;
export const FAIL_LINE = /^\s*FAIL\s+(.+?)\s{2}\((.*)\)\s{2}at\s+(.+?)\s*$/;

/** Parses the commonJS test runner's textual report into per-test outcomes. */
export function parseTestOutput(output: string): Map<string, TestOutcome> {
  const outcomes = new Map<string, TestOutcome>();
  for (const rawLine of output.split(/\r?\n/)) {
    const failMatch = FAIL_LINE.exec(rawLine);
    if (failMatch) {
      const [, name, message] = failMatch;
      outcomes.set(name, { passed: false, message });
      continue;
    }
    const okMatch = OK_LINE.exec(rawLine);
    if (okMatch) {
      // Avoid matching the trailing "<P> passed, <F> failed" summary line; that
      // line never starts with "ok".
      outcomes.set(okMatch[1], { passed: true });
    }
  }
  return outcomes;
}
