import pc from "picocolors";
import type { TrialRecord, VerdictLabel } from "../core/types.js";
import {
  ADVERSE_LABELS,
  designLine,
  direction,
  fmtCI,
  fmtEffect,
  fmtP,
  fmtValue,
  interventionLine,
  notesSummary,
  passCounts,
} from "./format.js";

const VERDICT_COLOR: Record<VerdictLabel, (s: string) => string> = {
  WORKS: (s) => pc.bold(pc.green(s)),
  PLACEBO: (s) => pc.bold(pc.yellow(s)),
  HARMFUL: (s) => pc.bold(pc.red(s)),
  INCONCLUSIVE: (s) => pc.bold(pc.blue(s)),
};

function pad(s: string, n: number): string {
  return s.length >= n ? `${s} ` : s + " ".repeat(n - s.length);
}

export function renderTerminal(t: TrialRecord, reportPath?: string): string {
  const r = t.results;
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${pc.bold("Placebo")} · trial ${t.id} · ${designLine(t)}`);
  lines.push(`  ${pc.dim("Testing")} ${interventionLine(t)}`);
  lines.push("");
  if (!r?.metrics.length) {
    lines.push(
      `  ${pc.yellow("No task finished in both arms.")} ${t.design.stoppedEarly ? `Stopped: ${t.design.stoppedEarly}.` : ""}`,
    );
    const errors = t.runs.filter((x) => x.status === "error").slice(0, 3);
    for (const e of errors) lines.push(`  ${pc.red("✗")} ${e.taskId} ${e.arm}: ${e.error}`);
    lines.push("");
    return lines.join("\n");
  }
  const cols = [18, 12, 13, 26, 8];
  lines.push(
    pc.dim(
      `  ${pad("", cols[0]!)}${pad("control", cols[1]!)}${pad("treatment", cols[2]!)}${pad("effect (95% CI)", cols[3]!)}p`,
    ),
  );
  for (const m of r.metrics) {
    let c = fmtValue(m, m.control);
    let tr = fmtValue(m, m.treatment);
    if (m.key === "pass") {
      const pcC = passCounts(t.runs, "control");
      const pcT = passCounts(t.runs, "treatment");
      c = `${pcC.passed}/${pcC.total}`;
      tr = `${pcT.passed}/${pcT.total}`;
    }
    const effect = pad(`${fmtEffect(m)}  ${fmtCI(m)}`, cols[3]!);
    const dir = direction(m);
    const paint = dir === "good" ? pc.green : dir === "bad" ? pc.red : (s: string) => s;
    lines.push(
      `  ${pad(m.label, cols[0]!)}${pad(c, cols[1]!)}${pad(tr, cols[2]!)}${paint(effect)}${fmtP(m.pValue)}`,
    );
  }
  if (r.activation) {
    const share = r.activation.runs
      ? Math.round((r.activation.fired / r.activation.runs) * 100)
      : 0;
    const txt = `${r.activation.fired}/${r.activation.runs} runs (${share}%)`;
    lines.push(
      `  ${pad("skill fired", cols[0]!)}${pad(r.activation.control ? `${r.activation.control.fired}/${r.activation.control.runs}` : "-", cols[1]!)}${r.activation.fired === 0 ? pc.yellow(txt) : txt}`,
    );
  }
  lines.push("");
  const kinds = Object.entries(r.adverse.events).filter(([, v]) => v.control + v.treatment > 0);
  if (!kinds.length) lines.push(`  ${pad("adverse events", cols[0]!)}${pc.green("none")}`);
  else {
    const fmt = (arm: "control" | "treatment") =>
      kinds
        .filter(([, v]) => v[arm] > 0)
        .map(([k, v]) => `${ADVERSE_LABELS[k] ?? k} ×${v[arm]}`)
        .join(", ") || "none";
    const crit = r.adverse.criticalTreatment > r.adverse.criticalControl;
    lines.push(`  ${pad("adverse events", cols[0]!)}control: ${fmt("control")}`);
    lines.push(
      `  ${pad("", cols[0]!)}${crit ? pc.red(`treatment: ${fmt("treatment")}`) : `treatment: ${fmt("treatment")}`}`,
    );
  }
  const noted = notesSummary(r.adverse.notes);
  if (noted)
    lines.push(`  ${pad("also noted", cols[0]!)}${pc.dim(`${noted} · info, not adverse`)}`);
  const iso = t.isolation;
  lines.push(
    `  ${pad("isolation", cols[0]!)}${iso.verified ? pc.green("verified") : pc.red("not verified")} ${pc.dim(`(${iso.mode} mode)`)}`,
  );
  if (!iso.verified) for (const n of iso.notes) lines.push(`  ${pad("", cols[0]!)}${pc.red(n)}`);
  if (t.design.stoppedEarly)
    lines.push(`  ${pad("stopped early", cols[0]!)}${t.design.stoppedEarly}`);
  const errors = t.runs.filter((x) => x.status === "error").length;
  if (errors)
    lines.push(
      `  ${pad("errored runs", cols[0]!)}${pc.yellow(String(errors))} ${pc.dim("(excluded from statistics)")}`,
    );
  lines.push("");
  lines.push(
    `  ${pc.bold("VERDICT")}  ${VERDICT_COLOR[r.verdict.label](r.verdict.label)}  ${r.verdict.headline}`,
  );
  if (reportPath) lines.push(`  ${pc.dim("Report")}   ${reportPath}`);
  lines.push("");
  return lines.join("\n");
}
