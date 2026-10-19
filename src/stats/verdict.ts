import type { InterventionKind, MetricResult, TrialResults, Verdict } from "../core/types.js";

export const ALPHA = 0.05;
/** Effects inside these bounds count as "no meaningful difference". */
export const PASS_MARGIN_POINTS = 10;
export const COST_MARGIN = 0.1;

export function pct(x: number, digits = 1): string {
  const v = x * 100;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)}%`;
}

export function pts(x: number): string {
  return `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x).toFixed(0)} pts`;
}

function significant(m: MetricResult | undefined): boolean {
  return Boolean(m && m.pValue < ALPHA && (m.ciLow > 0 || m.ciHigh < 0));
}

/** How many tasks would shrink the widest confidence interval to the target margin. */
function tasksNeeded(metrics: MetricResult[]): number | undefined {
  let worst = 1;
  let n = 0;
  for (const m of metrics) {
    if (m.key !== "pass" && m.key !== "cost" && m.key !== "tokens") continue;
    const half = (m.ciHigh - m.ciLow) / 2;
    const target = m.unit === "points" ? PASS_MARGIN_POINTS / 2 : COST_MARGIN / 2;
    if (half > 0) worst = Math.max(worst, (half / target) ** 2);
    n = Math.max(n, m.n);
  }
  return worst > 1 && n > 0 ? Math.ceil(n * worst) : undefined;
}

export interface VerdictInput {
  kind: InterventionKind;
  metrics: MetricResult[];
  activation: TrialResults["activation"];
  adverse: TrialResults["adverse"];
}

export function decideVerdict({ kind, metrics, activation, adverse }: VerdictInput): Verdict {
  const pass = metrics.find((m) => m.key === "pass");
  const spend = metrics.find((m) => m.key === "cost") ?? metrics.find((m) => m.key === "tokens");
  const spendName = spend?.key === "cost" ? "cost" : "tokens";
  const reasons: string[] = [];

  if (!pass) {
    return {
      label: "INCONCLUSIVE",
      headline: "No task finished in both arms, so there is nothing to compare.",
      reasons,
    };
  }

  if (adverse.criticalTreatment > adverse.criticalControl) {
    reasons.push(
      `${adverse.criticalTreatment} treatment run(s) had a critical adverse event, against ${adverse.criticalControl} in control.`,
    );
    return {
      label: "HARMFUL",
      headline: "Made the agent do something dangerous. See adverse events.",
      reasons,
    };
  }

  if (kind === "skill" && activation && activation.runs > 0 && activation.fired === 0) {
    reasons.push(
      `The skill never activated in ${activation.runs} runs, so the agent behaved as if it was not installed.`,
    );
    return {
      label: "PLACEBO",
      headline: "Never activated. It was installed but the agent never used it.",
      reasons,
    };
  }

  const passUp = significant(pass) && pass.effect > 0;
  const passDown = significant(pass) && pass.effect < 0;
  const cheaper = significant(spend) && spend!.effect < 0;
  const pricier = significant(spend) && spend!.effect > 0;

  if (pass)
    reasons.push(
      `Tests passed: ${pts(pass.effect)} (95% CI ${pts(pass.ciLow)} to ${pts(pass.ciHigh)}, p=${pass.pValue.toFixed(3)}).`,
    );
  if (spend)
    reasons.push(
      `${spendName[0]!.toUpperCase()}${spendName.slice(1)}: ${pct(spend.effect)} (95% CI ${pct(spend.ciLow)} to ${pct(spend.ciHigh)}, p=${spend.pValue.toFixed(3)}).`,
    );
  if (activation && kind === "skill")
    reasons.push(`Skill fired in ${activation.fired} of ${activation.runs} runs.`);

  if (passDown) {
    return {
      label: "HARMFUL",
      headline: `Fewer tasks passed (${pts(pass.effect)}). It makes the agent worse at the job.`,
      reasons,
    };
  }
  if (passUp) {
    const costNote = pricier
      ? `, at ${pct(spend!.effect, 0)} ${spendName}`
      : cheaper
        ? ` and cuts ${spendName} ${pct(-spend!.effect, 0).slice(1)}`
        : "";
    return {
      label: "WORKS",
      headline: `Passes more tasks (${pts(pass.effect)})${costNote}.`,
      reasons,
    };
  }
  if (cheaper) {
    return {
      label: "WORKS",
      headline: `Cuts ${spendName} by ${pct(-spend!.effect, 0).slice(1)} with no measurable loss in correctness.`,
      reasons,
    };
  }
  if (pricier) {
    return {
      label: "HARMFUL",
      headline:
        spendName === "cost"
          ? `Costs ${pct(spend!.effect, 0).slice(1)} more with no gain in correctness.`
          : `Uses ${pct(spend!.effect, 0).slice(1)} more tokens with no gain in correctness.`,
      reasons,
    };
  }
  const tightPass = pass.ciLow > -PASS_MARGIN_POINTS && pass.ciHigh < PASS_MARGIN_POINTS;
  const tightSpend = !spend || (spend.ciLow > -COST_MARGIN && spend.ciHigh < COST_MARGIN);
  if (tightPass && tightSpend) {
    return {
      label: "PLACEBO",
      headline: `No measurable effect. Within ±${PASS_MARGIN_POINTS} pts on correctness and ±${COST_MARGIN * 100}% on ${spendName}.`,
      reasons,
    };
  }
  if (pass.n < 6) {
    const minP = 2 / 2 ** pass.n;
    return {
      label: "INCONCLUSIVE",
      headline: `Too few tasks to judge. With ${pass.n} task${pass.n === 1 ? "" : "s"} the smallest possible p-value is ${minP.toFixed(2)}; run at least 6, ideally 15 or more.`,
      reasons,
      tasksNeeded: 15,
    };
  }
  const needed = tasksNeeded(metrics);
  if (needed && needed > 400) {
    return {
      label: "INCONCLUSIVE",
      headline:
        "Not enough evidence yet. The effect is small next to the noise, so even several hundred tasks may not settle it.",
      reasons,
      tasksNeeded: needed,
    };
  }
  return {
    label: "INCONCLUSIVE",
    headline: needed
      ? `Not enough evidence yet. About ${needed} tasks would settle it.`
      : "Not enough evidence yet. Run more tasks or repeats.",
    reasons,
    tasksNeeded: needed,
  };
}
