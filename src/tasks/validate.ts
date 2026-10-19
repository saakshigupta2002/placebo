import { runCheck } from "../grading/check.js";
import { createWorkspace } from "../isolation/workspace.js";
import { makeTempDir, removeDir } from "../util/fs.js";
import type { Task } from "./schema.js";

/** The most useful single line from a failing check: the first error or assertion message. */
export function firstError(output: string | undefined): string | undefined {
  if (!output) return undefined;
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = lines.find(
    (l) =>
      /(Error|error:|Cannot find|not found|ERR_|FAIL|failed|AssertionError|ModuleNotFound|ImportError|No module)/.test(
        l,
      ) && !l.startsWith("at "),
  );
  return hit ? hit.slice(0, 160) : undefined;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  /** Check output at the base commit (expected to fail). */
  baseOutput?: string;
  /** Check output with the reference solution (expected to pass). */
  solutionOutput?: string;
}

async function checkAt(
  task: Task,
  atSolution: boolean,
): Promise<{ passed: boolean; output: string; setupOk: boolean }> {
  const dir = makeTempDir("validate");
  try {
    const ws = await createWorkspace(task, { dir, atSolution });
    if (!ws.setupOk) return { passed: false, output: ws.setupLog, setupOk: false };
    const r = await runCheck(task, dir);
    return { passed: r.passed, output: r.output, setupOk: true };
  } finally {
    removeDir(dir);
  }
}

/**
 * A task is valid when the hidden tests fail before the change and pass with the real change,
 * twice in a row (to drop flaky tests). Tasks without a reference solution only get the first check.
 */
export async function validateTask(task: Task): Promise<ValidationResult> {
  if (!task.hidden.files.length)
    return { ok: true, reason: "no hidden tests; check command runs as is" };
  const base = await checkAt(task, false);
  if (!base.setupOk)
    return {
      ok: false,
      reason: `setup command failed${firstError(base.output) ? `: ${firstError(base.output)}` : ""}`,
      baseOutput: base.output,
    };
  if (base.passed)
    return {
      ok: false,
      reason: "hidden tests already pass before the change",
      baseOutput: base.output,
    };
  if (!task.solution?.commit && !task.solutionDirPath) return { ok: true, baseOutput: base.output };
  for (let i = 0; i < 2; i++) {
    const sol = await checkAt(task, true);
    if (!sol.passed) {
      return {
        ok: false,
        reason:
          i === 0
            ? "hidden tests fail even with the real change (environment or dependencies)"
            : "flaky: tests passed once then failed",
        baseOutput: base.output,
        solutionOutput: sol.output,
      };
    }
    if (i === 1) return { ok: true, baseOutput: base.output, solutionOutput: sol.output };
  }
  return { ok: true };
}
