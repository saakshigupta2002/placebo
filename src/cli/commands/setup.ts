import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { getAdapter } from "../../adapters/registry.js";
import { packageAsset } from "../../util/assets.js";
import { run } from "../../util/proc.js";

function mcpCommand(): string[] {
  const script = process.argv[1] ?? "";
  if (script.includes("_npx") || script.includes(`${join("node_modules", "placebo-cli")}`))
    return ["npx", "-y", "placebo-cli@latest", "mcp"];
  return [process.execPath, script, "mcp"];
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Install the /placebo skill and MCP server into your agents")
    .option("--agent <agent>", "claude-code, codex or all", "all")
    .option("--no-skill", "do not install the skill")
    .option("--no-mcp", "do not register the MCP server")
    .option("--dry-run", "show what would change without changing anything")
    .action(async (o) => {
      const dry = Boolean(o.dryRun);
      const act = (msg: string) =>
        process.stdout.write(`  ${dry ? pc.dim("would") : pc.green("✓")} ${msg}\n`);
      const skillSrc = dirname(packageAsset(join("skills", "placebo", "SKILL.md")));
      const cmd = mcpCommand();
      const targets = o.agent === "all" ? ["claude-code", "codex"] : [getAdapter(o.agent).id];
      process.stdout.write(`\n${pc.bold("Placebo setup")}${dry ? pc.dim(" (dry run)") : ""}\n\n`);
      for (const id of targets) {
        const a = getAdapter(id);
        const d = await a.detect();
        if (!d.installed) {
          process.stdout.write(`  ${pc.dim("skip")} ${a.displayName} (not installed)\n`);
          continue;
        }
        if (id === "claude-code") {
          if (o.skill) {
            const dest = join(homedir(), ".claude", "skills", "placebo");
            if (!dry) {
              mkdirSync(dirname(dest), { recursive: true });
              cpSync(skillSrc, dest, { recursive: true });
            }
            act(`installed skill to ${dest}`);
          }
          if (o.mcp) {
            const exists =
              (
                await run("claude", ["mcp", "get", "placebo"], { timeoutMs: 20_000 }).catch(
                  () => undefined,
                )
              )?.code === 0;
            if (exists)
              process.stdout.write(
                `  ${pc.dim("skip")} Claude Code MCP server "placebo" already registered\n`,
              );
            else {
              if (!dry) {
                const r = await run(
                  "claude",
                  ["mcp", "add", "--scope", "user", "placebo", "--", ...cmd],
                  { timeoutMs: 30_000 },
                );
                if (r.code !== 0) throw new Error(`claude mcp add failed: ${r.stderr.trim()}`);
              }
              act(`registered MCP server with Claude Code: ${cmd.join(" ")}`);
            }
          }
        }
        if (id === "codex") {
          if (o.skill) {
            const dest = join(homedir(), ".codex", "skills", "placebo");
            if (!dry) {
              mkdirSync(dirname(dest), { recursive: true });
              cpSync(skillSrc, dest, { recursive: true });
            }
            act(`installed skill to ${dest}`);
          }
          if (o.mcp) {
            const config = join(homedir(), ".codex", "config.toml");
            const current = existsSync(config) ? readFileSync(config, "utf8") : "";
            if (current.includes("[mcp_servers.placebo]"))
              process.stdout.write(`  ${pc.dim("skip")} Codex MCP server already in ${config}\n`);
            else {
              const block = `\n[mcp_servers.placebo]\ncommand = ${JSON.stringify(cmd[0])}\nargs = ${JSON.stringify(cmd.slice(1))}\n`;
              if (!dry) {
                mkdirSync(dirname(config), { recursive: true });
                appendFileSync(config, block);
              }
              act(`added MCP server to ${config}`);
            }
          }
        }
      }
      process.stdout.write(
        `\n  Restart your agent, then ask it: ${pc.cyan('"trial this skill before I install it"')}\n\n`,
      );
    });
}
