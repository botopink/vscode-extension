// Pure CLI-argument construction for the `botopink` task provider. Free of any
// `vscode` import so it is unit-testable without a host. `tasks.ts` consumes
// these and only adds the VS Code task plumbing on top.

/** CLI subcommands surfaced as tasks. */
export type BotopinkCommand = "check" | "build" | "test" | "format";

/** The fields of a task definition that influence the CLI invocation. */
export interface TaskSpec {
  command: BotopinkCommand;
  /** Optional codegen target (build/test). Falls back to the active target. */
  target?: string;
  /** Optional `--filter <substr>` for `test`. */
  filter?: string;
}

/**
 * Builds the CLI argument vector for a task definition.
 *
 * `activeTarget` is the workspace's current codegen target, applied to
 * build/test when the definition does not pin its own.
 */
export function argsFor(spec: TaskSpec, activeTarget: string): string[] {
  const args: string[] = [spec.command];
  switch (spec.command) {
    case "build":
      args.push("--target", spec.target ?? activeTarget);
      break;
    case "test":
      // Only commonJS / erlang run tests; honour the active target so an
      // erlang project still works, defaulting otherwise.
      args.push("--target", spec.target ?? activeTarget);
      if (spec.filter) {
        args.push("--filter", spec.filter);
      }
      break;
    case "check":
    case "format":
      // `check` reads botopink.json; `format` rewrites in place.
      break;
  }
  return args;
}

/** The human-readable task label (build/test carry the resolved target). */
export function taskLabel(spec: TaskSpec, activeTarget: string): string {
  if (spec.command === "build" || spec.command === "test") {
    return `${spec.command} (${spec.target ?? activeTarget})`;
  }
  return spec.command;
}

/**
 * The task-group kind for a command, as a backend-neutral string. `tasks.ts`
 * maps this onto `vscode.TaskGroup`; `undefined` means "no group".
 */
export function taskGroupKind(
  command: BotopinkCommand,
): "build" | "test" | undefined {
  switch (command) {
    case "build":
      return "build";
    case "test":
      return "test";
    default:
      return undefined;
  }
}
