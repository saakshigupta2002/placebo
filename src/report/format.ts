import { shortRef } from "../core/intervention.js";
import type { MetricResult, RunRecord, TrialRecord } from "../core/types.js";

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function fmtCost(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "-";
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}

function signed(x: number, digits: number, suffix: string): string {
  const v = Number(x.toFixed(digits));
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)}${suffix}`;
}

export function fmtEffect(m: MetricResult): string {
  return m.unit === "points" ? signed(m.effect, 0, " pts") : signed(m.effect * 100, 1, "%");
}

export function fmtCI(m: MetricResult): string {
  return m.unit === "points"
    ? `(${signed(m.ciLow, 0, "")}, ${signed(m.ciHigh, 0, "")})`
    : `(${signed(m.ciLow * 100, 1, "")}, ${signed(m.ciHigh * 100, 1, "")})`;
}

export function fmtValue(m: MetricResult, v: number): string {
  switch (m.key) {
    case "pass":
      return `${Math.round(v * 100)}%`;
    case "tokens":
      return fmtTokens(v);
    case "cost":
      return fmtCost(v);
    case "time":
      return fmtDuration(v);
    default:
      return `${Math.round(v)}`;
  }
}

export function isSignificant(m: MetricResult, alpha = 0.05): boolean {
  return m.pValue < alpha && (m.ciLow > 0 || m.ciHigh < 0);
}

/** "good", "bad" or "neutral" from the reader's point of view. */
export function direction(m: MetricResult): "good" | "bad" | "neutral" {
  if (m.neutral || !isSignificant(m)) return "neutral";
  const up = m.effect > 0;
  return up === !m.lowerIsBetter ? "good" : "bad";
}

export function passCounts(
  runs: RunRecord[],
  arm: "control" | "treatment",
): { passed: number; total: number } {
  const rs = runs.filter((r) => r.arm === arm && r.status !== "error");
  return { passed: rs.filter((r) => r.passed).length, total: rs.length };
}

export function designLine(t: TrialRecord): string {
  const agent = `${t.agent.id}${t.agent.version ? ` ${t.agent.version}` : ""}`;
  const model = t.arms.control.model ?? "default model";
  const tasks =
    new Set(t.runs.filter((r) => r.status !== "error").map((r) => r.taskId)).size || t.design.tasks;
  return `${tasks} tasks × 2 arms × ${t.design.repeats} repeat${t.design.repeats === 1 ? "" : "s"} · ${agent} / ${model}`;
}

export function interventionLine(t: TrialRecord): string {
  const i = t.intervention;
  const hash = i.contentHash ? ` (sha ${i.contentHash.slice(0, 8)})` : "";
  switch (i.kind) {
    case "skill":
      return `skill "${i.label}"${hash}`;
    case "skill-version":
      return `skill "${i.skill?.name ?? i.label}" new (sha ${i.contentHash?.slice(0, 8)}) vs baseline ${shortRef(i.baseline?.source ?? "")} (sha ${i.baseline?.contentHash.slice(0, 8)})`;
    case "instructions":
      return `instructions file ${i.label}${hash}`;
    case "model":
      return `model ${i.label}`;
    case "agent":
      return `agent ${i.label}`;
  }
}

export const ADVERSE_LABELS: Record<string, string> = {
  "canary-leak": "secret leaked",
  "canary-read": "read planted secret",
  "test-tamper": "test tampering",
  "outside-write": "wrote outside workspace",
  persistence: "persistence",
  destructive: "destructive command",
  network: "network call",
  "dependency-added": "new dependency",
  "web-tool": "web tool",
};
