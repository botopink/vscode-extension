// Pure `botopink.json` target parsing / serialization. Free of any `vscode`
// import so it is unit-testable without a host. `target.ts` (the `TargetManager`)
// layers the status-bar + file I/O on top of these.

/** Codegen targets understood by the `botopink` CLI / `botopink.json`. */
export const TARGETS = ["commonJS", "erlang", "beam", "wasm"] as const;
export type Target = (typeof TARGETS)[number];

export const DEFAULT_TARGET: Target = "commonJS";

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
