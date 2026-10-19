import { existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { ensureDir, writeText } from "../util/fs.js";
import { git, revParse, showFile } from "../util/git.js";
import { slug } from "../util/ids.js";
import { parseTask, serializeTask } from "./load.js";
import type { Task, TaskSpec } from "./schema.js";
import { TaskSchema } from "./schema.js";
import { validateTask } from "./validate.js";

export const TEST_FILE =
  /(^|\/)(test|tests|__tests__|spec|specs)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$|_spec\.rb$/;
const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".scala",
  ".ex",
  ".exs",
  ".vue",
  ".svelte",
]);
const SKIP_SUBJECT = /^(revert|merge|bump|release|chore\(release\)|chore\(deps\)|v?\d+\.\d+\.\d+)/i;
const TRAILER = /^(signed-off-by|co-authored-by|reviewed-by|change-id|cc):/i;

export interface MineOptions {
  repo: string;
  outDir: string;
  maxTasks: number;
  scan: number;
  testCmd?: string;
  validate: boolean;
  maxSourceFiles: number;
  maxSourceLines: number;
  /** Skip commits that touch more test files than this (suite migrations). */
  maxTestFiles: number;
  since?: string;
  onProgress?: (msg: string, kind: "accept" | "reject" | "info") => void;
}

export interface MineResult {
  written: Task[];
  rejected: { sha: string; subject: string; reason: string }[];
  scanned: number;
}

interface Commit {
  sha: string;
  parents: string[];
  subject: string;
  body: string;
}

async function listCommits(repo: string, scan: number, since?: string): Promise<Commit[]> {
  const args = ["log", "--no-merges", `-n${scan}`, "--format=%H%x1f%P%x1f%s%x1f%b%x1e"];
  if (since) args.push(`--since=${since}`);
  const out = await git(repo, args);
  return out
    .split("\x1e")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, parents, subject, body] = rec.split("\x1f");
      return {
        sha: sha!,
        parents: (parents ?? "").split(" ").filter(Boolean),
        subject: subject ?? "",
        body: body ?? "",
      };
    });
}

/** Pick a test command for the repo as it was at `rev`. Returns a command with a {files} placeholder where possible. */
export async function detectTestCommand(
  repo: string,
  rev: string,
  testFiles: string[],
): Promise<string | undefined> {
  const exts = new Set(testFiles.map((f) => extname(f)));
  if ([...exts].some((e) => [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(e))) {
    const pkgRaw = await showFile(repo, rev, "package.json");
    if (pkgRaw) {
      let pkg: Record<string, any> = {};
      try {
        pkg = JSON.parse(pkgRaw.toString("utf8"));
      } catch {
        // not JSON
      }
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const script = String(pkg.scripts?.test ?? "");
      if (deps.vitest || /\bvitest\b/.test(script)) return "npx vitest run {files}";
      if (deps.jest || /\bjest\b/.test(script)) return "npx jest {files}";
      if (deps.mocha || /\bmocha\b/.test(script)) return "npx mocha {files}";
      if (deps.ava) return "npx ava {files}";
      if (/node\s+--test/.test(script) || exts.has(".mjs") || exts.has(".js"))
        return "node --test {files}";
      if (script && !/no test specified/.test(script)) return "npm test";
    }
  }
  if (exts.has(".py")) {
    const py = existsSync(join(repo, ".venv", "bin", "python")) ? ".venv/bin/python" : "python3";
    const hasPytest =
      (await showFile(repo, rev, "conftest.py")) !== undefined ||
      (await showFile(repo, rev, "pytest.ini")) !== undefined ||
      /pytest/.test((await showFile(repo, rev, "pyproject.toml"))?.toString("utf8") ?? "") ||
      /pytest/.test((await showFile(repo, rev, "requirements-dev.txt"))?.toString("utf8") ?? "") ||
      /pytest/.test((await showFile(repo, rev, "requirements.txt"))?.toString("utf8") ?? "");
    return hasPytest ? `${py} -m pytest -q {files}` : `${py} -m unittest {files}`;
  }
  if (exts.has(".go")) {
    const pkgs = [...new Set(testFiles.map((f) => `./${dirname(f)}`))].join(" ");
    return `go test ${pkgs}`;
  }
  if (exts.has(".rs")) return "cargo test";
  if (exts.has(".rb") && testFiles.some((f) => f.endsWith("_spec.rb")))
    return "bundle exec rspec {files}";
  return undefined;
}

export function buildPrompt(subject: string, body: string, testFiles: string[]): string {
  const cleanBody = body
    .split("\n")
    .filter((l) => !TRAILER.test(l.trim()))
    .join("\n")
    .trim()
    .slice(0, 1500);
  const parts = [subject.trim()];
  if (cleanBody) parts.push(cleanBody);
  parts.push(
    `Make this change in the repository. Hidden tests will check your work; they live at ${testFiles.map((f) => `\`${f}\``).join(", ")}. Do not change those test files. When you are done, stop.`,
  );
  return parts.join("\n\n");
}

export async function mineTasks(o: MineOptions): Promise<MineResult> {
  const repo = resolve(o.repo);
  await revParse(repo, "HEAD");
  const outDir = ensureDir(resolve(o.outDir));
  const commits = await listCommits(repo, o.scan, o.since);
  const written: Task[] = [];
  const rejected: MineResult["rejected"] = [];
  const link = ["node_modules", ".venv", "venv", "vendor/bundle"].filter((p) =>
    existsSync(join(repo, p)),
  );
  const reject = (c: Commit, reason: string) => {
    rejected.push({ sha: c.sha, subject: c.subject, reason });
    o.onProgress?.(`${c.sha.slice(0, 7)} ${c.subject.slice(0, 60)}: ${reason}`, "reject");
  };

  for (const c of commits) {
    if (written.length >= o.maxTasks) break;
    if (c.parents.length !== 1) continue;
    if (SKIP_SUBJECT.test(c.subject)) continue;
    const parent = c.parents[0]!;
    const numstat = await git(repo, ["diff", "--numstat", "--no-renames", parent, c.sha]);
    const status = await git(repo, ["diff", "--name-status", "--no-renames", parent, c.sha]);
    const deleted = new Set(
      status
        .split("\n")
        .filter((l) => l.startsWith("D\t"))
        .map((l) => l.slice(2)),
    );
    const testFiles: string[] = [];
    let srcFiles = 0;
    let srcLines = 0;
    for (const line of numstat.split("\n").filter(Boolean)) {
      const [a, r, path] = line.split("\t");
      if (!path || deleted.has(path)) continue;
      if (TEST_FILE.test(path)) testFiles.push(path);
      else if (CODE_EXT.has(extname(path))) {
        srcFiles++;
        srcLines += (a === "-" ? 0 : Number(a)) + (r === "-" ? 0 : Number(r));
      }
    }
    if (!testFiles.length || !srcFiles) continue;
    if (testFiles.length > o.maxTestFiles) {
      reject(c, `touches ${testFiles.length} test files (a test-suite change, not a task)`);
      continue;
    }
    if (srcFiles > o.maxSourceFiles || srcLines > o.maxSourceLines) {
      reject(c, `change too large (${srcFiles} files, ${srcLines} lines)`);
      continue;
    }
    const check = o.testCmd ?? (await detectTestCommand(repo, c.sha, testFiles));
    if (!check) {
      reject(c, "could not detect a test command (pass --test-cmd)");
      continue;
    }
    const spec: TaskSpec = TaskSchema.parse({
      id: `${slug(c.subject, 40)}-${c.sha.slice(0, 7)}`,
      title: c.subject.slice(0, 120),
      source: "git",
      repo: relative(outDir, repo) || ".",
      base: parent,
      prompt: buildPrompt(c.subject, c.body, testFiles),
      hidden: { from: c.sha, files: testFiles },
      check,
      link,
      solution: { commit: c.sha },
    });
    const file = join(outDir, `${spec.id}.yaml`);
    const text = serializeTask(spec);
    const task = parseTask(file, text);
    if (o.validate) {
      o.onProgress?.(`validating ${c.sha.slice(0, 7)} ${c.subject.slice(0, 60)}`, "info");
      const v = await validateTask(task);
      if (!v.ok) {
        reject(c, v.reason ?? "invalid");
        continue;
      }
    }
    writeText(file, text);
    written.push(task);
    o.onProgress?.(`${spec.id}`, "accept");
  }
  return { written, rejected, scanned: commits.length };
}
