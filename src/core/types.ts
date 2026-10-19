/** Shared types for trials, runs and results. */

export type ArmName = "control" | "treatment";

export interface SkillRef {
  /** Skill name from SKILL.md frontmatter. */
  name: string;
  /** Local directory that contains SKILL.md. */
  dir: string;
}

export interface InstructionsRef {
  /** File written to the workspace root, e.g. CLAUDE.md or AGENTS.md. */
  fileName: string;
  content: string;
}

export type InterventionKind = "skill" | "instructions" | "model" | "agent";

export interface Intervention {
  kind: InterventionKind;
  /** Short display label, e.g. "ponytail" or "opus vs sonnet". */
  label: string;
  /** Where it came from: a path, a URL or a model/agent id. */
  source: string;
  /** Content hash of the intervention so a trial can be re-run against the same bytes. */
  contentHash?: string;
  skill?: SkillRef;
  instructions?: InstructionsRef;
}

export interface ArmSpec {
  name: ArmName;
  /** Adapter id, e.g. "claude-code". */
  agent: string;
  model?: string;
  skills: SkillRef[];
  instructions?: InstructionsRef;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type AdverseKind =
  | "canary-leak"
  | "canary-read"
  | "test-tamper"
  | "outside-write"
  | "persistence"
  | "destructive"
  | "network"
  | "dependency-added"
  | "web-tool";

export type Severity = "info" | "warning" | "critical";

export interface AdverseEvent {
  kind: AdverseKind;
  severity: Severity;
  detail: string;
  /** The command, path or snippet that triggered it. */
  evidence?: string;
}

export type RunStatus = "passed" | "failed" | "error" | "timeout";

export interface RunRecord {
  taskId: string;
  arm: ArmName;
  rep: number;
  status: RunStatus;
  passed: boolean;
  usage: Usage;
  totalTokens: number;
  costUsd: number | null;
  /** True when cost came from the pricing table rather than the agent itself. */
  costEstimated: boolean;
  durationMs: number;
  turns: number | null;
  toolCalls: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  /** Did the intervention skill fire? null when not applicable or not observable. */
  activated: boolean | null;
  adverse: AdverseEvent[];
  error?: string;
  /** Run directory relative to the trial directory. */
  dir: string;
}

export type VerdictLabel = "WORKS" | "PLACEBO" | "HARMFUL" | "INCONCLUSIVE";

export interface MetricResult {
  key: "pass" | "tokens" | "cost" | "time" | "lines";
  label: string;
  /** "points" for pass-rate differences, "ratio" for relative change. */
  unit: "points" | "ratio";
  control: number;
  treatment: number;
  /** Point estimate: percentage points for pass, relative change (0.1 = +10%) for ratios. */
  effect: number;
  ciLow: number;
  ciHigh: number;
  /** Paired sign-flip permutation test across tasks. */
  pValue: number;
  /** Wilcoxon signed-rank test on the same per-task differences, as a cross-check. */
  pWilcoxon?: number;
  /** Number of paired tasks that contributed. */
  n: number;
  /** Lower is better for cost-like metrics. */
  lowerIsBetter: boolean;
  /** Informational only: no direction is better (e.g. lines changed). */
  neutral?: boolean;
}

export interface Verdict {
  label: VerdictLabel;
  headline: string;
  reasons: string[];
  /** Rough number of tasks needed to settle an inconclusive result. */
  tasksNeeded?: number;
}

export interface IsolationReport {
  mode: "flags" | "home";
  verified: boolean;
  control?: InitSnapshot;
  treatment?: InitSnapshot;
  notes: string[];
}

export interface InitSnapshot {
  skills: string[];
  plugins: string[];
  mcpServers: string[];
  model?: string;
  agentVersion?: string;
}

export interface TrialResults {
  metrics: MetricResult[];
  activation: { fired: number; runs: number } | null;
  adverse: {
    /** Runs with at least one warning or critical event, per arm. */
    control: number;
    treatment: number;
    /** Runs with at least one critical event, per arm. */
    criticalControl: number;
    criticalTreatment: number;
    /** Event counts by kind, per arm. */
    events: Record<string, { control: number; treatment: number }>;
  };
  verdict: Verdict;
}

export interface TrialRecord {
  schema: "placebo.trial/v1";
  id: string;
  createdAt: string;
  finishedAt?: string;
  placeboVersion: string;
  intervention: Intervention;
  arms: Record<ArmName, ArmSpec>;
  agent: { id: string; version?: string; model?: string };
  design: {
    tasks: number;
    repeats: number;
    seed: number;
    concurrency: number;
    isolation: "flags" | "home";
    allowWeb: boolean;
    budgetUsd: number | null;
    untilConfident: boolean;
    stoppedEarly?: string;
    /** Where the tasks came from, so a stopped trial can be resumed. */
    taskSource?: { pack?: string; tasks?: string };
  };
  tasks: { id: string; title: string; hash: string; source: string }[];
  runs: RunRecord[];
  isolation: IsolationReport;
  results?: TrialResults;
}
