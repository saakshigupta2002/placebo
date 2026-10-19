import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { getAdapter } from "../adapters/registry.js";
import { ensureDir } from "../util/fs.js";
import { hashDir, sha256, shortHash } from "../util/hash.js";
import { run } from "../util/proc.js";
import type { ArmSpec, Intervention, SkillRef } from "./types.js";

export class InterventionError extends Error {}

export function readSkillMeta(dir: string): { name: string; description?: string } {
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let data: Record<string, unknown> = {};
  if (fm) {
    try {
      data = (YAML.parse(fm[1]!) as Record<string, unknown>) ?? {};
    } catch {
      data = {};
    }
  }
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : basename(dir);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))
    throw new InterventionError(
      `Skill name "${name}" in ${dir}/SKILL.md is not a valid folder name.`,
    );
  return { name, description: typeof data.description === "string" ? data.description : undefined };
}

function findSkillDirs(root: string, depth = 3): string[] {
  if (existsSync(join(root, "SKILL.md"))) return [root];
  if (depth === 0) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = join(root, name);
    if (statSync(p).isDirectory()) out.push(...findSkillDirs(p, depth - 1));
  }
  return out;
}

const GH =
  /^(?:https?:\/\/github\.com\/|github:)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/;

/** Accept a local folder, a SKILL.md path, or a GitHub URL (optionally /tree/<ref>/<path>). */
export async function resolveSkill(
  source: string,
  cacheRoot = join(homedir(), ".cache", "placebo", "skills"),
): Promise<SkillRef & { contentHash: string }> {
  let root: string;
  const gh = source.match(GH);
  if (gh) {
    const [, owner, repo, ref, sub] = gh;
    const dest = join(ensureDir(cacheRoot), shortHash(`${owner}/${repo}@${ref ?? "HEAD"}`, 12));
    if (!existsSync(join(dest, ".git"))) {
      const args = [
        "clone",
        "--depth",
        "1",
        ...(ref ? ["--branch", ref] : []),
        `https://github.com/${owner}/${repo}.git`,
        dest,
      ];
      const r = await run("git", args, { timeoutMs: 180_000 });
      if (r.code !== 0)
        throw new InterventionError(`Could not clone ${source}: ${r.stderr.trim()}`);
    }
    root = sub ? join(dest, sub) : dest;
  } else {
    root = resolve(source);
    if (!existsSync(root)) throw new InterventionError(`Skill not found: ${source}`);
    if (statSync(root).isFile()) root = dirname(root);
  }
  const dirs = findSkillDirs(root);
  if (dirs.length === 0) throw new InterventionError(`No SKILL.md found in ${source}.`);
  if (dirs.length > 1) {
    const names = dirs.map((d) => `  ${d}`).join("\n");
    throw new InterventionError(
      `Found ${dirs.length} skills in ${source}. Point Placebo at one of them:\n${names}`,
    );
  }
  const dir = dirs[0]!;
  const { name } = readSkillMeta(dir);
  return { name, dir, contentHash: hashDir(dir, (rel) => rel.startsWith(".git")) };
}

export interface ArmOptions {
  agent: string;
  model?: string;
  skill?: string;
  instructions?: string;
  vsModel?: string;
  vsAgent?: string;
}

/** Turn CLI options into an intervention and two arms that differ only in that intervention. */
export async function buildArms(
  o: ArmOptions,
): Promise<{ intervention: Intervention; arms: { control: ArmSpec; treatment: ArmSpec } }> {
  const chosen = [o.skill, o.instructions, o.vsModel, o.vsAgent].filter(Boolean).length;
  if (chosen === 0)
    throw new InterventionError(
      "Nothing to trial. Pass a skill path or URL, --instructions <file>, --vs-model <model> or --vs-agent <agent>.",
    );
  if (chosen > 1)
    throw new InterventionError(
      "Trial one thing at a time: a skill, --instructions, --vs-model or --vs-agent.",
    );
  const agent = getAdapter(o.agent).id;
  const control: ArmSpec = { name: "control", agent, model: o.model, skills: [] };

  if (o.skill) {
    const s = await resolveSkill(o.skill);
    return {
      intervention: {
        kind: "skill",
        label: s.name,
        source: o.skill,
        contentHash: s.contentHash,
        skill: { name: s.name, dir: s.dir },
      },
      arms: {
        control,
        treatment: { ...control, name: "treatment", skills: [{ name: s.name, dir: s.dir }] },
      },
    };
  }
  if (o.instructions) {
    const file = resolve(o.instructions);
    if (!existsSync(file))
      throw new InterventionError(`Instructions file not found: ${o.instructions}`);
    const content = readFileSync(file, "utf8");
    const fileName = getAdapter(agent).instructionsFile;
    return {
      intervention: {
        kind: "instructions",
        label: basename(file),
        source: o.instructions,
        contentHash: sha256(content),
        instructions: { fileName, content },
      },
      arms: {
        control,
        treatment: { ...control, name: "treatment", instructions: { fileName, content } },
      },
    };
  }
  if (o.vsModel) {
    return {
      intervention: {
        kind: "model",
        label: `${o.vsModel} vs ${o.model ?? "default model"}`,
        source: o.vsModel,
      },
      arms: { control, treatment: { ...control, name: "treatment", model: o.vsModel } },
    };
  }
  const vs = getAdapter(o.vsAgent!).id;
  return {
    intervention: { kind: "agent", label: `${vs} vs ${agent}`, source: vs },
    arms: { control, treatment: { name: "treatment", agent: vs, model: undefined, skills: [] } },
  };
}
