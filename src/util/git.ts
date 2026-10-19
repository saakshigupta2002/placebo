import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { run } from "./proc.js";

const execFileP = promisify(execFile);

const IDENTITY = {
  GIT_AUTHOR_NAME: "placebo",
  GIT_AUTHOR_EMAIL: "placebo@localhost",
  GIT_COMMITTER_NAME: "placebo",
  GIT_COMMITTER_EMAIL: "placebo@localhost",
};

export async function git(cwd: string, args: string[], allowFail = false): Promise<string> {
  const r = await run("git", args, {
    cwd,
    env: { ...process.env, ...IDENTITY, GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 120_000,
  });
  if (r.code !== 0 && !allowFail) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${r.stderr.trim() || r.stdout.trim()}`,
    );
  }
  return r.stdout;
}

export async function revParse(repo: string, rev: string): Promise<string> {
  return (await git(repo, ["rev-parse", "--verify", `${rev}^{commit}`])).trim();
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const out = await git(dir, ["rev-parse", "--is-inside-work-tree"], true);
  return out.trim() === "true";
}

/** Read one file at a revision. Returns undefined when the file does not exist there. */
export async function showFile(
  repo: string,
  rev: string,
  path: string,
): Promise<Buffer | undefined> {
  try {
    const { stdout } = await execFileP("git", ["show", `${rev}:${path}`], {
      cwd: repo,
      encoding: "buffer",
      maxBuffer: 100_000_000,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * Export the tree at `rev` into `dest` with no git history at all.
 * This is the leakage guard: the agent cannot find the future fix in refs or objects.
 */
export async function exportTree(repo: string, rev: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const tar = join(dest, ".placebo-export.tar");
  await git(repo, ["archive", "--format=tar", "-o", tar, rev]);
  const r = await run("tar", ["-xf", tar, "-C", dest]);
  rmSync(tar, { force: true });
  if (r.code !== 0) throw new Error(`tar extract failed: ${r.stderr}`);
}

/** Turn a plain directory into a one-commit repository so agents that expect git still work. */
export async function snapshot(dir: string, exclude: string[] = []): Promise<void> {
  await git(dir, ["init", "-q", "-b", "main"]);
  if (exclude.length) {
    const info = join(dir, ".git", "info");
    mkdirSync(info, { recursive: true });
    writeFileSync(join(info, "exclude"), `${exclude.map((e) => `/${e}`).join("\n")}\n`);
  }
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-q", "--allow-empty", "--no-verify", "-m", "placebo: task start"]);
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  status: "A" | "M" | "D" | "R";
}

export interface DiffResult {
  files: DiffFile[];
  added: number;
  removed: number;
  patch: string;
}

/** Everything the agent changed since the snapshot, including new untracked files. */
export async function diffSinceSnapshot(dir: string): Promise<DiffResult> {
  if (!existsSync(join(dir, ".git"))) return { files: [], added: 0, removed: 0, patch: "" };
  await git(dir, ["add", "-A"], true);
  const numstat = await git(dir, ["diff", "--cached", "--numstat", "-M", "HEAD"], true);
  const status = await git(dir, ["diff", "--cached", "--name-status", "-M", "HEAD"], true);
  const patch = await git(dir, ["diff", "--cached", "-M", "HEAD"], true);
  const statusByPath = new Map<string, DiffFile["status"]>();
  for (const line of status.split("\n").filter(Boolean)) {
    const [st, ...paths] = line.split("\t");
    const p = paths[paths.length - 1] ?? "";
    statusByPath.set(p, (st?.[0] ?? "M") as DiffFile["status"]);
  }
  const files: DiffFile[] = [];
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [a, r, ...rest] = line.split("\t");
    let path = rest.join("\t");
    const arrow = path.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    if (arrow) path = `${arrow[1]}${arrow[3]}${arrow[4]}`;
    else if (path.includes(" => ")) path = path.split(" => ")[1] ?? path;
    files.push({
      path,
      added: a === "-" ? 0 : Number(a),
      removed: r === "-" ? 0 : Number(r),
      status: statusByPath.get(path) ?? "M",
    });
  }
  return {
    files,
    added: files.reduce((s, f) => s + f.added, 0),
    removed: files.reduce((s, f) => s + f.removed, 0),
    patch: patch.length > 400_000 ? `${patch.slice(0, 400_000)}\n[truncated]\n` : patch,
  };
}
