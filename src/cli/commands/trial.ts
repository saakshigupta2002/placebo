import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { buildArms } from "../../core/intervention.js";
import { runTrial, type TrialEvent } from "../../core/trial.js";
import type { ArmSpec, Intervention, TrialRecord } from "../../core/types.js";
import { loadPricing } from "../../grading/pricing.js";
import { fmtCost, fmtDuration, fmtTokens } from "../../report/format.js";
import { renderTerminal } from "../../report/terminal.js";
import type { Task } from "../../tasks/schema.js";
import { log } from "../../util/log.js";
import { mulberry32 } from "../../util/prng.js";
import { openPath, parseNumber, resolveTaskSource, resolveTrial, trialsDir } from "../shared.js";

export interface TrialCliOptions {
  agent: string;
  model?: string;
  instructions?: string;
  vsModel?: string;
  vsAgent?: string;
  pack?: string;
  tasks?: string;
  task?: string[];
  limit: string;
  repeats: string;
  concurrency: string;
  seed?: string;
  budget?: string;
  maxRuns?: string;
  untilConfident?: boolean;
  minTasks: string;
  isolation?: "flags" | "home";
  allowWeb?: boolean;
  keep?: boolean;
  pricing?: string;
  id?: string;
  json?: boolean;
  open?: boolean;
  failOn?: string;
  quiet?: boolean;
  resume?: string;
}

function sample<T>(xs: T[], n: number, seed: number): T[] {
  if (n >= xs.length) return xs;
  const a = [...xs];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a
    .slice(0, n)
    .sort((x, y) =>
      String((x as { id?: string }).id).localeCompare(String((y as { id?: string }).id)),
    );
}

export async function trialAction(
  intervention: string | undefined,
  o: TrialCliOptions,
): Promise<number> {
  const cwd = process.cwd();
  loadPricing(o.pricing);
  const limit = parseNumber("limit", o.limit, { integer: true, min: 1 })!;
  const concurrency = parseNumber("concurrency", o.concurrency, { integer: true, min: 1 })!;
  const minTasks = parseNumber("min-tasks", o.minTasks, { integer: true, min: 2 })!;
  const budget = parseNumber("budget", o.budget, { min: 0 }) ?? null;
  const maxRuns = parseNumber("max-runs", o.maxRuns, { integer: true, min: 1 }) ?? null;

  let seed: number;
  let repeats: number;
  let isolation: "flags" | "home";
  let allowWeb: boolean;
  let untilConfident: boolean;
  let iv: Intervention;
  let arms: { control: ArmSpec; treatment: ArmSpec };
  let tasks: Task[];
  let sourceLabel: string;
  let taskSource: { pack?: string; tasks?: string } | undefined;
  let prior: TrialRecord | undefined;

  if (o.resume) {
    // Continue a stopped trial with exactly the same design, tasks and intervention.
    prior = resolveTrial(cwd, o.resume).trial;
    if (
      prior.results &&
      !prior.runs.some((r) => r.status === "error") &&
      !prior.design.stoppedEarly
    ) {
      log.info(`Trial ${prior.id} already finished. Showing it again.`);
    }
    ({ seed, repeats, isolation, allowWeb, untilConfident } = prior.design);
    iv = prior.intervention;
    arms = prior.arms;
    for (const s of [...arms.control.skills, ...arms.treatment.skills]) {
      if (!existsSync(join(s.dir, "SKILL.md")))
        throw new Error(`Cannot resume: the skill folder ${s.dir} is gone.`);
    }
    taskSource = prior.design.taskSource;
    if (!taskSource)
      throw new Error("Cannot resume: this trial was recorded before resume support.");
    const source = await resolveTaskSource(cwd, taskSource);
    const wanted = new Map(prior.tasks.map((t) => [t.id, t.hash]));
    tasks = source.tasks.filter((t) => wanted.has(t.id));
    const missing = prior.tasks.filter((t) => !tasks.some((x) => x.id === t.id));
    if (missing.length)
      throw new Error(
        `Cannot resume: tasks no longer exist: ${missing.map((t) => t.id).join(", ")}`,
      );
    for (const t of tasks)
      if (wanted.get(t.id) !== t.hash) log.warn(`Task ${t.id} changed since the trial started.`);
    sourceLabel = source.label;
  } else {
    seed =
      parseNumber("seed", o.seed, { integer: true, min: 0 }) ??
      Math.floor(Math.random() * 1_000_000);
    repeats = parseNumber("repeats", o.repeats, { integer: true, min: 1 })!;
    isolation =
      o.isolation ??
      (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY ? "home" : "flags");
    allowWeb = Boolean(o.allowWeb);
    untilConfident = Boolean(o.untilConfident);
    ({ intervention: iv, arms } = await buildArms({
      agent: o.agent,
      model: o.model,
      skill: intervention,
      instructions: o.instructions,
      vsModel: o.vsModel,
      vsAgent: o.vsAgent,
    }));
    const source = await resolveTaskSource(cwd, { pack: o.pack, tasks: o.tasks });
    taskSource = o.pack
      ? { pack: o.pack }
      : { tasks: resolve(cwd, o.tasks ?? join(".placebo", "tasks")) };
    sourceLabel = source.label;
    tasks = source.tasks;
    if (o.task?.length) {
      tasks = tasks.filter((t) => o.task!.includes(t.id));
      if (!tasks.length) throw new Error(`None of the requested tasks exist: ${o.task.join(", ")}`);
    }
    tasks = sample(tasks, limit, seed);
  }

  const quiet = o.quiet || o.json;
  const width = Math.max(...tasks.map((t) => t.id.length), 10);
  const onEvent = (e: TrialEvent) => {
    if (quiet) return;
    switch (e.type) {
      case "start":
        log.info("");
        log.info(`${pc.bold("Placebo")} trial ${e.trial.id}: ${iv.kind} ${pc.bold(iv.label)}`);
        log.info(
          pc.dim(
            `  ${tasks.length} tasks from ${sourceLabel} × 2 arms × ${repeats} repeat${repeats === 1 ? "" : "s"} = ${e.totalRuns} runs · ${arms.control.agent} · isolation ${isolation}${budget !== null ? ` · budget $${budget}` : ""} · seed ${seed}`,
          ),
        );
        log.info("");
        break;
      case "run-done": {
        const r = e.run;
        const mark =
          r.status === "passed"
            ? pc.green("✓")
            : r.status === "error"
              ? pc.yellow("!")
              : pc.red("✗");
        const fired =
          r.activated === null ? "" : r.activated ? pc.cyan(" fired") : pc.dim(" not fired");
        const adverse = r.adverse.filter((a) => a.severity !== "info").length;
        const extra =
          r.status === "error"
            ? pc.yellow(` ${r.error ?? ""}`.slice(0, 90))
            : `${fired}${adverse ? pc.yellow(` ${adverse} adverse`) : ""}`;
        log.info(
          `  ${mark} ${r.taskId.padEnd(width)}  ${`${r.arm} #${r.rep + 1}`.padEnd(13)} ${r.status.padEnd(7)} ${fmtTokens(r.totalTokens).padStart(7)} tok ${fmtCost(r.costUsd).padStart(7)} ${fmtDuration(r.durationMs).padStart(6)}${extra}  ${pc.dim(`${e.done}/${e.total}`)}`,
        );
        break;
      }
      case "isolation":
        if (e.report.verified) log.ok(`Isolation verified. ${e.report.notes[0] ?? ""}`);
        else for (const n of e.report.notes) log.error(`Isolation: ${n}`);
        break;
      case "stop":
        log.warn(`Stopping: ${e.reason}`);
        break;
      default:
        break;
    }
  };

  const { trial, dir } = await runTrial({
    cwd,
    tasks,
    intervention: iv,
    arms,
    repeats,
    concurrency,
    seed,
    isolation,
    allowWeb,
    budgetUsd: budget,
    maxRuns,
    untilConfident,
    minTasks,
    keepWorkspaces: Boolean(o.keep),
    trialsDir: trialsDir(cwd),
    id: o.id,
    taskSource,
    resume: prior,
    onEvent,
  });

  const report = join(dir, "report.html");
  if (o.json) {
    process.stdout.write(
      `${JSON.stringify({ id: trial.id, dir, report, verdict: trial.results?.verdict, metrics: trial.results?.metrics }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(renderTerminal(trial, relative(cwd, report)));
  }
  if (o.open) await openPath(report);
  if (!trial.isolation.verified && trial.runs.length) return 2;
  const failOn = (o.failOn ?? "").toUpperCase().split(",").filter(Boolean);
  if (trial.results && failOn.includes(trial.results.verdict.label)) return 3;
  return 0;
}

export function registerTrial(program: Command): void {
  program
    .command("trial")
    .description("Run a controlled trial: the same tasks with and without the intervention")
    .argument("[skill]", "skill to test: a folder with SKILL.md, a SKILL.md file or a GitHub URL")
    .option("-a, --agent <agent>", "agent to run (claude-code, codex, fake)", "claude-code")
    .option("-m, --model <model>", "model for both arms (defaults to the agent's own default)")
    .option(
      "--instructions <file>",
      "test an instructions file (written as CLAUDE.md or AGENTS.md in treatment)",
    )
    .option(
      "--vs-model <model>",
      "test a different model: control uses --model, treatment uses this",
    )
    .option(
      "--vs-agent <agent>",
      "test a different agent: control uses --agent, treatment uses this",
    )
    .option("-p, --pack <name>", "use a bundled task pack (see `placebo pack list`)")
    .option("-t, --tasks <dir>", "folder of task YAML files (default .placebo/tasks)")
    .option("--task <id...>", "only run these task ids")
    .option("-n, --limit <n>", "maximum number of tasks", "10")
    .option("-r, --repeats <k>", "runs per task per arm", "2")
    .option("-c, --concurrency <n>", "runs in parallel", "2")
    .option("--seed <n>", "seed for task sampling, arm order and statistics")
    .option("--budget <usd>", "stop starting new runs once this much has been spent")
    .option("--max-runs <n>", "hard cap on the number of runs")
    .option("--until-confident", "stop early once the result is statistically settled")
    .option("--min-tasks <n>", "tasks to finish before --until-confident may stop", "6")
    .option(
      "--isolation <mode>",
      "flags (your login, no personal skills) or home (fresh HOME, needs a token)",
    )
    .option("--allow-web", "let the agent use web tools (off by default to block answer lookups)")
    .option("--keep", "keep the temporary workspaces for inspection")
    .option("--pricing <file>", "JSON price table for agents that do not report cost")
    .option("--id <id>", "trial id (default: random)")
    .option("--json", "print a JSON summary instead of the table")
    .option("--open", "open the HTML report when done")
    .option("--fail-on <verdicts>", "exit 3 when the verdict is one of these, e.g. harmful,placebo")
    .option(
      "--resume <trial>",
      "continue a stopped trial (for example after a usage limit), keeping its finished runs",
    )
    .option("-q, --quiet", "no progress output")
    .action(async (skill: string | undefined, opts: TrialCliOptions) => {
      process.exitCode = await trialAction(skill, opts);
    });
}
