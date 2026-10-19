import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ArmSpec, InitSnapshot, IsolationReport } from "../core/types.js";

export const INTERVENTION_PLUGIN = "placebo-intervention";

/** Skill folders in the user's own config that must never be visible in a clean arm. */
export function userSkillNames(home = homedir()): string[] {
  const names = new Set<string>();
  for (const dir of [
    join(home, ".claude", "skills"),
    join(home, ".codex", "skills"),
    join(home, ".agents", "skills"),
  ]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) if (!name.startsWith(".")) names.add(name);
  }
  return [...names].sort();
}

function strip(name: string): string {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

/**
 * Compare what each arm's agent reported at startup.
 * Control must see none of the user's skills, plugins or MCP servers,
 * and treatment must see exactly control plus the intervention.
 */
export function verifyIsolation(
  mode: "flags" | "home",
  arms: { control: ArmSpec; treatment: ArmSpec },
  control: InitSnapshot | undefined,
  treatment: InitSnapshot | undefined,
  userSkills: string[] = userSkillNames(),
): IsolationReport {
  const notes: string[] = [];
  let verified = true;
  if (!control || !treatment) {
    return {
      mode,
      verified: false,
      control,
      treatment,
      notes: [
        "The agent did not report its startup configuration, so isolation could not be checked.",
      ],
    };
  }
  const leakedUser = control.skills.filter(
    (s) => userSkills.includes(strip(s)) && !s.startsWith(`${INTERVENTION_PLUGIN}:`),
  );
  if (leakedUser.length) {
    verified = false;
    notes.push(`Control arm can see your personal skills: ${leakedUser.join(", ")}.`);
  }
  const foreignPlugins = control.plugins.filter((p) => p !== INTERVENTION_PLUGIN);
  if (foreignPlugins.length) {
    verified = false;
    notes.push(`Control arm loaded plugins: ${foreignPlugins.join(", ")}.`);
  }
  if (control.mcpServers.length) {
    verified = false;
    notes.push(`Control arm connected to MCP servers: ${control.mcpServers.join(", ")}.`);
  }
  const expected = arms.treatment.skills.map((s) => s.name).sort();
  const extra = treatment.skills
    .filter((s) => !control.skills.includes(s))
    .map(strip)
    .sort();
  const missing = expected.filter((e) => !extra.includes(e));
  const unexpected = extra.filter((e) => !expected.includes(e));
  if (missing.length) {
    verified = false;
    notes.push(`Treatment arm did not load the skill under test: ${missing.join(", ")}.`);
  }
  if (unexpected.length) {
    verified = false;
    notes.push(`Treatment arm loaded extra skills: ${unexpected.join(", ")}.`);
  }
  if (
    arms.control.skills.length === 0 &&
    control.skills.some((s) => s.startsWith(`${INTERVENTION_PLUGIN}:`))
  ) {
    verified = false;
    notes.push("Control arm loaded the intervention.");
  }
  if (verified) {
    notes.push(
      `Control arm saw ${control.skills.length ? `only built-in skills (${control.skills.join(", ")})` : "no skills"}, no plugins and no MCP servers.`,
    );
    if (expected.length) notes.push(`Treatment arm saw the same plus ${expected.join(", ")}.`);
    if (userSkills.length)
      notes.push(`None of your ${userSkills.length} personal skills leaked into either arm.`);
  }
  return { mode, verified, control, treatment, notes };
}
