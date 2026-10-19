import type { MetricResult, RunRecord, TrialRecord, VerdictLabel } from "../core/types.js";
import {
  ADVERSE_LABELS,
  designLine,
  direction,
  fmtCI,
  fmtCost,
  fmtDuration,
  fmtEffect,
  fmtP,
  fmtTokens,
  fmtValue,
  interventionLine,
  passCounts,
} from "./format.js";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const VERDICT_WORD: Record<VerdictLabel, string> = {
  WORKS: "Works",
  PLACEBO: "Placebo",
  HARMFUL: "Harmful",
  INCONCLUSIVE: "Inconclusive",
};

const TILE_LABEL: Record<string, string> = {
  pass: "Tests passed",
  cost: "Cost per task",
  tokens: "Tokens per task",
  time: "Time per task",
  lines: "Lines changed",
};

/** A confidence interval drawn against zero, with the "no meaningful change" band shaded. */
function forest(m: MetricResult, width = 260, height = 34): string {
  const margin = m.unit === "points" ? 10 : 0.1;
  const raw = Math.max(Math.abs(m.ciLow), Math.abs(m.ciHigh), Math.abs(m.effect), margin) * 1.2;
  const span = m.unit === "points" ? Math.min(100, raw) : raw;
  const x = (v: number) => ((v + span) / (2 * span)) * (width - 16) + 8;
  const dir = direction(m);
  const cls = dir === "good" ? "good" : dir === "bad" ? "bad" : "flat";
  const y = height / 2 - 4;
  const lo = Number.isFinite(m.ciLow) ? x(m.ciLow) : x(m.effect);
  const hi = Number.isFinite(m.ciHigh) ? x(m.ciHigh) : x(m.effect);
  const tick = m.unit === "points" ? `${Math.round(span)} pts` : `${Math.round(span * 100)}%`;
  const better = m.neutral
    ? ["fewer", "more"]
    : m.lowerIsBetter
      ? ["better", "worse"]
      : ["worse", "better"];
  return `<svg class="forest ${cls}" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px" role="img" aria-label="${esc(m.label)} change ${esc(fmtEffect(m))}, 95% interval ${esc(fmtCI(m))}">
  <rect class="band" x="${x(-margin)}" y="${y - 7}" width="${x(margin) - x(-margin)}" height="14" rx="3"/>
  <line class="axis" x1="8" x2="${width - 8}" y1="${y}" y2="${y}"/>
  <line class="zero" x1="${x(0)}" x2="${x(0)}" y1="${y - 10}" y2="${y + 10}"/>
  <line class="ci" x1="${lo}" x2="${hi}" y1="${y}" y2="${y}"/>
  ${hi - lo > 12 ? `<line class="ci" x1="${lo}" x2="${lo}" y1="${y - 5}" y2="${y + 5}"/><line class="ci" x1="${hi}" x2="${hi}" y1="${y - 5}" y2="${y + 5}"/>` : ""}
  <circle class="pt" cx="${x(m.effect)}" cy="${y}" r="${hi - lo > 12 ? 4.5 : 5.5}"/>
  <text class="tick" x="8" y="${height - 1}">-${tick} · ${better[0]}</text>
  <text class="tick" x="${width - 8}" y="${height - 1}" text-anchor="end">${better[1]} · +${tick}</text>
</svg>`;
}

function tile(t: TrialRecord, m: MetricResult): string {
  let c = fmtValue(m, m.control);
  let tr = fmtValue(m, m.treatment);
  if (m.key === "pass") {
    const a = passCounts(t.runs, "control");
    const b = passCounts(t.runs, "treatment");
    c = `${a.passed}/${a.total}`;
    tr = `${b.passed}/${b.total}`;
  }
  const dir = direction(m);
  return `<div class="tile">
  <div class="tile-label">${esc(TILE_LABEL[m.key] ?? m.label)}</div>
  <div class="tile-values"><span class="from">${esc(c)}</span><span class="arrow">→</span><span class="to">${esc(tr)}</span></div>
  <div class="tile-effect ${dir}">${esc(fmtEffect(m))} <span class="ci">${esc(fmtCI(m))}</span></div>
  ${forest(m, 220, 30)}
  <div class="tile-p">p = ${esc(fmtP(m.pValue))}</div>
</div>`;
}

function runRow(r: RunRecord): string {
  const adverse = r.adverse.filter((e) => e.severity !== "info");
  return `<tr>
  <td>${esc(r.arm)} #${r.rep + 1}</td>
  <td><span class="status ${esc(r.status)}">${esc(r.status)}</span></td>
  <td class="num">${esc(fmtTokens(r.totalTokens))}</td>
  <td class="num">${esc(fmtCost(r.costUsd))}${r.costEstimated ? "*" : ""}</td>
  <td class="num">${esc(fmtDuration(r.durationMs))}</td>
  <td class="num">+${r.linesAdded} / -${r.linesRemoved}</td>
  <td>${r.activated === null ? "-" : r.activated ? "yes" : "no"}</td>
  <td>${adverse.length ? adverse.map((e) => `<span class="sev ${e.severity}">${esc(ADVERSE_LABELS[e.kind] ?? e.kind)}</span>`).join(" ") : "-"}</td>
  <td class="path"><a href="${esc(r.dir)}/diff.patch">diff</a> · <a href="${esc(r.dir)}/transcript.jsonl">transcript</a> · <a href="${esc(r.dir)}/check.log">check</a></td>
</tr>${r.error ? `<tr class="err"><td></td><td colspan="8">${esc(r.error)}</td></tr>` : ""}`;
}

function taskSection(t: TrialRecord): string {
  const ids = [...new Set(t.runs.map((r) => r.taskId))];
  const title = new Map(t.tasks.map((x) => [x.id, x.title]));
  return ids
    .map((id) => {
      const runs = t.runs
        .filter((r) => r.taskId === id)
        .sort((a, b) => a.arm.localeCompare(b.arm) || a.rep - b.rep);
      const pass = (arm: string) => {
        const rs = runs.filter((r) => r.arm === arm && r.status !== "error");
        return `${rs.filter((r) => r.passed).length}/${rs.length}`;
      };
      return `<details class="task"><summary><span class="task-id">${esc(id)}</span><span class="task-title">${esc(title.get(id) ?? "")}</span><span class="task-score">control ${pass("control")} · treatment ${pass("treatment")}</span></summary>
<table class="runs"><thead><tr><th>run</th><th>result</th><th>tokens</th><th>cost</th><th>time</th><th>lines</th><th>skill fired</th><th>adverse</th><th>files</th></tr></thead><tbody>
${runs.map(runRow).join("\n")}
</tbody></table></details>`;
    })
    .join("\n");
}

function adverseSection(t: TrialRecord): string {
  const r = t.results!;
  const kinds = Object.entries(r.adverse.events);
  if (!kinds.length)
    return `<p class="lede ok">No adverse events in either arm. No planted secret was touched, no test was tampered with and nothing was written outside the workspace.</p>`;
  const rows = kinds
    .map(
      ([k, v]) =>
        `<tr><td>${esc(ADVERSE_LABELS[k] ?? k)}</td><td class="num">${v.control}</td><td class="num">${v.treatment}</td></tr>`,
    )
    .join("");
  const list = t.runs
    .filter((x) => x.arm === "treatment")
    .flatMap((x) => x.adverse.filter((e) => e.severity !== "info").map((e) => ({ x, e })))
    .slice(0, 30)
    .map(
      ({ x, e }) =>
        `<li><span class="sev ${e.severity}">${esc(e.severity)}</span> <b>${esc(x.taskId)}</b> ${esc(e.detail)}${e.evidence ? ` <code>${esc(e.evidence)}</code>` : ""}</li>`,
    )
    .join("");
  return `<table class="adverse"><thead><tr><th>event (runs affected)</th><th>control</th><th>treatment</th></tr></thead><tbody>${rows}</tbody></table>
${list ? `<h3>Treatment arm evidence</h3><ul class="evidence">${list}</ul>` : ""}`;
}

export function renderHtml(t: TrialRecord): string {
  const r = t.results;
  const verdict = r?.verdict.label ?? "INCONCLUSIVE";
  const headline = r?.verdict.headline ?? "Trial did not finish.";
  const order = ["pass", "cost", "tokens", "time"];
  const tiles = (r?.metrics ?? [])
    .filter((m) => order.includes(m.key))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const hasCost = tiles.some((m) => m.key === "cost");
  const shown = tiles.filter((m) => !(hasCost && m.key === "tokens")).slice(0, 3);
  const act = r?.activation;
  const advTotal = r ? r.adverse.treatment : 0;
  const advCrit = r ? r.adverse.criticalTreatment : 0;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Placebo trial ${esc(t.id)}: ${esc(t.intervention.label)}</title>
<style>
:root {
  --bg: #f6f5f1; --panel: #ffffff; --ink: #18181b; --muted: #6b6b73; --line: #e4e2dc;
  --good: #1a7f4b; --good-bg: #e3f4ea; --bad: #c2362b; --bad-bg: #fbe6e3;
  --flat: #6b6b73; --warn: #a86b00; --warn-bg: #fdf1d8; --info: #3b5bdb; --info-bg: #e7ecfd;
  --band: rgba(24,24,27,0.06); --pill-ink: #ffffff; --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #111113; --panel: #1a1a1d; --ink: #ededef; --muted: #9a9aa3; --line: #2b2b30;
    --good: #4cc38a; --good-bg: #12301f; --bad: #ff7a6e; --bad-bg: #3a1714; --flat: #9a9aa3;
    --warn: #f5b84a; --warn-bg: #3a2a0c; --info: #8aa2ff; --info-bg: #1a2140; --band: rgba(255,255,255,0.07); --pill-ink: #0b0b0c;
  }
}
:root[data-theme="dark"] {
  --bg: #111113; --panel: #1a1a1d; --ink: #ededef; --muted: #9a9aa3; --line: #2b2b30;
  --good: #4cc38a; --good-bg: #12301f; --bad: #ff7a6e; --bad-bg: #3a1714; --flat: #9a9aa3;
  --warn: #f5b84a; --warn-bg: #3a2a0c; --info: #8aa2ff; --info-bg: #1a2140; --band: rgba(255,255,255,0.07); --pill-ink: #0b0b0c;
}
* { box-sizing: border-box; }
html { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
::-webkit-scrollbar-track { background: transparent; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 var(--sans); }
main { max-width: 1080px; margin: 0 auto; padding: 32px 16px 64px; }
a { color: var(--info); }
code { font-family: var(--mono); font-size: 12.5px; background: var(--band); padding: 1px 5px; border-radius: 4px; word-break: break-all; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 28px 30px 22px; }
.kicker { display: flex; justify-content: space-between; gap: 12px; font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.kicker .brand::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--ink); margin-right: 8px; vertical-align: 0; }
h1 { font-size: 34px; line-height: 1.15; margin: 18px 0 4px; letter-spacing: -0.02em; word-break: break-word; }
.sub { color: var(--muted); margin: 0 0 22px; }
.verdict { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px 18px; border-radius: 14px; margin-bottom: 20px; }
.verdict.WORKS { background: var(--good-bg); } .verdict.HARMFUL { background: var(--bad-bg); }
.verdict.PLACEBO { background: var(--warn-bg); } .verdict.INCONCLUSIVE { background: var(--info-bg); }
.pill { font: 800 15px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; padding: 9px 14px; border-radius: 999px; color: var(--pill-ink); }
.WORKS .pill { background: var(--good); } .HARMFUL .pill { background: var(--bad); }
.PLACEBO .pill { background: var(--warn); } .INCONCLUSIVE .pill { background: var(--info); }
.headline { font-size: 19px; font-weight: 600; flex: 1 1 320px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.tile { border: 1px solid var(--line); border-radius: 12px; padding: 14px 14px 10px; min-width: 0; }
.tile-label { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
.tile-values { font: 600 20px/1.3 var(--mono); margin-top: 6px; white-space: nowrap; }
.tile-values .from { color: var(--muted); } .tile-values .arrow { color: var(--muted); margin: 0 8px; font-family: var(--sans); }
.tile-effect { font: 700 15px/1.3 var(--mono); margin: 4px 0 2px; }
.tile-effect .ci { font-weight: 500; color: var(--muted); font-size: 12.5px; }
.tile-effect.good { color: var(--good); } .tile-effect.bad { color: var(--bad); } .tile-effect.neutral { color: var(--ink); }
.tile-p { font: 12px var(--mono); color: var(--muted); }
.forest { display: block; margin: 6px 0 2px; overflow: visible; }
.forest .band { fill: var(--band); }
.forest .axis { stroke: var(--line); stroke-width: 1.5; }
.forest .zero { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 3 3; }
.forest .ci { stroke-width: 3; stroke-linecap: round; }
.forest .tick { font: 9.5px var(--mono); fill: var(--muted); }
.forest.good .ci, .forest.good .pt { stroke: var(--good); fill: var(--good); }
.forest.bad .ci, .forest.bad .pt { stroke: var(--bad); fill: var(--bad); }
.forest.flat .ci, .forest.flat .pt { stroke: var(--flat); fill: var(--flat); }
.facts { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--muted); }
.facts b { color: var(--ink); font-weight: 600; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--good); }
.dot.warn { background: var(--warn); } .dot.bad { background: var(--bad); }
section { margin-top: 36px; }
h2 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
h3 { font-size: 15px; margin: 18px 0 8px; }
.strap { color: var(--muted); margin: 0 0 14px; font-size: 14px; }
.lede.ok { color: var(--good); font-weight: 500; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; overflow-x: auto; }
.effects-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 200px; gap: 16px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.effects-row:last-child { border-bottom: 0; }
.effects-row .name { font-weight: 600; } .effects-row .stat { font: 13px var(--mono); text-align: right; }
.effects-row .stat .good { color: var(--good); font-weight: 700; } .effects-row .stat .bad { color: var(--bad); font-weight: 700; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; padding: 6px 8px; border-bottom: 1px solid var(--line); }
td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.num { font-family: var(--mono); text-align: right; white-space: nowrap; }
td.path a { font-size: 12.5px; }
tr.err td { color: var(--bad); font-size: 12.5px; border-bottom: 0; padding-top: 0; }
.status { font: 600 11.5px var(--mono); padding: 2px 7px; border-radius: 999px; }
.status.passed { background: var(--good-bg); color: var(--good); } .status.failed, .status.timeout { background: var(--bad-bg); color: var(--bad); }
.status.error { background: var(--warn-bg); color: var(--warn); }
.sev { font: 600 11px var(--mono); padding: 2px 6px; border-radius: 5px; white-space: nowrap; }
.sev.critical { background: var(--bad-bg); color: var(--bad); } .sev.warning { background: var(--warn-bg); color: var(--warn); } .sev.info { background: var(--info-bg); color: var(--info); }
.evidence { padding-left: 18px; margin: 0; } .evidence li { margin: 6px 0; }
details.task { border-bottom: 1px solid var(--line); padding: 4px 0; }
details.task summary { cursor: pointer; display: flex; gap: 12px; align-items: baseline; padding: 8px 2px; flex-wrap: wrap; }
.task-id { font: 600 13px var(--mono); } .task-title { color: var(--muted); flex: 1 1 200px; } .task-score { font: 12.5px var(--mono); color: var(--muted); }
.notes { margin: 0; padding-left: 18px; } .notes li { margin: 4px 0; }
.method p { margin: 0 0 10px; color: var(--ink); }
footer { margin-top: 40px; color: var(--muted); font-size: 13px; text-align: center; }
@media (max-width: 640px) {
  .card { padding: 20px 16px; } h1 { font-size: 26px; }
  .effects-row { grid-template-columns: 1fr; gap: 4px; } .effects-row .stat { text-align: left; }
}
</style>
</head>
<body>
<main>
<header class="card" id="trial-card">
  <div class="kicker"><span class="brand">Placebo trial</span><span>${esc(t.id)} · ${esc(t.createdAt.slice(0, 10))}</span></div>
  <h1>${esc(t.intervention.label)}</h1>
  <p class="sub">Testing ${esc(interventionLine(t))} on ${esc(designLine(t))}</p>
  <div class="verdict ${verdict}"><span class="pill">${VERDICT_WORD[verdict]}</span><span class="headline">${esc(headline)}</span></div>
  <div class="tiles">${shown.map((m) => tile(t, m)).join("")}</div>
  <div class="facts">
    ${act ? `<span><span class="dot ${act.runs && act.fired / act.runs < 0.5 ? "warn" : ""}"></span>Skill fired in <b>${act.fired} of ${act.runs}</b> runs</span>` : ""}
    <span><span class="dot ${advCrit ? "bad" : advTotal ? "warn" : ""}"></span>${advCrit ? `<b>${advCrit} critical</b> adverse events` : advTotal ? `<b>${advTotal}</b> runs with warnings` : "<b>No</b> adverse events"}</span>
    <span><span class="dot ${t.isolation.verified ? "" : "bad"}"></span>Isolation <b>${t.isolation.verified ? "verified" : "not verified"}</b></span>
    <span>Control is the same agent without the ${esc(t.intervention.kind)}</span>
  </div>
</header>

${
  r?.metrics.length
    ? `<section>
  <h2>Every effect, with its uncertainty</h2>
  <p class="strap">Each bar is the 95% confidence interval for the change from control to treatment. The shaded band is "too small to matter". A bar that crosses the dashed zero line means no clear effect.</p>
  <div class="panel">${r.metrics
    .map((m) => {
      const d = direction(m);
      return `<div class="effects-row"><div class="name">${esc(TILE_LABEL[m.key] ?? m.label)}</div>${forest(m, 560, 40)}<div class="stat"><span class="${d}">${esc(fmtEffect(m))}</span> ${esc(fmtCI(m))}<br>p = ${esc(fmtP(m.pValue))} · ${m.n} tasks</div></div>`;
    })
    .join("")}</div>
</section>`
    : ""
}

${
  r
    ? `<section>
  <h2>Adverse events</h2>
  <p class="strap">Fake secrets are planted in every workspace. Placebo flags reading them, leaking them, editing the hidden tests, writing outside the workspace and risky commands.</p>
  <div class="panel">${adverseSection(t)}</div>
</section>`
    : ""
}

<section>
  <h2>Tasks</h2>
  <p class="strap">Open a task to see each run. Cost marked * is estimated from token counts.</p>
  <div class="panel">${taskSection(t)}</div>
</section>

<section>
  <h2>Isolation</h2>
  <p class="strap">What each arm's agent reported loading at startup, compared before any result was trusted.</p>
  <div class="panel"><ul class="notes">${t.isolation.notes.map((n) => `<li>${esc(n)}</li>`).join("") || "<li>No startup report captured.</li>"}</ul></div>
</section>

<section class="method">
  <h2>How this was measured</h2>
  <div class="panel">
    <p>Each task is a real change from the repository's history (or a hand-written task with its own check). For every task the agent runs in fresh workspaces exported from the starting commit with no git history, so it cannot find the answer in future commits. Control runs the agent as is. Treatment runs the same agent with the ${esc(t.intervention.kind)} under test. Nothing else differs.</p>
    <p>After each run, hidden tests from the original change are restored over whatever the agent left, then the task's check command decides pass or fail. Tokens and cost come from the agent's own usage report.</p>
    <p>Effects are estimated per task and then averaged across tasks, so repeats sharpen each task's estimate without counting as extra evidence. Pass rate is a difference in percentage points. Tokens, cost and time are geometric-mean ratios. P-values come from an exact paired sign-flip permutation test across tasks. The 95% intervals come from inverting that same test, so an interval excludes zero exactly when p is below 0.05.</p>
  </div>
</section>

<footer>Generated by <a href="https://github.com/saakshigupta2002/placebo">placebo</a> ${esc(t.placeboVersion)} · trial.json holds every number on this page</footer>
</main>
</body>
</html>
`;
}
