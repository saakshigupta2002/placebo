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
  // Each arm must load exactly its own intervention skills on top of the same built-ins.
  const isIntervention = (s: string) => s.startsWith(`${INTERVENTION_PLUGIN}:`);
  const loaded = (snap: InitSnapshot) => snap.skills.filter(isIntervention).map(strip).sort();
  const builtins = (snap: InitSnapshot) => snap.skills.filter((s) => !isIntervention(s)).sort();
  const expectedControl = arms.control.skills.map((s) => s.name).sort();
  const expected = arms.treatment.skills.map((s) => s.name).sort();
  const gotControl = loaded(control);
  const got = loaded(treatment);
  const missing = expected.filter((e) => !got.includes(e));
  const unexpected = got.filter((e) => !expected.includes(e));
  if (missing.length) {
    verified = false;
    notes.push(`Treatment arm did not load the skill under test: ${missing.join(", ")}.`);
  }
  if (unexpected.length) {
    verified = false;
    notes.push(`Treatment arm loaded extra skills: ${unexpected.join(", ")}.`);
  }
  if (gotControl.join("|") !== expectedControl.join("|")) {
    verified = false;
    notes.push(
      expectedControl.length
        ? `Control arm should have loaded only the baseline (${expectedControl.join(", ")}) but loaded ${gotControl.join(", ") || "nothing"}.`
        : "Control arm loaded the intervention.",
    );
  }
  if (arms.control.agent === arms.treatment.agent) {
    const extraBuiltins = builtins(treatment).filter((s) => !builtins(control).includes(s));
    if (extraBuiltins.length) {
      verified = false;
      notes.push(`Treatment arm loaded extra skills: ${extraBuiltins.map(strip).join(", ")}.`);
    }
  }
  if (verified) {
    const base = builtins(control);
    notes.push(
      `Control arm saw ${base.length ? `only built-in skills (${base.join(", ")})` : "no skills"}${expectedControl.length ? ` plus the baseline version of ${expectedControl.join(", ")}` : ""}, no plugins and no MCP servers.`,
    );
    if (expected.length) {
      notes.push(
        expectedControl.length
          ? `Treatment arm saw the same built-ins plus the new version of ${expected.join(", ")}.`
          : `Treatment arm saw the same plus ${expected.join(", ")}.`,
      );
    }
    if (userSkills.length)
      notes.push(`None of your ${userSkills.length} personal skills leaked into either arm.`);
  }
  return { mode, verified, control, treatment, notes };
}
