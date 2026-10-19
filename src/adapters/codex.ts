import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Usage } from "../core/types.js";
import { totalTokens, ZERO_USAGE } from "../grading/pricing.js";
import { run, which } from "../util/proc.js";
import type { AdapterDetection, AgentAdapter, RunInput, RunOutput, ToolCall } from "./types.js";

export interface ParsedCodex {
  usage: Usage;
  turns: number;
  toolCalls: ToolCall[];
  finalText?: string;
  error?: string;
}

/** Strip the `bash -lc '...'` wrapper Codex puts around shell commands. */
export function unwrapShell(cmd: string): string {
  const m = cmd.match(/^(?:\/bin\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/);
  return m ? m[2]! : cmd;
}

/** Parse `codex exec --json` JSONL events. */
export function parseCodexStream(text: string): ParsedCodex {
  const out: ParsedCodex = { usage: { ...ZERO_USAGE }, turns: 0, toolCalls: [] };
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let e: Record<string, any>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "turn.completed") {
      out.turns += 1;
      const u = e.usage ?? {};
      const input = Number(u.input_tokens ?? 0);
      const cached = Number(u.cached_input_tokens ?? 0);
      out.usage.inputTokens += Math.max(0, input - cached);
      out.usage.cacheReadTokens += cached;
      out.usage.outputTokens += Number(u.output_tokens ?? 0);
    } else if (e.type === "turn.failed") {
      out.error = String(e.error?.message ?? "turn failed");
    } else if (e.type === "error") {
      out.error = String(e.message ?? "error");
    } else if (e.type === "item.completed" && e.item) {
      const it = e.item as Record<string, any>;
      switch (it.type) {
        case "command_execution":
          out.toolCalls.push({
            name: "command_execution",
            kind: "shell",
            command: unwrapShell(String(it.command ?? "")),
            input: it,
          });
          break;
        case "file_change":
          for (const c of Array.isArray(it.changes) ? it.changes : []) {
            out.toolCalls.push({
              name: "file_change",
              kind: c.kind === "add" ? "write" : "edit",
              path: String(c.path ?? ""),
              input: c,
            });
          }
          break;
        case "web_search":
          out.toolCalls.push({
            name: "web_search",
            kind: "web",
            url: String(it.query ?? ""),
            input: it,
          });
          break;
        case "mcp_tool_call":
          out.toolCalls.push({ name: `mcp:${it.server}/${it.tool}`, kind: "other", input: it });
          break;
        case "agent_message":
          if (typeof it.text === "string") out.finalText = it.text;
          break;
        default:
          break;
      }
    }
  }
  return out;
}

export function codexActivated(parsed: ParsedCodex, skillNames: string[]): boolean | null {
  if (!skillNames.length) return null;
  return parsed.toolCalls.some(
    (t) =>
      (t.command && skillNames.some((n) => t.command!.includes(`skills/${n}/SKILL.md`))) ||
      (t.path && skillNames.some((n) => t.path!.includes(`skills/${n}/`))),
  );
}

export const codex: AgentAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  instructionsFile: "AGENTS.md",

  async detect(): Promise<AdapterDetection> {
    const path = await which("codex");
    const notes = [
      "Beta: parsed from the documented `codex exec --json` event stream and recorded fixtures.",
      "Isolation is checked from the clean CODEX_HOME Placebo builds, not from the agent's own report.",
    ];
    if (!path)
      return {
        installed: false,
        status: "beta",
        notes: ["Install Codex CLI: npm i -g @openai/codex", ...notes],
      };
    const v = await run("codex", ["--version"], { timeoutMs: 15_000 }).catch(() => undefined);
    const version = v?.stdout.trim().split(/\s+/).pop();
    const auth = process.env.CODEX_API_KEY
      ? "CODEX_API_KEY"
      : process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY"
        : existsSync(join(homedir(), ".codex", "auth.json"))
          ? "your logged-in Codex session (auth.json)"
          : "not logged in (run `codex login`)";
    return { installed: true, version, auth, status: "beta", notes };
  },

  async run(input: RunInput): Promise<RunOutput> {
    const transcriptFile = join(input.runDir, "transcript.jsonl");
    // A fresh CODEX_HOME per run: only auth is carried over, plus the treatment skills.
    const codexHome = join(input.runDir, "codex-home");
    mkdirSync(join(codexHome, "skills"), { recursive: true });
    const realAuth = join(homedir(), ".codex", "auth.json");
    if (existsSync(realAuth)) copyFileSync(realAuth, join(codexHome, "auth.json"));
    for (const s of input.arm.skills)
      cpSync(s.dir, join(codexHome, "skills", s.name), { recursive: true });

    const args = ["exec", "--json", "--skip-git-repo-check", "--full-auto", "-C", input.workspace];
    if (input.arm.model) args.push("-m", input.arm.model);
    args.push("-");

    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome };
    if (input.isolation === "home" && input.home) env.HOME = input.home;

    const started = Date.now();
    let res: Awaited<ReturnType<typeof run>>;
    try {
      res = await run("codex", args, {
        cwd: input.workspace,
        env,
        input: input.prompt,
        timeoutMs: input.timeoutMs,
        stdoutFile: transcriptFile,
        maxBuffer: 50_000_000,
      });
    } catch (err) {
      return {
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - started,
        usage: { ...ZERO_USAGE },
        costUsd: null,
        turns: null,
        toolCalls: [],
        activated: null,
        error: `could not start codex: ${(err as Error).message}`,
        transcriptFile,
      };
    }
    const parsed = parseCodexStream(readFileSync(transcriptFile, "utf8"));
    let error = parsed.error;
    if (!error && res.code !== 0 && !res.timedOut && totalTokens(parsed.usage) === 0) {
      error = res.stderr.trim().slice(-500) || `codex exited with code ${res.code}`;
    }
    const skillsDir = join(codexHome, "skills");
    return {
      exitCode: res.code,
      timedOut: res.timedOut,
      durationMs: res.durationMs,
      usage: parsed.usage,
      costUsd: null,
      model: input.arm.model,
      turns: parsed.turns,
      toolCalls: parsed.toolCalls,
      init: {
        skills: existsSync(skillsDir)
          ? readdirSync(skillsDir).filter((n) => !n.startsWith("."))
          : [],
        plugins: [],
        mcpServers: [],
        model: input.arm.model,
      },
      activated: codexActivated(
        parsed,
        input.arm.skills.map((s) => s.name),
      ),
      finalText: parsed.finalText,
      error,
      transcriptFile,
    };
  },
};
