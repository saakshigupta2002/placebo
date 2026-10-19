#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { configureLog, log } from "../util/log.js";
import { VERSION } from "../version.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerReport } from "./commands/report.js";
import { registerSetup } from "./commands/setup.js";
import { registerTasks } from "./commands/tasks.js";
import { registerTrial } from "./commands/trial.js";

const program = new Command();
program
  .name("placebo")
  .description(
    "Clinical trials for AI agent skills. Find out if a skill, prompt, model or agent actually helps on your codebase.",
  )
  .version(VERSION)
  .option("-v, --verbose", "debug output")
  .hook("preAction", (cmd) => configureLog({ verbose: cmd.opts().verbose }));

registerTrial(program);
registerTasks(program);
registerReport(program);
registerDoctor(program);
registerSetup(program);
program
  .command("mcp")
  .description("Run the Placebo MCP server over stdio (used by `placebo setup`)")
  .action(async () => {
    const { startMcpServer } = await import("../mcp/server.js");
    await startMcpServer();
  });

program.addHelpText(
  "after",
  `
Examples:
  $ placebo trial ./skills/my-skill --pack starter-js     try a skill on the bundled tasks
  $ placebo mine && placebo trial ./skills/my-skill       trial it on your own git history
  $ placebo trial --vs-model opus --model sonnet          is the bigger model worth it here?
  $ placebo trial --instructions ./CLAUDE.new.md          does the new CLAUDE.md help?
  $ placebo doctor --probe                                check agents and isolation
`,
);

program.parseAsync(process.argv).catch((err: Error) => {
  log.error(err.message);
  if (process.env.PLACEBO_DEBUG) console.error(err.stack);
  process.exitCode = 1;
});

export { pc };
