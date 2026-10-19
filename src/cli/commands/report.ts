import { copyFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { computeResults } from "../../core/results.js";
import type { TrialRecord } from "../../core/types.js";
import { badgeMessage } from "../../report/badge.js";
import { renderMarkdown } from "../../report/markdown.js";
import { renderTerminal } from "../../report/terminal.js";
import { writeReports } from "../../report/write.js";
import { readJson, writeJson } from "../../util/fs.js";
import { listTrialDirs, openPath, resolveTrial } from "../shared.js";

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Show a trial's results again (latest trial by default)")
    .argument("[trial]", "trial id or folder")
    .option("--format <fmt>", "terminal, md or json", "terminal")
    .option("--recompute", "recompute statistics from the stored runs")
    .option("--open", "open the HTML report")
    .action(async (ref: string | undefined, o) => {
      const cwd = process.cwd();
      const { dir, trial } = resolveTrial(cwd, ref);
      if (o.recompute) {
        trial.results = computeResults(trial);
        writeJson(join(dir, "trial.json"), trial);
      }
      writeReports(trial, dir);
      if (o.format === "md") process.stdout.write(renderMarkdown(trial));
      else if (o.format === "json") process.stdout.write(`${JSON.stringify(trial, null, 2)}\n`);
      else process.stdout.write(renderTerminal(trial, relative(cwd, join(dir, "report.html"))));
      if (o.open) await openPath(join(dir, "report.html"));
    });

  program
    .command("list")
    .description("List trials in this project")
    .action(() => {
      const dirs = listTrialDirs(process.cwd());
      if (!dirs.length) {
        process.stdout.write("No trials yet.\n");
        return;
      }
      for (const d of dirs) {
        const t = readJson<TrialRecord>(join(d, "trial.json"));
        const v = t.results?.verdict.label ?? "running";
        process.stdout.write(
          `${t.id}  ${t.createdAt.slice(0, 16).replace("T", " ")}  ${v.padEnd(12)} ${t.intervention.kind} ${pc.bold(t.intervention.label)}  ${pc.dim(t.results?.verdict.headline ?? "")}\n`,
        );
      }
    });

  program
    .command("badge")
    .description("Print README badge markdown for a trial")
    .argument("[trial]", "trial id or folder")
    .option(
      "--copy-to <dir>",
      "copy badge.svg and REPORT.md into this folder (e.g. your skill's repo)",
    )
    .action((ref: string | undefined, o) => {
      const cwd = process.cwd();
      const { dir, trial } = resolveTrial(cwd, ref);
      writeReports(trial, dir);
      const b = badgeMessage(trial);
      let svg = relative(cwd, join(dir, "badge.svg"));
      let md = relative(cwd, join(dir, "REPORT.md"));
      if (o.copyTo) {
        const dest = resolve(cwd, o.copyTo);
        copyFileSync(join(dir, "badge.svg"), join(dest, "placebo-badge.svg"));
        copyFileSync(join(dir, "REPORT.md"), join(dest, "PLACEBO-TRIAL.md"));
        copyFileSync(join(dir, "trial.json"), join(dest, "placebo-trial.json"));
        svg = relative(cwd, join(dest, "placebo-badge.svg"));
        md = relative(cwd, join(dest, "PLACEBO-TRIAL.md"));
      }
      process.stdout.write(
        `${pc.dim(`${b.label}: ${b.message}`)}\n\n[![${b.label}: ${b.message}](${svg})](${md})\n`,
      );
    });
}
