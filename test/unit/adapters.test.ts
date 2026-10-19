import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeActivated, parseClaudeStream } from "../../src/adapters/claude-code.js";
import { codexActivated, parseCodexStream, unwrapShell } from "../../src/adapters/codex.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "transcripts", name), "utf8");

describe("Claude Code stream parser (recorded from Claude Code 2.1.25)", () => {
  it("reads the startup snapshot of a session with personal skills", () => {
    const p = parseClaudeStream(fixture("claude-real-home.jsonl"));
    expect(p.init?.skills).toContain("notes-helper");
    expect(p.init?.plugins).toEqual(["trend-scan"]);
    expect(p.init?.mcpServers).toEqual([]);
    expect(p.init?.agentVersion).toBe("2.1.25");
  });

  it("reads usage, cost and a fired skill from a treatment session", () => {
    const p = parseClaudeStream(fixture("claude-skill-fired.jsonl"));
    expect(p.init?.skills).toEqual(["keybindings-help", "placebo-intervention:greeter"]);
    expect(p.init?.plugins).toEqual(["placebo-intervention"]);
    expect(p.skillCalls).toEqual(["placebo-intervention:greeter"]);
    expect(p.costUsd).toBeGreaterThan(0);
    expect(p.turns).toBe(3);
    expect(
      p.usage.inputTokens +
        p.usage.outputTokens +
        p.usage.cacheReadTokens +
        p.usage.cacheWriteTokens,
    ).toBeGreaterThan(0);
    expect(p.finalText).toBe("PLACEBO-CANARY-7731");
    expect(claudeActivated(p, ["greeter"])).toBe(true);
    expect(claudeActivated(p, ["other"])).toBe(false);
    expect(claudeActivated(p, [])).toBeNull();
  });

  it("normalises tool calls and survives junk lines", () => {
    const text = [
      "not json",
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Bash", input: { command: "npm test" } },
            { type: "tool_use", name: "Edit", input: { file_path: "/w/src/a.ts" } },
            { type: "tool_use", name: "WebFetch", input: { url: "https://x.dev" } },
          ],
        },
      }),
      JSON.stringify({
        type: "result",
        is_error: true,
        result: "Invalid API key · Please run /login",
        total_cost_usd: 0,
        num_turns: 1,
      }),
    ].join("\n");
    const p = parseClaudeStream(text);
    expect(p.toolCalls.map((t) => t.kind)).toEqual(["shell", "edit", "web"]);
    expect(p.toolCalls[0]!.command).toBe("npm test");
    expect(p.error).toMatch(/Invalid API key/);
  });
});

describe("Codex exec --json parser", () => {
  const events = [
    { type: "thread.started", thread_id: "t1" },
    { type: "turn.started" },
    {
      type: "item.started",
      item: { id: "1", type: "command_execution", command: "bash -lc 'ls'", status: "in_progress" },
    },
    {
      type: "item.completed",
      item: {
        id: "1",
        type: "command_execution",
        command: "bash -lc 'cat /h/.codex/skills/tidy/SKILL.md'",
        exit_code: 0,
        status: "completed",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "2",
        type: "file_change",
        changes: [
          { path: "src/a.ts", kind: "update" },
          { path: "src/b.ts", kind: "add" },
        ],
        status: "completed",
      },
    },
    { type: "item.completed", item: { id: "3", type: "agent_message", text: "Done." } },
    {
      type: "turn.completed",
      usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 120 },
    },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");

  it("counts completed items only and splits cached input", () => {
    const p = parseCodexStream(events);
    expect(p.toolCalls.map((t) => t.kind)).toEqual(["shell", "edit", "write"]);
    expect(p.usage).toEqual({
      inputTokens: 400,
      cacheReadTokens: 600,
      outputTokens: 120,
      cacheWriteTokens: 0,
    });
    expect(p.turns).toBe(1);
    expect(p.finalText).toBe("Done.");
    expect(codexActivated(p, ["tidy"])).toBe(true);
  });

  it("unwraps shell wrappers", () => {
    expect(unwrapShell("bash -lc 'npm test'")).toBe("npm test");
    expect(unwrapShell('/bin/zsh -lc "ls -la"')).toBe("ls -la");
    expect(unwrapShell("npm test")).toBe("npm test");
  });
});
