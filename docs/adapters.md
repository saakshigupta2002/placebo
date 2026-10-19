# Writing an agent adapter

An adapter teaches Placebo to run one coding agent headless and read what it did. The interface is in [`src/adapters/types.ts`](../src/adapters/types.ts).

```ts
export interface AgentAdapter {
  id: string;                 // "gemini-cli"
  displayName: string;        // "Gemini CLI"
  instructionsFile: string;   // the file it reads from the repo root, e.g. "GEMINI.md"
  detect(): Promise<AdapterDetection>;
  run(input: RunInput): Promise<RunOutput>;
}
```

## What `run` has to do

1. **Start the agent headless** in `input.workspace` with `input.prompt`. Send the prompt on stdin when the CLI allows it, which also closes stdin so the agent never waits for input.
2. **Isolate it.** Switch off the user's own skills, plugins, MCP servers and memory. If the CLI has a config directory variable (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`), point it at a fresh folder under `input.runDir` and copy in only what authentication needs. Honour `input.isolation === "home"` by setting `HOME` to `input.home`.
3. **Load the treatment skills** in `input.arm.skills` for this run only. Never write into the user's real config.
4. **Disable web tools** unless `input.allowWeb` is true.
5. **Save the raw transcript** to `input.runDir/transcript.jsonl`.
6. **Parse it** into the `RunOutput` fields:
   - `usage`: input, output, cache-read and cache-write tokens;
   - `costUsd`: only if the agent reports it (otherwise leave `null` and Placebo estimates from `src/grading/pricing.ts`);
   - `toolCalls`: every tool call, normalised to `shell`, `read`, `write`, `edit`, `web`, `skill`, `search` or `other`, with `command`, `path` or `url` filled in;
   - `init`: the skills, plugins and MCP servers the agent loaded, ideally from the agent's own startup report;
   - `activated`: whether any treatment skill fired, or `null` if the agent cannot tell you.
7. Return `error` only for agent-level failures (crash, auth). A wrong answer is not an error; the check command decides that.

## Testing

- Write the parser as an exported pure function and test it against a **real, sanitised transcript** in `test/fixtures/transcripts/` (replace usernames, paths and personal skill names).
- Add the adapter to `src/adapters/registry.ts`.
- Mark `status: "beta"` in `detect()` until someone has checked it against the real CLI. Say which version you checked in the PR.

The Claude Code adapter ([`claude-code.ts`](../src/adapters/claude-code.ts)) is the reference: it uses `--setting-sources`, a temporary `--plugin-dir` for the skill and the `system/init` event for verification.
