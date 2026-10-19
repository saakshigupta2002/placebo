import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { ensureDir, removeDir, writeText } from "../util/fs.js";
import { hashDir } from "../util/hash.js";
import { run } from "../util/proc.js";
import { serializeTask } from "./load.js";
import { TaskSchema } from "./schema.js";

export interface PackInfo {
  name: string;
  description: string;
  language: string;
  dir: string;
  taskCount: number;
}

interface PackMeta {
  name: string;
  description: string;
  language: string;
  check: string;
  timeout?: number;
  checkTimeout?: number;
}

interface PackTaskMeta {
  title: string;
  kind?: string;
  prompt: string;
  hidden: string[];
  setup?: string;
}

/** Locate the bundled packs folder from either src/ (dev, tests) or dist/ (published). */
export function packsRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "packs");
    if (
      existsSync(candidate) &&
      readdirSync(candidate).some((n) => existsSync(join(candidate, n, "pack.yaml")))
    )
      return candidate;
    dir = dirname(dir);
  }
  throw new Error("Could not find the bundled task packs.");
}

function readMeta(dir: string): PackMeta {
  return YAML.parse(readFileSync(join(dir, "pack.yaml"), "utf8")) as PackMeta;
}

export function listPacks(root = packsRoot()): PackInfo[] {
  return readdirSync(root)
    .filter((n) => existsSync(join(root, n, "pack.yaml")))
    .map((n) => {
      const dir = join(root, n);
      const meta = readMeta(dir);
      const tasks = readdirSync(join(dir, "tasks")).filter((t) =>
        statSync(join(dir, "tasks", t)).isDirectory(),
      );
      return {
        name: meta.name,
        description: meta.description,
        language: meta.language,
        dir,
        taskCount: tasks.length,
      };
    });
}

const FIXED_DATE = "2026-01-01T00:00:00Z";

/**
 * Materialise a pack into `<destRoot>/<name>`: a git repo with one fixed-date commit
 * (so the base hash is identical on every machine), plus task YAML files.
 * Re-running is a no-op unless the pack changed.
 */
export async function materializePack(
  name: string,
  destRoot: string,
  root = packsRoot(),
): Promise<{ tasksDir: string; repoDir: string; tasks: number }> {
  const src = join(root, name);
  if (!existsSync(join(src, "pack.yaml"))) {
    throw new Error(
      `Unknown pack "${name}". Available: ${listPacks(root)
        .map((p) => p.name)
        .join(", ")}`,
    );
  }
  const meta = readMeta(src);
  const dest = resolve(destRoot, name);
  const tasksDir = join(dest, "tasks");
  const repoDir = join(dest, "repo");
  const hash = hashDir(src);
  const stamp = join(dest, ".pack-hash");
  if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === hash) {
    return {
      tasksDir,
      repoDir,
      tasks: readdirSync(tasksDir).filter((f) => f.endsWith(".yaml")).length,
    };
  }
  removeDir(dest);
  ensureDir(dest);
  cpSync(join(src, "repo"), repoDir, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "placebo",
    GIT_AUTHOR_EMAIL: "placebo@localhost",
    GIT_COMMITTER_NAME: "placebo",
    GIT_COMMITTER_EMAIL: "placebo@localhost",
    GIT_AUTHOR_DATE: FIXED_DATE,
    GIT_COMMITTER_DATE: FIXED_DATE,
  };
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["add", "-A"],
    ["commit", "-q", "--no-verify", "-m", `${meta.name}: base`],
  ]) {
    const r = await run("git", args, { cwd: repoDir, env });
    if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
  }
  const base = (await run("git", ["rev-parse", "HEAD"], { cwd: repoDir })).stdout.trim();
  const ids = readdirSync(join(src, "tasks"))
    .filter((t) => statSync(join(src, "tasks", t)).isDirectory())
    .sort();
  for (const id of ids) {
    const tdir = join(src, "tasks", id);
    const t = YAML.parse(readFileSync(join(tdir, "task.yaml"), "utf8")) as PackTaskMeta;
    cpSync(join(tdir, "hidden"), join(dest, "fixtures", id, "hidden"), { recursive: true });
    if (existsSync(join(tdir, "solution")))
      cpSync(join(tdir, "solution"), join(dest, "fixtures", id, "solution"), { recursive: true });
    const spec = TaskSchema.parse({
      id,
      title: t.title,
      source: "pack",
      repo: "../repo",
      base,
      prompt: t.prompt.trim(),
      hidden: { dir: `../fixtures/${id}/hidden`, files: t.hidden },
      check: meta.check,
      setup: t.setup,
      solution: existsSync(join(tdir, "solution"))
        ? { dir: `../fixtures/${id}/solution` }
        : undefined,
      timeout: meta.timeout ?? 600,
      checkTimeout: meta.checkTimeout ?? 120,
      tags: [meta.name, ...(t.kind ? [t.kind] : [])],
    });
    writeText(join(tasksDir, `${id}.yaml`), serializeTask(spec));
  }
  writeText(stamp, `${hash}\n`);
  return { tasksDir, repoDir, tasks: ids.length };
}
