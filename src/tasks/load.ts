import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import YAML from "yaml";
import { sha256 } from "../util/hash.js";
import { type Task, TaskSchema, type TaskSpec } from "./schema.js";

export class TaskLoadError extends Error {}

export function parseTask(file: string, text: string): Task {
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    throw new TaskLoadError(`${file}: invalid YAML (${(err as Error).message})`);
  }
  const parsed = TaskSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new TaskLoadError(`${file}: ${issues.join("; ")}`);
  }
  const spec = parsed.data;
  const base = dirname(file);
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));
  return {
    ...spec,
    file,
    repoPath: abs(spec.repo),
    hiddenDirPath: spec.hidden.dir ? abs(spec.hidden.dir) : undefined,
    solutionDirPath: spec.solution?.dir ? abs(spec.solution.dir) : undefined,
    hash: sha256(JSON.stringify(spec)).slice(0, 16),
  };
}

export function loadTaskFile(file: string): Task {
  return parseTask(resolve(file), readFileSync(file, "utf8"));
}

/** Load every *.yaml / *.yml task under a directory (non-recursive), sorted by id. */
export function loadTasks(pathOrDir: string): Task[] {
  const p = resolve(pathOrDir);
  if (!existsSync(p)) throw new TaskLoadError(`No tasks found at ${p}`);
  if (statSync(p).isFile()) return [loadTaskFile(p)];
  const files = readdirSync(p)
    .filter((f) => [".yaml", ".yml"].includes(extname(f)))
    .map((f) => join(p, f));
  const tasks = files.map(loadTaskFile).sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.id)) throw new TaskLoadError(`Duplicate task id "${t.id}" in ${p}`);
    seen.add(t.id);
  }
  return tasks;
}

export function serializeTask(spec: TaskSpec): string {
  const ordered = {
    id: spec.id,
    title: spec.title,
    source: spec.source,
    repo: spec.repo,
    base: spec.base,
    prompt: spec.prompt,
    hidden: spec.hidden,
    check: spec.check,
    ...(spec.setup ? { setup: spec.setup } : {}),
    ...(spec.link.length ? { link: spec.link } : {}),
    ...(spec.solution ? { solution: spec.solution } : {}),
    timeout: spec.timeout,
    checkTimeout: spec.checkTimeout,
    ...(spec.tags.length ? { tags: spec.tags } : {}),
  };
  return YAML.stringify(ordered, { lineWidth: 100 });
}

/** Replace {files} in a check command with the hidden test paths, shell-quoted. */
export function renderCheck(task: Pick<TaskSpec, "check" | "hidden">): string {
  const files = task.hidden.files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(" ");
  return task.check.replaceAll("{files}", files);
}
