import { join, relative } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { mineTasks } from "../../tasks/mine-git.js";
import { listPacks, materializePack } from "../../tasks/packs.js";
import { validateTask } from "../../tasks/validate.js";
import { log } from "../../util/log.js";
import { parseNumber, placeboDir, resolveTaskSource } from "../shared.js";

export function registerTasks(program: Command): void {
  program
    .command("mine")
    .description("Turn commits from your git history into validated tasks")
    .option("--repo <path>", "repository to mine", ".")
    .option("-o, --out <dir>", "where to write task files", ".placebo/tasks")
    .option("--max <n>", "stop after this many tasks", "20")
    .option("--scan <n>", "how many recent commits to look at", "300")
    .option("--since <date>", "only commits after this date, e.g. 2026-01-01")
    .option("--test-cmd <cmd>", "test command; {files} becomes the hidden test files")
    .option("--max-files <n>", "skip commits that touch more source files than this", "8")
    .option("--max-lines <n>", "skip commits that change more source lines than this", "400")
    .option("--no-validate", "skip running the tests before and after each change")
    .action(async (o) => {
      const cwd = process.cwd();
      log.info(
        `${pc.bold("Mining")} ${relative(cwd, o.repo) || "."} for commits that change code and tests together`,
      );
      const result = await mineTasks({
        repo: o.repo,
        outDir: o.out,
        maxTasks: parseNumber("max", o.max, { integer: true, min: 1 })!,
        scan: parseNumber("scan", o.scan, { integer: true, min: 1 })!,
        since: o.since,
        testCmd: o.testCmd,
        validate: o.validate,
        maxSourceFiles: parseNumber("max-files", o.maxFiles, { integer: true, min: 1 })!,
        maxSourceLines: parseNumber("max-lines", o.maxLines, { integer: true, min: 1 })!,
        maxTestFiles: 10,
        onProgress: (msg, kind) => {
          if (kind === "accept") log.ok(msg);
          else if (kind === "reject") log.info(pc.dim(`  skip ${msg}`));
          else log.info(pc.dim(`  ${msg}`));
        },
      });
      log.info("");
      log.info(
        `Scanned ${result.scanned} commits: ${pc.bold(String(result.written.length))} tasks written to ${o.out}, ${result.rejected.length} rejected.`,
      );
      if (!result.written.length) {
        log.warn(
          "No usable tasks. Commits need to change source and test files together, with tests that fail before and pass after.",
        );
        log.info(
          'Try --scan 1000, --test-cmd "<your test command> {files}", or the bundled pack: placebo trial <skill> --pack starter-js',
        );
        process.exitCode = 1;
      } else {
        log.info(`Next: ${pc.cyan("placebo trial <skill>")}`);
      }
    });

  const tasks = program.command("tasks").description("List or validate tasks");
  tasks
    .command("list")
    .description("List tasks")
    .option("-t, --tasks <dir>", "folder of task files", ".placebo/tasks")
    .option("-p, --pack <name>", "list a bundled pack's tasks")
    .action(async (o) => {
      const { tasks: list, label } = await resolveTaskSource(process.cwd(), {
        pack: o.pack,
        tasks: o.tasks,
      });
      log.info(`${list.length} tasks in ${label}`);
      for (const t of list)
        process.stdout.write(`${t.id.padEnd(44)} ${pc.dim(t.source.padEnd(6))} ${t.title}\n`);
    });
  tasks
    .command("validate")
    .description("Check each task: hidden tests fail before the change and pass with it")
    .option("-t, --tasks <dir>", "folder of task files", ".placebo/tasks")
    .option("-p, --pack <name>", "validate a bundled pack")
    .action(async (o) => {
      const { tasks: list } = await resolveTaskSource(process.cwd(), {
        pack: o.pack,
        tasks: o.tasks,
      });
      let bad = 0;
      for (const t of list) {
        const v = await validateTask(t);
        if (v.ok) log.ok(t.id);
        else {
          bad++;
          log.error(`${t.id}: ${v.reason}`);
          const out = (v.solutionOutput ?? v.baseOutput ?? "").split("\n").slice(-12).join("\n");
          if (out) log.info(pc.dim(out));
        }
      }
      log.info(`${list.length - bad}/${list.length} tasks valid`);
      if (bad) process.exitCode = 1;
    });

  const pack = program
    .command("pack")
    .description("Bundled task packs for trying skills without your own repo");
  pack
    .command("list")
    .description("List bundled packs")
    .action(() => {
      for (const p of listPacks())
        process.stdout.write(
          `${pc.bold(p.name.padEnd(14))} ${String(p.taskCount).padStart(3)} tasks  ${p.description}\n`,
        );
    });
  pack
    .command("init")
    .description("Copy a pack into .placebo/packs so you can inspect or edit it")
    .argument("<name>", "pack name")
    .action(async (name: string) => {
      const r = await materializePack(name, join(placeboDir(process.cwd()), "packs"));
      log.ok(
        `${r.tasks} tasks in ${relative(process.cwd(), r.tasksDir)} (repo at ${relative(process.cwd(), r.repoDir)})`,
      );
    });
}
