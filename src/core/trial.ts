import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { getAdapter } from "../adapters/registry.js";
import type { RunOutput } from "../adapters/types.js";
import { analyzeAdverse } from "../grading/adverse.js";
import { runCheck } from "../grading/check.js";
import { estimateCost, totalTokens } from "../grading/pricing.js";
import { makeCanaries, plantHomeCanaries } from "../isolation/canaries.js";
import { verifyIsolation } from "../isolation/verify.js";
import { createWorkspace } from "../isolation/workspace.js";
import { writeReports } from "../report/write.js";
import { computeMetrics } from "../stats/metrics.js";
import { ALPHA } from "../stats/verdict.js";
import type { Task } from "../tasks/schema.js";
import { ensureDir, makeTempDir, removeDir, writeJson, writeText } from "../util/fs.js";
import { diffSinceSnapshot } from "../util/git.js";
import { trialId } from "../util/ids.js";
import { mulberry32, seedFrom } from "../util/prng.js";
import { VERSION } from "../version.js";
import { computeResults } from "./results.js";
import type {
  ArmName,
  ArmSpec,
  InitSnapshot,
  Intervention,
  IsolationReport,
  RunRecord,
  TrialRecord,
} from "./types.js";

export interface TrialOptions {
  cwd: string;
  tasks: Task[];
  intervention: Intervention;
  arms: { control: ArmSpec; treatment: ArmSpec };
  repeats: number;
  concurrency: number;
  seed: number;
  isolation: "flags" | "home";
  allowWeb: boolean;
  budgetUsd: number | null;
  maxRuns: number | null;
  untilConfident: boolean;
  minTasks: number;
  keepWorkspaces: boolean;
  /** Where the tasks came from, stored so a stopped trial can be resumed. */
  taskSource?: { pack?: string; tasks?: string };
  /** Continue this earlier trial: keep its finished runs and run only what is missing. */
  resume?: TrialRecord;
  /** Where trials are written. Defaults to <cwd>/.placebo/trials. */
  trialsDir?: string;
  id?: string;
  onEvent?: (e: TrialEvent) => void;
}

export type TrialEvent =
  | { type: "start"; trial: TrialRecord; dir: string; totalRuns: number }
  | { type: "run-start"; taskId: string; arm: ArmName; rep: number }
  | { type: "run-done"; run: RunRecord; done: number; total: number; spentUsd: number }
  | { type: "isolation"; report: IsolationReport }
  | { type: "stop"; reason: string }
  | { type: "done"; trial: TrialRecord; dir: string };

interface Job {
  task: Task;
  arm: ArmName;
  rep: number;
}

export class TrialError extends Error {}

/** Agent errors that mean "stop now and come back later", not "this task failed". */
const USAGE_LIMIT =
  /hit your limit|usage limit|rate.?limit|quota|credit balance|overloaded|\b429\b/i;

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Claude Code may create a project folder for each temp workspace; remove the ones Placebo caused. */
function cleanClaudeResidue(): void {
  const dir = join(homedir(), ".claude", "projects");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) if (name.includes("placebo-ws-")) removeDir(join(dir, name));
}

export async function runTrial(o: TrialOptions): Promise<{ trial: TrialRecord; dir: string }> {
  if (!o.tasks.length) throw new TrialError("No tasks to run.");
  const adapters = {
    control: getAdapter(o.arms.control.agent),
    treatment: getAdapter(o.arms.treatment.agent),
  };
  const detections = {
    control: await adapters.control.detect(),
    treatment: await adapters.treatment.detect(),
  };
  for (const arm of ["control", "treatment"] as const) {
    if (!detections[arm].installed)
      throw new TrialError(
        `${adapters[arm].displayName} is not installed. ${detections[arm].notes.join(" ")}`,
      );
  }
  if (
    o.isolation === "home" &&
    [o.arms.control.agent, o.arms.treatment.agent].includes("claude-code") &&
    !process.env.CLAUDE_CODE_OAUTH_TOKEN &&
    !process.env.ANTHROPIC_API_KEY
  ) {
    throw new TrialError(
      "Home isolation needs a token the agent can use without your keychain. Run `claude setup-token` once and export CLAUDE_CODE_OAUTH_TOKEN, or use --isolation flags.",
    );
  }

  const prior = o.resume;
  const id = prior?.id ?? o.id ?? trialId();
  const dir = ensureDir(join(o.trialsDir ?? join(o.cwd, ".placebo", "trials"), id));
  const fresh: TrialRecord = {
    schema: "placebo.trial/v1",
    id,
    createdAt: new Date().toISOString(),
    placeboVersion: VERSION,
    intervention: {
      ...o.intervention,
      skill: o.intervention.skill
        ? { name: o.intervention.skill.name, dir: o.intervention.skill.dir }
        : undefined,
    },
    arms: o.arms,
    agent: {
      id: o.arms.control.agent,
      version: detections.control.version,
      model: o.arms.control.model,
    },
    design: {
      tasks: o.tasks.length,
      repeats: o.repeats,
      seed: o.seed,
      concurrency: o.concurrency,
      isolation: o.isolation,
      allowWeb: o.allowWeb,
      budgetUsd: o.budgetUsd,
      untilConfident: o.untilConfident,
      taskSource: o.taskSource,
    },
    tasks: o.tasks.map((t) => ({ id: t.id, title: t.title, hash: t.hash, source: t.source })),
    runs: [],
    isolation: { mode: o.isolation, verified: false, notes: [] },
  };
  const trial: TrialRecord = prior
    ? {
        ...prior,
        finishedAt: undefined,
        results: undefined,
        runs: prior.runs.filter((r) => r.status !== "error"),
        design: {
          ...prior.design,
          concurrency: o.concurrency,
          budgetUsd: o.budgetUsd,
          stoppedEarly: undefined,
        },
      }
    : fresh;
  const finished = new Set(trial.runs.map((r) => `${r.taskId}|${r.arm}|${r.rep}`));

  // Build the schedule: tasks in a seeded order, both arms per repeat, arm order flipped by coin.
  const jobs: Job[] = [];
  const order = shuffle(o.tasks, seedFrom(o.seed, "order"));
  for (const task of order) {
    for (let rep = 0; rep < o.repeats; rep++) {
      const first: ArmName =
        mulberry32(seedFrom(o.seed, task.id, rep, "arm"))() < 0.5 ? "control" : "treatment";
      const second: ArmName = first === "control" ? "treatment" : "control";
      for (const arm of [first, second]) {
        if (!finished.has(`${task.id}|${arm}|${rep}`)) jobs.push({ task, arm, rep });
      }
    }
  }
  const total = trial.runs.length + (o.maxRuns ? Math.min(jobs.length, o.maxRuns) : jobs.length);
  writeJson(join(dir, "trial.json"), trial);
  o.onEvent?.({ type: "start", trial, dir, totalRuns: total });

  const snapshots: Partial<Record<ArmName, InitSnapshot>> = {};
  let spent = 0;
  let started = 0;
  let stopReason: string | undefined;
  const remainingPerTask = new Map<string, number>();
  for (const j of jobs) remainingPerTask.set(j.task.id, (remainingPerTask.get(j.task.id) ?? 0) + 1);
  let tasksComplete = o.tasks.filter((t) => !remainingPerTask.has(t.id)).length;

  const stop = (reason: string) => {
    if (!stopReason) {
      stopReason = reason;
      o.onEvent?.({ type: "stop", reason });
    }
  };

  const runOne = async (job: Job): Promise<RunRecord> => {
    const { task, arm, rep } = job;
    const spec = o.arms[arm];
    const adapter = adapters[arm];
    const runDirRel = join("runs", task.id, `${arm}-${rep + 1}`);
    const runDir = ensureDir(join(dir, runDirRel));
    const wsDir = makeTempDir("ws");
    const home = o.isolation === "home" ? makeTempDir("home") : undefined;
    const canaries = makeCanaries();
    if (home) plantHomeCanaries(home, canaries);
    const base: Omit<RunRecord, "status" | "passed"> = {
      taskId: task.id,
      arm,
      rep,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      totalTokens: 0,
      costUsd: null,
      costEstimated: false,
      durationMs: 0,
      turns: null,
      toolCalls: 0,
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: 0,
      activated: null,
      adverse: [],
      dir: runDirRel,
    };
    try {
      const ws = await createWorkspace(task, {
        dir: wsDir,
        instructions: spec.instructions,
        plant: canaries.workspaceFiles,
      });
      if (!ws.setupOk) {
        writeText(join(runDir, "setup.log"), ws.setupLog);
        return {
          ...base,
          status: "error",
          passed: false,
          error: "task setup command failed (see setup.log)",
        };
      }
      o.onEvent?.({ type: "run-start", taskId: task.id, arm, rep });
      const out: RunOutput = await adapter.run({
        task,
        arm: spec,
        workspace: ws.dir,
        runDir,
        prompt: task.prompt,
        timeoutMs: task.timeout * 1000,
        isolation: o.isolation,
        home,
        allowWeb: o.allowWeb,
        canaries,
        seed: o.seed,
        rep,
      });
      if (out.init && !snapshots[arm]) snapshots[arm] = out.init;
      const tokens = totalTokens(out.usage);
      const cost = out.costUsd ?? estimateCost(out.model ?? spec.model, out.usage);
      const filled = {
        ...base,
        usage: out.usage,
        totalTokens: tokens,
        costUsd: cost,
        costEstimated: out.costUsd === null && cost !== null,
        durationMs: out.durationMs,
        turns: out.turns,
        toolCalls: out.toolCalls.length,
        activated: out.activated,
      };
      if (out.error && tokens === 0) {
        return { ...filled, status: "error", passed: false, error: out.error };
      }
      const diff = await diffSinceSnapshot(ws.dir);
      writeText(join(runDir, "diff.patch"), diff.patch);
      const check = await runCheck(task, ws.dir);
      writeText(join(runDir, "check.log"), check.output);
      const adverse = analyzeAdverse({
        toolCalls: out.toolCalls,
        diff,
        canaries,
        workspace: ws.dir,
        home,
        hiddenFiles: task.hidden.files,
        finalText: out.finalText,
      });
      return {
        ...filled,
        status: check.passed ? "passed" : out.timedOut ? "timeout" : "failed",
        passed: check.passed,
        linesAdded: diff.added,
        linesRemoved: diff.removed,
        filesChanged: diff.files.length,
        adverse,
        error: out.error,
      };
    } catch (err) {
      return { ...base, status: "error", passed: false, error: (err as Error).message };
    } finally {
      if (!o.keepWorkspaces) {
        removeDir(wsDir);
        if (home) removeDir(home);
      }
    }
  };

  const checkIsolation = () => {
    if (trial.isolation.control || !snapshots.control || !snapshots.treatment) return;
    trial.isolation = verifyIsolation(o.isolation, o.arms, snapshots.control, snapshots.treatment);
    o.onEvent?.({ type: "isolation", report: trial.isolation });
    if (!trial.isolation.verified) stop("isolation check failed");
  };

  const checkConfidence = () => {
    if (!o.untilConfident || tasksComplete < o.minTasks) return;
    const metrics = computeMetrics(trial.runs, o.seed);
    const sig = metrics.filter(
      (m) =>
        ["pass", "cost", "tokens"].includes(m.key) &&
        m.pValue < ALPHA &&
        (m.ciLow > 0 || m.ciHigh < 0),
    );
    if (sig.length)
      stop(`confident after ${tasksComplete} tasks (${sig.map((m) => m.key).join(", ")} settled)`);
    if (o.intervention.kind === "skill") {
      const treated = trial.runs.filter((r) => r.arm === "treatment" && r.activated !== null);
      if (treated.length >= o.minTasks && treated.every((r) => !r.activated))
        stop(`skill never activated in ${treated.length} runs`);
    }
  };

  await new Promise<void>((resolveAll) => {
    const queue = [...jobs];
    let active = 0;
    let finished = false;
    const finish = () => {
      if (!finished && active === 0) {
        finished = true;
        resolveAll();
      }
    };
    const pump = () => {
      while (!stopReason && active < o.concurrency && queue.length) {
        if (o.maxRuns && started >= o.maxRuns) {
          stop(`reached --max-runs ${o.maxRuns}`);
          break;
        }
        if (o.budgetUsd !== null && spent >= o.budgetUsd) {
          stop(`reached the $${o.budgetUsd} budget`);
          break;
        }
        const job = queue.shift()!;
        active++;
        started++;
        runOne(job)
          .then((run) => {
            trial.runs.push(run);
            spent += run.costUsd ?? 0;
            if (run.status === "error" && run.error && USAGE_LIMIT.test(run.error)) {
              stop(
                `the agent hit a usage limit (${run.error.slice(0, 100)}). Resume later with: placebo trial --resume ${trial.id}`,
              );
            }
            const left = (remainingPerTask.get(job.task.id) ?? 1) - 1;
            remainingPerTask.set(job.task.id, left);
            if (left === 0) tasksComplete++;
            writeJson(join(dir, "trial.json"), trial);
            o.onEvent?.({ type: "run-done", run, done: trial.runs.length, total, spentUsd: spent });
            checkIsolation();
            if (left === 0) checkConfidence();
          })
          .finally(() => {
            active--;
            if (stopReason || !queue.length) finish();
            else pump();
          });
      }
      if (stopReason || !queue.length) finish();
    };
    pump();
  });

  if (o.arms.control.agent === "claude-code" || o.arms.treatment.agent === "claude-code")
    cleanClaudeResidue();
  if (!trial.isolation.control) checkIsolation();
  if (stopReason) trial.design.stoppedEarly = stopReason;
  trial.finishedAt = new Date().toISOString();
  trial.results = computeResults(trial);
  writeJson(join(dir, "trial.json"), trial);
  writeReports(trial, dir);
  o.onEvent?.({ type: "done", trial, dir });
  return { trial, dir };
}

export function relativeTrialDir(cwd: string, dir: string): string {
  return relative(cwd, dir) || ".";
}
