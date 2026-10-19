import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { fakeAgent } from "./fake.js";
import type { AgentAdapter } from "./types.js";

const ADAPTERS: AgentAdapter[] = [claudeCode, codex, fakeAgent];
const ALIASES: Record<string, string> = {
  claude: "claude-code",
  cc: "claude-code",
  "codex-cli": "codex",
};

export function getAdapter(id: string): AgentAdapter {
  const key = ALIASES[id] ?? id;
  const a = ADAPTERS.find((x) => x.id === key);
  if (!a)
    throw new Error(`Unknown agent "${id}". Available: ${ADAPTERS.map((x) => x.id).join(", ")}`);
  return a;
}

export function listAdapters(): AgentAdapter[] {
  return ADAPTERS;
}
