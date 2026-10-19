import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listTrialDirs, resolveTrial } from "../cli/shared.js";
import type { TrialRecord } from "../core/types.js";
import { renderMarkdown } from "../report/markdown.js";
import { mineTasks } from "../tasks/mine-git.js";
import { listPacks } from "../tasks/packs.js";
import { ensureDir, readJson } from "../util/fs.js";
import { trialId } from "../util/ids.js";
import { VERSION } from "../version.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "placebo", version: VERSION });
  const cli = process.argv[1]!;

  server.registerTool(
    "placebo_trial_start",
    {
      title: "Start a Placebo trial",
      description:
        "Start a controlled trial in the background: the same coding tasks run with and without a skill (or instructions file, model or agent), graded by hidden tests. Returns a trial id. Trials take minutes and spend real tokens; poll placebo_trial_status. Give exactly one of skill, instructions, vs_model or vs_agent.",
      inputSchema: {
        skill: z
          .string()
          .optional()
          .describe("Skill to test: folder with SKILL.md, SKILL.md path or GitHub URL"),
        instructions: z
          .string()
          .optional()
          .describe("Instructions file to test (written as CLAUDE.md / AGENTS.md in treatment)"),
        vs_model: z.string().optional().describe("Compare this model against `model`"),
        vs_agent: z.string().optional().describe("Compare this agent against `agent`"),
        agent: z.string().optional().describe("Agent to run: claude-code (default), codex or fake"),
        model: z.string().optional().describe("Model for both arms"),
        pack: z.string().optional().describe("Bundled task pack, e.g. starter-js"),
        tasks: z.string().optional().describe("Folder of task YAML files (default .placebo/tasks)"),
        limit: z.number().int().positive().optional().describe("Max tasks (default 10)"),
        repeats: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Runs per task per arm (default 2)"),
        budget: z
          .number()
          .positive()
          .optional()
          .describe("Stop starting runs after this many dollars"),
        until_confident: z.boolean().optional().describe("Stop early once the result is settled"),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (default: server working directory)"),
      },
    },
    async (a) => {
      const cwd = resolve(a.cwd ?? process.cwd());
      const id = trialId();
      const args = [cli, "trial"];
      if (a.skill) args.push(a.skill);
      const flag = (name: string, v: unknown) => {
        if (v !== undefined && v !== false)
          args.push(`--${name}`, ...(v === true ? [] : [String(v)]));
      };
      flag("instructions", a.instructions);
      flag("vs-model", a.vs_model);
      flag("vs-agent", a.vs_agent);
      flag("agent", a.agent);
      flag("model", a.model);
      flag("pack", a.pack);
      flag("tasks", a.tasks);
      flag("limit", a.limit);
      flag("repeats", a.repeats);
      flag("budget", a.budget);
      flag("until-confident", a.until_confident);
      args.push("--id", id, "--quiet");
      const logFile = join(ensureDir(join(cwd, ".placebo", "logs")), `${id}.log`);
      const fd = openSync(logFile, "a");
      const child = spawn(process.execPath, args, {
        cwd,
        detached: true,
        stdio: ["ignore", fd, fd],
      });
      child.unref();
      closeSync(fd);
      return text(
        `Started trial ${id} in ${cwd}. It runs in the background; check progress with placebo_trial_status (trial_id "${id}"). Log: ${logFile}`,
      );
    },
  );

  server.registerTool(
    "placebo_trial_status",
    {
      title: "Trial status",
      description:
        "Progress of a trial, or its verdict and report once finished. Defaults to the latest trial.",
      inputSchema: { trial_id: z.string().optional(), cwd: z.string().optional() },
    },
    async (a) => {
      const cwd = resolve(a.cwd ?? process.cwd());
      try {
        const { trial } = resolveTrial(cwd, a.trial_id);
        if (trial.results) return text(renderMarkdown(trial));
        const expected = trial.design.tasks * 2 * trial.design.repeats;
        const spent = trial.runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
        return text(
          `Trial ${trial.id} is running: ${trial.runs.length}/${expected} runs done, $${spent.toFixed(2)} spent so far.`,
        );
      } catch (err) {
        return text(
          `No trial found yet (${(err as Error).message}). If you just started one, it may still be preparing; check the log in .placebo/logs.`,
        );
      }
    },
  );

  server.registerTool(
    "placebo_trials_list",
    {
      title: "List trials",
      description: "List trials in a project with their verdicts.",
      inputSchema: { cwd: z.string().optional() },
    },
    async (a) => {
      const cwd = resolve(a.cwd ?? process.cwd());
      const rows = listTrialDirs(cwd).map((d) => {
        const t = readJson<TrialRecord>(join(d, "trial.json"));
        return `${t.id}  ${t.createdAt.slice(0, 16)}  ${t.results?.verdict.label ?? "RUNNING"}  ${t.intervention.kind} ${t.intervention.label}`;
      });
      return text(rows.length ? rows.join("\n") : "No trials yet.");
    },
  );

  server.registerTool(
    "placebo_tasks_mine",
    {
      title: "Mine tasks from git history",
      description:
        "Find commits that change code and tests together, check that the tests fail before and pass after, then write them to .placebo/tasks as trial tasks.",
      inputSchema: {
        repo: z.string().optional(),
        max: z.number().int().positive().optional(),
        scan: z.number().int().positive().optional(),
        test_cmd: z.string().optional().describe("Test command with {files} placeholder"),
        validate: z.boolean().optional(),
        cwd: z.string().optional(),
      },
    },
    async (a) => {
      const cwd = resolve(a.cwd ?? process.cwd());
      const r = await mineTasks({
        repo: resolve(cwd, a.repo ?? "."),
        outDir: join(cwd, ".placebo", "tasks"),
        maxTasks: a.max ?? 20,
        scan: a.scan ?? 300,
        testCmd: a.test_cmd,
        validate: a.validate ?? true,
        maxSourceFiles: 8,
        maxSourceLines: 400,
        maxTestFiles: 10,
      });
      const lines = [
        `Scanned ${r.scanned} commits. Wrote ${r.written.length} tasks to .placebo/tasks.`,
      ];
      for (const t of r.written) lines.push(`  + ${t.id}`);
      for (const x of r.rejected.slice(0, 10))
        lines.push(`  - ${x.sha.slice(0, 7)} ${x.subject.slice(0, 60)}: ${x.reason}`);
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "placebo_packs_list",
    {
      title: "List task packs",
      description: "Bundled task packs that work without your own repository.",
      inputSchema: {},
    },
    async () =>
      text(
        listPacks()
          .map((p) => `${p.name} (${p.taskCount} tasks, ${p.language}): ${p.description}`)
          .join("\n"),
      ),
  );

  await server.connect(new StdioServerTransport());
}
