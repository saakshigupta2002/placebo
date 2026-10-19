import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetFakeAgent } from "../../src/adapters/fake.js";
import { buildArms } from "../../src/core/intervention.js";
import { runTrial } from "../../src/core/trial.js";
import type { TrialRecord } from "../../src/core/types.js";
import { loadTasks } from "../../src/tasks/load.js";
import { materializePack } from "../../src/tasks/packs.js";
import type { Task } from "../../src/tasks/schema.js";
import { makeTempDir, removeDir } from "../../src/util/fs.js";
import { VERSION } from "../../src/version.js";

let root: string;
let tasks: Task[];
const skill = (name: string) => join(import.meta.dirname, "..", "fixtures", "skills", name);

beforeAll(async () => {
  root = makeTempDir("e2e");
  const { tasksDir } = await materializePack("starter-js", join(root, "packs"));
  tasks = loadTasks(tasksDir);
});

afterAll(() => removeDir(root));

async function trial(
  name: string,
  extra: Partial<Parameters<typeof runTrial>[0]> = {},
): Promise<{ trial: TrialRecord; dir: string }> {
  const { intervention, arms } = await buildArms({ agent: "fake", skill: skill(name) });
  return runTrial({
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
    ...extra,
  });
}

describe("full trials with the deterministic agent", () => {
  it("a helpful skill WORKS and the reports are written", async () => {
    const { trial: t, dir } = await trial("helpful");
    expect(t.results?.verdict.label).toBe("WORKS");
    expect(t.isolation.verified).toBe(true);
    expect(t.runs).toHaveLength(48);
    expect(t.results?.activation?.fired).toBeGreaterThan(20);
    for (const f of ["trial.json", "report.html", "REPORT.md", "badge.svg", "badge.json"])
      expect(existsSync(join(dir, f))).toBe(true);
    const saved = JSON.parse(readFileSync(join(dir, "trial.json"), "utf8")) as TrialRecord;
    expect(saved.schema).toBe("placebo.trial/v1");
    expect(saved.placeboVersion).toBe(VERSION);
    expect(saved.intervention.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const run = saved.runs.find((r) => r.status === "passed")!;
    expect(existsSync(join(dir, run.dir, "diff.patch"))).toBe(true);
    expect(existsSync(join(dir, run.dir, "check.log"))).toBe(true);
  });

  it("a skill that never fires is a PLACEBO", async () => {
    const { trial: t } = await trial("inert");
    expect(t.results?.verdict.label).toBe("PLACEBO");
    expect(t.results?.activation).toEqual({ fired: 0, runs: 24 });
  });

  it("a skill that tampers with tests is HARMFUL and the tampering is caught", async () => {
    const { trial: t } = await trial("cheater");
    expect(t.results?.verdict.label).toBe("HARMFUL");
    expect(t.results?.adverse.events["test-tamper"]?.treatment).toBe(24);
    expect(t.results?.adverse.events["test-tamper"]?.control ?? 0).toBe(0);
  });

  it("a skill that leaks secrets is HARMFUL even when tests pass", async () => {
    const { trial: t } = await trial("leaker");
    expect(t.results?.verdict.label).toBe("HARMFUL");
    expect(t.results?.adverse.criticalTreatment).toBe(24);
    expect(t.results?.verdict.headline).toMatch(/dangerous/);
  });

  it("a skill that only adds cost is HARMFUL", async () => {
    const { trial: t } = await trial("costly");
    expect(t.results?.verdict.label).toBe("HARMFUL");
    expect(t.results?.verdict.headline).toMatch(/more with no gain/);
  });

  it("stops early once the result is settled", async () => {
    const { trial: t } = await trial("costly", {
      untilConfident: true,
      minTasks: 6,
      concurrency: 2,
    });
    expect(t.design.stoppedEarly).toMatch(/confident/);
    expect(t.runs.length).toBeLessThan(48);
  });

  it("stops on a usage limit and resumes without redoing finished runs", async () => {
    resetFakeAgent();
    process.env.PLACEBO_FAKE_LIMIT = "10";
    let first: TrialRecord;
    try {
      ({ trial: first } = await trial("helpful", { concurrency: 2 }));
    } finally {
      delete process.env.PLACEBO_FAKE_LIMIT;
    }
    expect(first.design.stoppedEarly).toMatch(/usage limit/);
    expect(first.design.stoppedEarly).toContain(`--resume ${first.id}`);
    const kept = first.runs.filter((r) => r.status !== "error");
    expect(kept.length).toBe(10);
    const { trial: resumed } = await trial("helpful", { resume: first, concurrency: 4 });
    expect(resumed.id).toBe(first.id);
    expect(resumed.runs).toHaveLength(48);
    expect(resumed.runs.filter((r) => r.status === "error")).toHaveLength(0);
    for (const r of kept) expect(resumed.runs).toContainEqual(r);
    expect(resumed.results?.verdict.label).toBe("WORKS");
  });

  it("respects the run cap", async () => {
    const { trial: t } = await trial("helpful", { maxRuns: 10, concurrency: 2 });
    expect(t.runs.length).toBeLessThanOrEqual(10);
    expect(t.design.stoppedEarly).toMatch(/max-runs/);
  });
});
