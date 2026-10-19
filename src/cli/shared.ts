import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TrialRecord } from "../core/types.js";
import { loadTasks } from "../tasks/load.js";
import { materializePack } from "../tasks/packs.js";
import type { Task } from "../tasks/schema.js";
import { readJson } from "../util/fs.js";
import { run } from "../util/proc.js";

export function placeboDir(cwd: string): string {
  return join(cwd, ".placebo");
}

export function trialsDir(cwd: string): string {
  return join(placeboDir(cwd), "trials");
}

export function listTrialDirs(cwd: string): string[] {
  const dir = trialsDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => existsSync(join(p, "trial.json")))
    .sort(
      (a, b) => statSync(join(b, "trial.json")).mtimeMs - statSync(join(a, "trial.json")).mtimeMs,
    );
}

/** Resolve a trial by id, by path or (when omitted) the most recent one. */
export function resolveTrial(cwd: string, ref?: string): { dir: string; trial: TrialRecord } {
  let dir: string | undefined;
  if (!ref) dir = listTrialDirs(cwd)[0];
  else if (existsSync(join(resolve(cwd, ref), "trial.json"))) dir = resolve(cwd, ref);
  else if (existsSync(resolve(cwd, ref)) && ref.endsWith("trial.json"))
    dir = resolve(cwd, ref, "..");
  else if (existsSync(join(trialsDir(cwd), ref, "trial.json"))) dir = join(trialsDir(cwd), ref);
  if (!dir)
    throw new Error(ref ? `Trial not found: ${ref}` : "No trials yet. Run `placebo trial` first.");
  return { dir, trial: readJson<TrialRecord>(join(dir, "trial.json")) };
}

export interface TaskSourceOptions {
  pack?: string;
  tasks?: string;
}

export async function resolveTaskSource(
  cwd: string,
  o: TaskSourceOptions,
): Promise<{ tasks: Task[]; label: string }> {
  if (o.pack) {
    const { tasksDir } = await materializePack(o.pack, join(placeboDir(cwd), "packs"));
    return { tasks: loadTasks(tasksDir), label: `pack ${o.pack}` };
  }
  const dir = resolve(cwd, o.tasks ?? join(".placebo", "tasks"));
  if (!existsSync(dir)) {
    throw new Error(
      "No tasks found. Mine some from your history with `placebo mine`, point at a folder with --tasks, or try the bundled pack with --pack starter-js.",
    );
  }
  const tasks = loadTasks(dir);
  if (!tasks.length) throw new Error(`No task files in ${dir}.`);
  return { tasks, label: o.tasks ?? ".placebo/tasks" };
}

export async function openPath(path: string): Promise<void> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  await run(cmd, [path]).catch(() => undefined);
}

export function parseNumber(
  name: string,
  v: string | undefined,
  opts: { min?: number; integer?: boolean } = {},
): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (
    !Number.isFinite(n) ||
    (opts.integer && !Number.isInteger(n)) ||
    (opts.min !== undefined && n < opts.min)
  ) {
    throw new Error(
      `--${name} must be ${opts.integer ? "an integer" : "a number"}${opts.min !== undefined ? ` of at least ${opts.min}` : ""}.`,
    );
  }
  return n;
}
