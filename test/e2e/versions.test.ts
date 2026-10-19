import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildArms, resolveBaseline } from "../../src/core/intervention.js";
import { runTrial } from "../../src/core/trial.js";
import { verifyIsolation } from "../../src/isolation/verify.js";
import { loadTasks } from "../../src/tasks/load.js";
import { materializePack } from "../../src/tasks/packs.js";
import type { Task } from "../../src/tasks/schema.js";
import { ensureDir, makeTempDir, removeDir } from "../../src/util/fs.js";
import { git } from "../../src/util/git.js";

const fixtures = join(import.meta.dirname, "..", "fixtures", "skills", "versions");
const v1 = join(fixtures, "v1", "reviewer");
const v2 = join(fixtures, "v2", "reviewer");
let root: string;
let tasks: Task[];

beforeAll(async () => {
  root = makeTempDir("versions");
  const { tasksDir } = await materializePack("starter-js", join(root, "packs"));
  tasks = loadTasks(tasksDir);
});
afterAll(() => removeDir(root));

describe("comparing two versions of a skill", () => {
  it("puts the old version in control and the new one in treatment", async () => {
    const { intervention, arms } = await buildArms({ agent: "fake", skill: v2, baseline: v1 });
    expect(intervention.kind).toBe("skill-version");
    expect(intervention.label).toBe("reviewer (new vs v1/reviewer)");
    expect(arms.control.skills).toEqual([{ name: "reviewer", dir: v1 }]);
    expect(arms.treatment.skills).toEqual([{ name: "reviewer", dir: v2 }]);
    expect(intervention.baseline?.contentHash).not.toBe(intervention.contentHash);
  });

  it("refuses identical versions", async () => {
    await expect(buildArms({ agent: "fake", skill: v2, baseline: v2 })).rejects.toThrow(
      /identical/,
    );
  });

  it("verifies that each arm loaded its own version", () => {
    const arms = {
      control: {
        name: "control" as const,
        agent: "claude-code",
        skills: [{ name: "reviewer", dir: v1 }],
      },
      treatment: {
        name: "treatment" as const,
        agent: "claude-code",
        skills: [{ name: "reviewer", dir: v2 }],
      },
    };
    const snap = {
      skills: ["keybindings-help", "placebo-intervention:reviewer"],
      plugins: ["placebo-intervention"],
      mcpServers: [],
    };
    const ok = verifyIsolation("flags", arms, snap, snap, []);
    expect(ok.verified).toBe(true);
    expect(ok.notes.join(" ")).toMatch(/baseline version of reviewer/);
    const bare = { skills: ["keybindings-help"], plugins: [], mcpServers: [] };
    expect(verifyIsolation("flags", arms, bare, snap, []).notes.join(" ")).toMatch(
      /should have loaded only the baseline/,
    );
  });

  it("reports the better version and how often each one fired", async () => {
    const { intervention, arms } = await buildArms({ agent: "fake", skill: v2, baseline: v1 });
    const { trial } = await runTrial({
      cwd: root,
      tasks,
      intervention,
      arms,
      repeats: 2,
      concurrency: 6,
      seed: 7,
      isolation: "flags",
      allowWeb: false,
      budgetUsd: null,
      maxRuns: null,
      untilConfident: false,
      minTasks: 6,
      keepWorkspaces: false,
      trialsDir: join(root, "trials"),
    });
    expect(trial.isolation.verified).toBe(true);
    expect(trial.results?.verdict.label).toBe("WORKS");
    expect(trial.results?.verdict.headline).toMatch(/^New version: /);
    expect(trial.results?.activation?.control?.runs).toBe(24);
    expect(trial.results?.activation?.fired).toBeGreaterThan(18);
  });

  it("uses a git revision as the baseline", async () => {
    const repo = makeTempDir("skillrepo");
    try {
      const dir = ensureDir(join(repo, "skills", "reviewer"));
      await git(repo, ["init", "-q", "-b", "main"]);
      writeFileSync(join(dir, "SKILL.md"), readFileSync(join(v1, "SKILL.md")));
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-q", "-m", "v1"]);
      writeFileSync(join(dir, "SKILL.md"), readFileSync(join(v2, "SKILL.md")));
      const base = await resolveBaseline("HEAD", dir, join(root, "cache"));
      expect(readFileSync(join(base.dir, "SKILL.md"), "utf8")).toContain("solve: 0,");
      const { arms } = await buildArms({ agent: "fake", skill: dir, baseline: "HEAD" });
      expect(readFileSync(join(arms.control.skills[0]!.dir, "SKILL.md"), "utf8")).toContain(
        "Look over the diff before you stop.\n",
      );
      expect(readFileSync(join(arms.treatment.skills[0]!.dir, "SKILL.md"), "utf8")).toContain(
        "Read the failing tests first.",
      );
      await expect(resolveBaseline("not-a-rev", dir, join(root, "cache"))).rejects.toThrow(
        /not a folder, a URL or a git revision/,
      );
    } finally {
      removeDir(repo);
    }
  });
});
