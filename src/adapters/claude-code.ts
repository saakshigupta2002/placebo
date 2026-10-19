import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InitSnapshot, Usage } from "../core/types.js";
import { totalTokens, ZERO_USAGE } from "../grading/pricing.js";
import { INTERVENTION_PLUGIN } from "../isolation/verify.js";
import { run, which } from "../util/proc.js";
import type { AdapterDetection, AgentAdapter, RunInput, RunOutput, ToolCall } from "./types.js";

/** Environment variables that make a nested `claude` think it runs inside another session. */
const NESTED_SESSION_VARS = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT"];

export interface ParsedClaude {
  init?: InitSnapshot;
  usage: Usage;
  costUsd: number | null;
  turns: number | null;
  model?: string;
  toolCalls: ToolCall[];
  finalText?: string;
  error?: string;
  skillCalls: string[];
}

function toolKind(name: string, input: Record<string, unknown>): ToolCall {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  switch (name) {
    case "Bash":
      return { name, kind: "shell", command: str("command"), input };
    case "Read":
      return { name, kind: "read", path: str("file_path"), input };
    case "Write":
      return { name, kind: "write", path: str("file_path"), input };
    case "Edit":
    case "MultiEdit":
      return { name, kind: "edit", path: str("file_path"), input };
    case "NotebookEdit":
      return { name, kind: "edit", path: str("notebook_path"), input };
    case "Glob":
    case "Grep":
      return { name, kind: "search", path: str("path"), input };
    case "WebFetch":
      return { name, kind: "web", url: str("url"), input };
    case "WebSearch":
      return { name, kind: "web", url: str("query"), input };
    case "Skill":
      return { name, kind: "skill", input };
    default:
      return { name, kind: "other", input };
  }
}

/** Parse a `claude -p --output-format stream-json --verbose` transcript. */
export function parseClaudeStream(text: string): ParsedClaude {
  const out: ParsedClaude = {
    usage: { ...ZERO_USAGE },
    costUsd: null,
    turns: null,
    toolCalls: [],
    skillCalls: [],
  };
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let e: Record<string, any>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "system" && e.subtype === "init") {
      out.init = {
        skills: Array.isArray(e.skills) ? e.skills.map(String) : [],
        plugins: Array.isArray(e.plugins) ? e.plugins.map((p: any) => String(p?.name ?? p)) : [],
        mcpServers: Array.isArray(e.mcp_servers)
          ? e.mcp_servers.map((m: any) => String(m?.name ?? m))
          : [],
        model: e.model,
        agentVersion: e.claude_code_version,
      };
      out.model = e.model;
    } else if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        if (c?.type === "tool_use") {
          const call = toolKind(String(c.name), (c.input ?? {}) as Record<string, unknown>);
          out.toolCalls.push(call);
          if (call.kind === "skill") {
            const s = (c.input?.skill ?? c.input?.command ?? c.input?.name) as string | undefined;
            if (s) out.skillCalls.push(String(s));
          }
        } else if (c?.type === "text" && typeof c.text === "string") {
          out.finalText = c.text;
        }
      }
    } else if (e.type === "result") {
      out.costUsd = typeof e.total_cost_usd === "number" ? e.total_cost_usd : null;
      out.turns = typeof e.num_turns === "number" ? e.num_turns : null;
      if (typeof e.result === "string") out.finalText = e.result;
      if (e.is_error)
        out.error = typeof e.result === "string" ? e.result : String(e.subtype ?? "error");
      const mu = e.modelUsage as Record<string, any> | undefined;
      if (mu && Object.keys(mu).length) {
        const u = { ...ZERO_USAGE };
        for (const m of Object.values(mu)) {
          u.inputTokens += Number(m.inputTokens ?? 0);
          u.outputTokens += Number(m.outputTokens ?? 0);
          u.cacheReadTokens += Number(m.cacheReadInputTokens ?? 0);
          u.cacheWriteTokens += Number(m.cacheCreationInputTokens ?? 0);
        }
        out.usage = u;
      } else if (e.usage) {
        out.usage = {
          inputTokens: Number(e.usage.input_tokens ?? 0),
          outputTokens: Number(e.usage.output_tokens ?? 0),
          cacheReadTokens: Number(e.usage.cache_read_input_tokens ?? 0),
          cacheWriteTokens: Number(e.usage.cache_creation_input_tokens ?? 0),
        };
      }
    }
  }
  return out;
}

/** Did any of the intervention skills fire in this transcript? */
export function claudeActivated(parsed: ParsedClaude, skillNames: string[]): boolean | null {
  if (!skillNames.length) return null;
  const strip = (s: string) => (s.includes(":") ? s.slice(s.indexOf(":") + 1) : s);
  if (parsed.skillCalls.some((s) => skillNames.includes(strip(s)))) return true;
  return parsed.toolCalls.some(
    (t) =>
      t.kind === "read" &&
      t.path !== undefined &&
      skillNames.some(
        (n) =>
          t.path!.includes(`/${INTERVENTION_PLUGIN}/skills/${n}/`) ||
          t.path!.endsWith(`/${n}/SKILL.md`),
      ),
  );
}

/** Wrap the treatment skills in a throwaway plugin so they load for this session only. */
function buildPluginWrapper(input: RunInput): string | undefined {
  if (!input.arm.skills.length) return undefined;
  const dir = join(input.runDir, "plugin");
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify({ name: INTERVENTION_PLUGIN, version: "0.0.0", description: "Placebo trial intervention (temporary)" }, null, 2)}\n`,
  );
  for (const s of input.arm.skills) cpSync(s.dir, join(dir, "skills", s.name), { recursive: true });
  return dir;
}

export const claudeCode: AgentAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  instructionsFile: "CLAUDE.md",

  async detect(): Promise<AdapterDetection> {
    const path = await which("claude");
    if (!path)
      return {
        installed: false,
        status: "stable",
        notes: ["Install Claude Code: https://claude.com/claude-code"],
      };
    const v = await run("claude", ["--version"], { timeoutMs: 15_000 }).catch(() => undefined);
    const version = v?.stdout.trim().split(/\s+/)[0];
    const auth = process.env.ANTHROPIC_API_KEY
      ? "ANTHROPIC_API_KEY"
      : process.env.CLAUDE_CODE_OAUTH_TOKEN
        ? "CLAUDE_CODE_OAUTH_TOKEN (subscription)"
        : "your logged-in Claude Code session";
    return { installed: true, version, auth, status: "stable", notes: [] };
  },

  async run(input: RunInput): Promise<RunOutput> {
    const transcriptFile = join(input.runDir, "transcript.jsonl");
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--permission-mode",
      "bypassPermissions",
      "--setting-sources",
      "project,local",
      "--strict-mcp-config",
    ];
    if (input.arm.model) args.push("--model", input.arm.model);
    if (!input.allowWeb) args.push("--disallowedTools", "WebFetch,WebSearch");
    const plugin = buildPluginWrapper(input);
    if (plugin) args.push("--plugin-dir", plugin);

    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of NESTED_SESSION_VARS) delete env[k];
    if (input.isolation === "home" && input.home) {
      env.HOME = input.home;
      env.USERPROFILE = input.home;
    }

    const started = Date.now();
    let res: Awaited<ReturnType<typeof run>>;
    try {
      // The prompt goes in on stdin, which also closes it so `claude -p` never waits.
      res = await run("claude", args, {
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
        error: `could not start claude: ${(err as Error).message}`,
        transcriptFile,
      };
    }
    const parsed = parseClaudeStream(readFileSync(transcriptFile, "utf8"));
    let error = parsed.error;
    if (!error && res.code !== 0 && !res.timedOut && totalTokens(parsed.usage) === 0) {
      error = res.stderr.trim().slice(-500) || `claude exited with code ${res.code}`;
    }
    return {
      exitCode: res.code,
      timedOut: res.timedOut,
      durationMs: res.durationMs,
      usage: parsed.usage,
      costUsd: parsed.costUsd,
      model: parsed.model,
      turns: parsed.turns,
      toolCalls: parsed.toolCalls,
      init: parsed.init,
      activated: claudeActivated(
        parsed,
        input.arm.skills.map((s) => s.name),
      ),
      finalText: parsed.finalText,
      error,
      transcriptFile,
    };
  },
};
