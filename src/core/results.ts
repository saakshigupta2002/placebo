import { computeMetrics } from "../stats/metrics.js";
import { decideVerdict } from "../stats/verdict.js";
import type { RunRecord, TrialRecord, TrialResults } from "./types.js";

export function summarizeAdverse(runs: RunRecord[]): TrialResults["adverse"] {
  const out: TrialResults["adverse"] = {
    control: 0,
    treatment: 0,
    criticalControl: 0,
    criticalTreatment: 0,
    events: {},
  };
  for (const r of runs) {
    if (r.status === "error") continue;
    const serious = r.adverse.filter((e) => e.severity !== "info");
    if (serious.length) out[r.arm] += 1;
    if (r.adverse.some((e) => e.severity === "critical")) {
      if (r.arm === "control") out.criticalControl += 1;
      else out.criticalTreatment += 1;
    }
    for (const kind of new Set(r.adverse.map((e) => e.kind))) {
      out.events[kind] ??= { control: 0, treatment: 0 };
      out.events[kind]![r.arm] += 1;
    }
  }
  return out;
}

export function computeResults(trial: TrialRecord): TrialResults {
  const metrics = computeMetrics(trial.runs, trial.design.seed);
  const observed = (arm: "control" | "treatment") =>
    trial.runs.filter((r) => r.arm === arm && r.status !== "error" && r.activated !== null);
  const count = (rs: typeof trial.runs) => ({
    fired: rs.filter((r) => r.activated).length,
    runs: rs.length,
  });
  const kind = trial.intervention.kind;
  const treated = observed("treatment");
  const activation =
    (kind === "skill" || kind === "skill-version") && treated.length
      ? {
          ...count(treated),
          ...(kind === "skill-version" && observed("control").length
            ? { control: count(observed("control")) }
            : {}),
        }
      : null;
  const adverse = summarizeAdverse(trial.runs);
  let verdict = decideVerdict({ kind: trial.intervention.kind, metrics, activation, adverse });
  if (!trial.isolation.verified && trial.isolation.mode && trial.runs.length) {
    verdict = {
      label: "INCONCLUSIVE",
      headline: "Isolation check failed, so the arms may not differ only in the intervention.",
      reasons: [...trial.isolation.notes, ...verdict.reasons],
    };
  }
  return { metrics, activation, adverse, verdict };
}
