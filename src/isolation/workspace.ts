import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InstructionsRef } from "../core/types.js";
import type { Task } from "../tasks/schema.js";
import { exportTree, showFile, snapshot } from "../util/git.js";
import { sh } from "../util/proc.js";

export interface WorkspaceOptions {
  /** Directory to create the workspace in (must not exist or be empty). */
  dir: string;
  /** Start from the reference solution instead of the base (used to validate tasks). */
  atSolution?: boolean;
  instructions?: InstructionsRef;
  /** Extra paths to keep out of the diff (e.g. planted canary files). */
  exclude?: string[];
  /** Files to plant before the snapshot, relative path to content. */
  plant?: Record<string, string>;
}

export interface Workspace {
  dir: string;
  setupOk: boolean;
  setupLog: string;
}

/**
 * Build an isolated workspace for one run:
 * export the tree at the base commit (no history), link heavy dependency folders,
 * add arm-specific instructions, commit a one-commit snapshot, then run setup.
 */
export async function createWorkspace(task: Task, opts: WorkspaceOptions): Promise<Workspace> {
  const dir = opts.dir;
  mkdirSync(dir, { recursive: true });
  const rev = opts.atSolution && task.solution?.commit ? task.solution.commit : task.base;
  await exportTree(task.repoPath, rev, dir);
  if (opts.atSolution && task.solutionDirPath) {
    cpSync(task.solutionDirPath, dir, { recursive: true });
  }
  const exclude = [...(opts.exclude ?? [])];
  for (const rel of task.link) {
    const src = join(task.repoPath, rel);
    const dest = join(dir, rel);
    if (existsSync(src) && !existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      symlinkSync(src, dest);
      exclude.push(rel);
    }
  }
  for (const [rel, content] of Object.entries(opts.plant ?? {})) {
    const dest = join(dir, rel);
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      exclude.push(rel);
    }
  }
  if (opts.instructions) {
    writeFileSync(join(dir, opts.instructions.fileName), opts.instructions.content);
  }
  await snapshot(dir, exclude);
  let setupOk = true;
  let setupLog = "";
  if (task.setup) {
    const r = await sh(task.setup, { cwd: dir, timeoutMs: task.checkTimeout * 1000 });
    setupOk = r.code === 0;
    setupLog = (r.stdout + r.stderr).slice(-4000);
    // Setup output (installed deps, build files) is not the agent's work.
    await snapshot(dir, exclude);
  }
  return { dir, setupOk, setupLog };
}

/** Write the hidden test files into a workspace, overwriting anything the agent did to them. */
export async function applyHidden(task: Task, dir: string): Promise<void> {
  for (const rel of task.hidden.files) {
    let content: Buffer | undefined;
    if (task.hiddenDirPath) {
      const p = join(task.hiddenDirPath, rel);
      if (existsSync(p)) content = readFileSync(p);
    } else if (task.hidden.from) {
      content = await showFile(task.repoPath, task.hidden.from, rel);
    }
    if (content === undefined) throw new Error(`hidden file ${rel} not found for task ${task.id}`);
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
}
