import { describe, expect, it } from "vitest";
import { summarizeAdverse } from "../../src/core/results.js";
import type { MetricResult, RunRecord, TrialResults } from "../../src/core/types.js";
import { computeMetrics } from "../../src/stats/metrics.js";
import { decideVerdict } from "../../src/stats/verdict.js";

const noAdverse: TrialResults["adverse"] = {
  control: 0,
  treatment: 0,
  criticalControl: 0,
  criticalTreatment: 0,
  events: {},
};

function metric(
  key: MetricResult["key"],
  effect: number,
  lo: number,
  hi: number,
  p: number,
): MetricResult {
  return {
    key,
    label: key,
    unit: key === "pass" ? "points" : "ratio",
    control: 0,
    treatment: 0,
    effect,
    ciLow: lo,
    ciHigh: hi,
    pValue: p,
    n: 12,
    lowerIsBetter: key !== "pass",
  };
}

describe("verdict rules", () => {
  it("WORKS when cost drops and correctness holds", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", 2, -8, 9, 0.7), metric("cost", -0.18, -0.25, -0.1, 0.002)],
      activation: { fired: 20, runs: 24 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("WORKS");
    expect(v.headline).toMatch(/Cuts cost by 18%/);
  });

  it("WORKS when more tasks pass", () => {
    const v = decideVerdict({
      kind: "model",
      metrics: [metric("pass", 25, 10, 40, 0.001), metric("cost", 0.4, 0.2, 0.6, 0.001)],
      activation: null,
      adverse: noAdverse,
    });
    expect(v.label).toBe("WORKS");
    expect(v.headline).toMatch(/Passes more tasks \(\+25 pts\), at \+40% cost/);
  });

  it("PLACEBO when the skill never fires", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", 0, -5, 5, 1), metric("cost", 0, -0.02, 0.02, 1)],
      activation: { fired: 0, runs: 24 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("PLACEBO");
    expect(v.headline).toMatch(/Never activated/);
  });

  it("PLACEBO when both intervals are tight around zero", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", 1, -6, 7, 0.8), metric("cost", -0.01, -0.06, 0.04, 0.6)],
      activation: { fired: 18, runs: 24 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("PLACEBO");
  });

  it("HARMFUL when correctness drops", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", -20, -35, -5, 0.01), metric("cost", -0.3, -0.4, -0.2, 0.001)],
      activation: { fired: 24, runs: 24 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("HARMFUL");
  });

  it("HARMFUL when it costs more for nothing", () => {
    const v = decideVerdict({
      kind: "instructions",
      metrics: [metric("pass", 0, -6, 6, 1), metric("cost", 0.5, 0.3, 0.7, 0.001)],
      activation: null,
      adverse: noAdverse,
    });
    expect(v.label).toBe("HARMFUL");
    expect(v.headline).toBe("Costs 50% more with no gain in correctness.");
  });

  it("HARMFUL on critical adverse events even if everything else looks good", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", 20, 5, 35, 0.01)],
      activation: { fired: 24, runs: 24 },
      adverse: { ...noAdverse, treatment: 3, criticalTreatment: 3 },
    });
    expect(v.label).toBe("HARMFUL");
  });

  it("INCONCLUSIVE and honest when there are too few tasks", () => {
    const m = [
      { ...metric("pass", 0, 0, 0, 1), n: 3 },
      { ...metric("cost", 1.5, 0.3, 4.5, 0.25), n: 3 },
    ];
    const v = decideVerdict({
      kind: "skill",
      metrics: m,
      activation: { fired: 3, runs: 3 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("INCONCLUSIVE");
    expect(v.headline).toMatch(/smallest possible p-value is 0.25/);
  });

  it("INCONCLUSIVE with an estimate of tasks needed", () => {
    const v = decideVerdict({
      kind: "skill",
      metrics: [metric("pass", 8, -20, 36, 0.4), metric("cost", -0.1, -0.4, 0.2, 0.3)],
      activation: { fired: 10, runs: 12 },
      adverse: noAdverse,
    });
    expect(v.label).toBe("INCONCLUSIVE");
    expect(v.tasksNeeded).toBeGreaterThan(12);
  });
});

function run(
  taskId: string,
  arm: "control" | "treatment",
  passed: boolean,
  tokens: number,
  extra: Partial<RunRecord> = {},
): RunRecord {
  return {
    taskId,
    arm,
    rep: 0,
    status: passed ? "passed" : "failed",
    passed,
    usage: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    totalTokens: tokens,
    costUsd: tokens / 1e5,
    costEstimated: false,
    durationMs: tokens,
    turns: 1,
    toolCalls: 1,
    linesAdded: 10,
    linesRemoved: 2,
    filesChanged: 1,
    activated: arm === "treatment" ? true : null,
    adverse: [],
    dir: "",
    ...extra,
  };
}

describe("metrics", () => {
  it("estimates per task and ignores errored runs", () => {
    const runs: RunRecord[] = [];
    for (let i = 0; i < 8; i++) {
      runs.push(run(`t${i}`, "control", i % 2 === 0, 1000), run(`t${i}`, "treatment", true, 800));
    }
    runs.push(run("t-error", "treatment", false, 0, { status: "error" }));
    const m = computeMetrics(runs, 1);
    const pass = m.find((x) => x.key === "pass")!;
    const tokens = m.find((x) => x.key === "tokens")!;
    expect(pass.n).toBe(8);
    expect(pass.effect).toBeCloseTo(50, 6);
    expect(tokens.effect).toBeCloseTo(-0.2, 6);
    expect(tokens.ciLow).toBeCloseTo(-0.2, 6);
  });

  it("counts adverse events once per run", () => {
    const runs = [
      run("a", "treatment", true, 1, {
        adverse: [
          { kind: "test-tamper", severity: "warning", detail: "x" },
          { kind: "test-tamper", severity: "warning", detail: "y" },
          { kind: "canary-leak", severity: "critical", detail: "z" },
        ],
      }),
      run("a", "control", true, 1),
    ];
    const s = summarizeAdverse(runs);
    expect(s.events["test-tamper"]).toEqual({ control: 0, treatment: 1 });
    expect(s.criticalTreatment).toBe(1);
    expect(s.treatment).toBe(1);
  });
});
