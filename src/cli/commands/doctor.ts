import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { listAdapters } from "../../adapters/registry.js";
import type { RunInput } from "../../adapters/types.js";
import { makeCanaries } from "../../isolation/canaries.js";
import { userSkillNames } from "../../isolation/verify.js";
import { fmtCost, fmtTokens } from "../../report/format.js";
import type { Task } from "../../tasks/schema.js";
import { makeTempDir, removeDir } from "../../util/fs.js";
import { snapshot } from "../../util/git.js";
import { run } from "../../util/proc.js";
import { VERSION } from "../../version.js";

const ok = (s: string): void => void process.stdout.write(`  ${pc.green("✓")} ${s}\n`);
const bad = (s: string): void => void process.stdout.write(`  ${pc.red("✗")} ${s}\n`);
const warn = (s: string): void => void process.stdout.write(`  ${pc.yellow("!")} ${s}\n`);
const note = (s: string): void => void process.stdout.write(`  ${pc.dim("·")} ${s}\n`);

async function probe(adapterId: string): Promise<void> {
  const adapter = listAdapters().find((a) => a.id === adapterId)!;
  const ws = makeTempDir("ws");
  const runDir = makeTempDir("probe");
  try {
    writeFileSync(join(ws, "README.md"), "# probe\n");
    await snapshot(ws);
    const task = {
      id: "probe",
      hidden: { files: [] },
      repoPath: ws,
      base: "HEAD",
    } as unknown as Task;
    const input: RunInput = {
      task,
      arm: { name: "control", agent: adapterId, skills: [] },
      workspace: ws,
      runDir,
      prompt: "Reply with the single word OK. Do not use any tools.",
      timeoutMs: 120_000,
      isolation: "flags",
      allowWeb: false,
      canaries: makeCanaries(),
      seed: 1,
      rep: 0,
    };
    const out = await adapter.run(input);
    if (out.error) return bad(`${adapter.displayName} probe failed: ${out.error}`);
    const leaked = (out.init?.skills ?? []).filter((s) =>
      userSkillNames().includes(s.includes(":") ? s.slice(s.indexOf(":") + 1) : s),
    );
    const plugins = out.init?.plugins ?? [];
    const mcp = out.init?.mcpServers ?? [];
    if (!leaked.length && !plugins.length && !mcp.length) {
      ok(
        `${adapter.displayName} probe: clean arm saw ${out.init?.skills.length ? `only built-in skills (${out.init.skills.join(", ")})` : "no skills"}, no plugins, no MCP servers (${fmtTokens(out.usage.inputTokens + out.usage.outputTokens + out.usage.cacheReadTokens + out.usage.cacheWriteTokens)} tokens, ${fmtCost(out.costUsd)})`,
      );
    } else {
      bad(
        `${adapter.displayName} probe: clean arm saw personal skills [${leaked.join(", ")}], plugins [${plugins.join(", ")}], MCP [${mcp.join(", ")}]`,
      );
    }
  } finally {
    removeDir(ws);
    removeDir(runDir);
    const projects = join(homedir(), ".claude", "projects");
    if (existsSync(projects)) {
      const { readdirSync } = await import("node:fs");
      for (const n of readdirSync(projects))
        if (n.includes("placebo-ws-")) removeDir(join(projects, n));
    }
  }
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Check agents, auth and isolation before running trials")
    .option(
      "--probe",
      "start one tiny real session per installed agent to confirm isolation (about $0.01)",
    )
    .action(async (o) => {
      process.stdout.write(`\n${pc.bold("Placebo doctor")} ${pc.dim(VERSION)}\n\n`);
      const major = Number(process.versions.node.split(".")[0]);
      major >= 22
        ? ok(`node ${process.versions.node}`)
        : bad(`node ${process.versions.node} (need 22 or newer)`);
      const g = await run("git", ["--version"]).catch(() => undefined);
      g?.code === 0 ? ok(g.stdout.trim()) : bad("git not found");
      process.stdout.write(`\n  ${pc.bold("Agents")}\n`);
      const installed: string[] = [];
      for (const a of listAdapters()) {
        const d = await a.detect();
        const tag = pc.dim(`(${d.status})`);
        if (d.installed) {
          ok(`${a.displayName} ${d.version ?? ""} ${tag} · auth: ${d.auth ?? "unknown"}`);
          if (a.id !== "fake") installed.push(a.id);
        } else bad(`${a.displayName} not installed ${tag} · ${d.notes[0] ?? ""}`);
      }
      process.stdout.write(`\n  ${pc.bold("Isolation")}\n`);
      ok("flags mode: uses your login and hides personal skills, plugins and MCP servers");
      if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY)
        ok("home mode: available (fresh HOME per run with planted fake secrets)");
      else
        warn(
          "home mode: needs CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token`) or ANTHROPIC_API_KEY",
        );
      const skills = userSkillNames();
      note(
        `${skills.length} personal skill${skills.length === 1 ? "" : "s"} found${skills.length ? ` (${skills.slice(0, 6).join(", ")}${skills.length > 6 ? ", ..." : ""})` : ""}; the isolation check confirms none of them load in a trial`,
      );
      if (existsSync(join(homedir(), ".claude", "CLAUDE.md"))) {
        warn(
          "~/.claude/CLAUDE.md exists. In flags mode it may load in both arms equally, so comparisons stay fair but are not clean. Use home mode for a clean baseline.",
        );
      }
      if (o.probe) {
        process.stdout.write(`\n  ${pc.bold("Probe")}\n`);
        for (const id of installed) await probe(id);
      } else {
        process.stdout.write(
          `\n  ${pc.dim("Run `placebo doctor --probe` to confirm isolation with one tiny real session per agent.")}\n`,
        );
      }
      process.stdout.write("\n");
    });
}
