// Pure `botopink.json` target parsing / serialization. Free of any `vscode`
// import so it is unit-testable without a host. `target.ts` (the `TargetManager`)
// layers the status-bar + file I/O on top of these.

/** Codegen targets understood by the `botopink` CLI / `botopink.json`. */
export const TARGETS = ["commonJS", "erlang", "beam", "wasm"] as const;
export type Target = (typeof TARGETS)[number];

export const DEFAULT_TARGET: Target = "commonJS";

/**
 * The subset of `TARGETS` that `botopink test` runs. The CLI refuses every other
 * target (`compiler-cli/src/cli/test_cmd.zig`: "`botopink test` currently
 * supports only the commonJS and erlang targets"), so a test invocation never
 * forwards a target outside this list. Build / run accept all of `TARGETS`.
 */
export const TEST_TARGETS = ["commonJS", "erlang"] as const satisfies readonly Target[];
export type TestTarget = (typeof TEST_TARGETS)[number];

/** The target a test run falls back to when the active one cannot run tests. */
export const DEFAULT_TEST_TARGET: TestTarget = "commonJS";

/** True when `botopink test` accepts `value` as its `--target`. */
export function isTestTarget(value: unknown): value is TestTarget {
  return (
    typeof value === "string" &&
    (TEST_TARGETS as readonly string[]).includes(value)
  );
}

/** How a test run resolves the requested target. */
export interface TestTargetChoice {
  /** The target passed to `botopink test --target`. */
  target: TestTarget;
  /**
   * The requested target when it could not run tests and `target` is the
   * fallback; `undefined` when the requested target is used as-is.
   */
  replaced?: string;
}

/**
 * Resolves the `--target` for a `botopink test` invocation: the requested
 * target when the CLI can test it, otherwise `DEFAULT_TEST_TARGET` with the
 * refused target reported in `replaced` so the caller can tell the user.
 */
export function testTargetFor(requested: string): TestTargetChoice {
  if (isTestTarget(requested)) return { target: requested };
  return { target: DEFAULT_TEST_TARGET, replaced: requested };
}

/** The notice shown when a test run replaces a target `botopink test` refuses. */
export function testTargetNotice(choice: TestTargetChoice): string | undefined {
  if (choice.replaced === undefined) return undefined;
  return (
    `\`botopink test\` runs only on ${TEST_TARGETS.join(" and ")}; ` +
    `running tests on ${choice.target} instead of ${choice.replaced}.`
  );
}

/** True when `value` is one of the known codegen targets. */
export function isTarget(value: unknown): value is Target {
  return (
    typeof value === "string" && (TARGETS as readonly string[]).includes(value)
  );
}

/** Resolves an arbitrary value to a known target, falling back to the default. */
export function resolveTarget(value: unknown): Target {
  return isTarget(value) ? value : DEFAULT_TARGET;
}

/**
 * Reads the `target` field out of a `botopink.json` text body. Any parse error
 * or unknown/missing target yields `DEFAULT_TARGET`.
 */
export function parseTargetFromJson(text: string): Target {
  try {
    const json = JSON.parse(text) as { target?: unknown };
    return resolveTarget(json.target);
  } catch {
    return DEFAULT_TARGET;
  }
}

/**
 * Serializes a `botopink.json` body with `target` set, preserving the other
 * fields. An unreadable/empty/invalid `existing` is treated as `{}`.
 */
export function writeTargetConfig(
  existing: string | undefined,
  target: Target,
): string {
  let parsed: Record<string, unknown> = {};
  if (existing !== undefined) {
    try {
      const value = JSON.parse(existing) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
  }
  parsed.target = target;
  return JSON.stringify(parsed, null, 2) + "\n";
}
