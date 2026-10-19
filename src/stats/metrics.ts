import type { MetricResult, RunRecord } from "../core/types.js";
import { mean, permutationCI, signFlipTest, wilcoxonSignedRank } from "./core.js";

interface TaskPair {
  taskId: string;
  control: RunRecord[];
  treatment: RunRecord[];
}

/** Group usable runs by task, keeping only tasks that have results in both arms. */
export function pairRuns(runs: RunRecord[]): TaskPair[] {
  const by = new Map<string, TaskPair>();
  for (const r of runs) {
    if (r.status === "error") continue;
    let p = by.get(r.taskId);
    if (!p) {
      p = { taskId: r.taskId, control: [], treatment: [] };
      by.set(r.taskId, p);
    }
    p[r.arm].push(r);
  }
  return [...by.values()].filter((p) => p.control.length && p.treatment.length);
}

function passMetric(pairs: TaskPair[], seed: number): MetricResult {
  const c = pairs.map((p) => mean(p.control.map((r) => (r.passed ? 1 : 0))));
  const t = pairs.map((p) => mean(p.treatment.map((r) => (r.passed ? 1 : 0))));
  const d = t.map((x, i) => x - c[i]!);
  const [lo, hi] = permutationCI(d, 0.05, seed);
  return {
    key: "pass",
    label: "tests passed",
    unit: "points",
    control: mean(c),
    treatment: mean(t),
    effect: mean(d) * 100,
    ciLow: lo * 100,
    ciHigh: hi * 100,
    pValue: signFlipTest(d, seed),
    pWilcoxon: wilcoxonSignedRank(d).p,
    n: pairs.length,
    lowerIsBetter: false,
  };
}

function ratioMetric(
  pairs: TaskPair[],
  key: MetricResult["key"],
  label: string,
  get: (r: RunRecord) => number | null,
  seed: number,
  offset = 0,
): MetricResult | undefined {
  const cs: number[] = [];
  const ts: number[] = [];
  const r: number[] = [];
  for (const p of pairs) {
    const cv = p.control.map(get);
    const tv = p.treatment.map(get);
    if (cv.some((v) => v === null) || tv.some((v) => v === null)) return undefined;
    const c = mean(cv as number[]);
    const t = mean(tv as number[]);
    if (c + offset <= 0 || t + offset <= 0) continue;
    cs.push(c);
    ts.push(t);
    r.push(Math.log((t + offset) / (c + offset)));
  }
  if (!r.length) return undefined;
  const [lo, hi] = permutationCI(r, 0.05, seed + 7);
  return {
    key,
    label,
    unit: "ratio",
    control: mean(cs),
    treatment: mean(ts),
    effect: Math.exp(mean(r)) - 1,
    ciLow: Math.exp(lo) - 1,
    ciHigh: Math.exp(hi) - 1,
    pValue: signFlipTest(r, seed + 7),
    pWilcoxon: wilcoxonSignedRank(r).p,
    n: r.length,
    lowerIsBetter: true,
  };
}

/**
 * Effects are estimated per task, then averaged across tasks, so repeats sharpen each task's
 * estimate without being counted as independent evidence.
 * Pass rate: mean difference in percentage points. Cost-like metrics: geometric mean ratio.
 */
export function computeMetrics(runs: RunRecord[], seed = 1): MetricResult[] {
  const pairs = pairRuns(runs);
  if (!pairs.length) return [];
  const out: MetricResult[] = [passMetric(pairs, seed)];
  const tokens = ratioMetric(pairs, "tokens", "tokens / task", (r) => r.totalTokens, seed);
  const cost = ratioMetric(pairs, "cost", "cost / task", (r) => r.costUsd, seed);
  const time = ratioMetric(pairs, "time", "time / task", (r) => r.durationMs, seed);
  const lines = ratioMetric(
    pairs,
    "lines",
    "lines changed",
    (r) => r.linesAdded + r.linesRemoved,
    seed,
    1,
  );
  if (lines) lines.neutral = true;
  for (const m of [tokens, cost, time, lines]) if (m) out.push(m);
  return out;
}
