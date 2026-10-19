import { applyHidden } from "../isolation/workspace.js";
import { renderCheck } from "../tasks/load.js";
import type { Task } from "../tasks/schema.js";
import { sh } from "../util/proc.js";

export interface CheckResult {
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  command: string;
}

/** Restore the hidden tests over whatever the agent left, then run the task's check command. */
export async function runCheck(task: Task, workspace: string): Promise<CheckResult> {
  await applyHidden(task, workspace);
  const command = renderCheck(task);
  const r = await sh(command, {
    cwd: workspace,
    timeoutMs: task.checkTimeout * 1000,
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return {
    passed: r.code === 0 && !r.timedOut,
    exitCode: r.code,
    timedOut: r.timedOut,
    output: `$ ${command}\n${r.stdout}${r.stderr}`.slice(-20_000),
    command,
  };
}
