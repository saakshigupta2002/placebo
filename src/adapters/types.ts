import type { ArmSpec, InitSnapshot, Usage } from "../core/types.js";
import type { CanarySet } from "../isolation/canaries.js";
import type { Task } from "../tasks/schema.js";

/** One tool call the agent made, normalised across agents. */
export interface ToolCall {
  /** Agent-specific tool name, e.g. "Bash", "Edit", "command_execution". */
  name: string;
  kind: "shell" | "read" | "write" | "edit" | "web" | "skill" | "search" | "other";
  /** Shell command line, when kind is "shell". */
  command?: string;
  /** File path, when the tool targets a file. */
  path?: string;
  /** URL or query, when kind is "web". */
  url?: string;
  /** Raw input, kept for evidence. */
  input?: unknown;
}

export interface AdapterDetection {
  installed: boolean;
  version?: string;
  /** How the agent will authenticate, in plain words. */
  auth?: string;
  /** "stable" adapters are verified against the real CLI; "beta" ones only against recorded fixtures. */
  status: "stable" | "beta" | "test";
  notes: string[];
}

export interface RunInput {
  task: Task;
  arm: ArmSpec;
  /** Workspace directory the agent works in. */
  workspace: string;
  /** Directory for this run's artifacts (transcript, plugin wrapper). */
  runDir: string;
  prompt: string;
  timeoutMs: number;
  isolation: "flags" | "home";
  /** Temp HOME for home isolation. */
  home?: string;
  allowWeb: boolean;
  canaries: CanarySet;
  /** Seed for deterministic adapters. */
  seed: number;
  rep: number;
}

export interface RunOutput {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  usage: Usage;
  /** Cost reported by the agent itself, if any. */
  costUsd: number | null;
  model?: string;
  turns: number | null;
  toolCalls: ToolCall[];
  init?: InitSnapshot;
  /** Did the intervention skill fire? null when not applicable or not observable. */
  activated: boolean | null;
  finalText?: string;
  /** Agent-level failure (auth, crash). Distinct from failing the task. */
  error?: string;
  transcriptFile: string;
}

export interface AgentAdapter {
  id: string;
  displayName: string;
  /** Instruction file this agent reads from the repo root. */
  instructionsFile: string;
  detect(): Promise<AdapterDetection>;
  run(input: RunInput): Promise<RunOutput>;
}
