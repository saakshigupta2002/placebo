# Contributing to Placebo

Thanks for helping. Placebo is small on purpose: one engine, a few adapters, honest statistics. Contributions that keep it that way are the easiest to merge.

## Quick start

```bash
git clone https://github.com/saakshigupta2002/placebo.git
cd placebo
npm install
npm run check        # typecheck, lint, tests, prose check
npm run build
node dist/cli.js trial test/fixtures/skills/helpful --agent fake --pack starter-js
```

The last command runs a full trial with the deterministic fake agent. It costs nothing and needs no API key, so you can work on everything except the real adapters without spending a cent.

## Good first contributions

| Area | What it involves | Where |
|---|---|---|
| **A new agent adapter** | Run the agent headless, parse its transcript into tool calls, usage and a startup snapshot. About 150 lines plus a recorded fixture. Gemini CLI, OpenCode, Cursor CLI, Aider and Pi are open. | [`src/adapters/`](src/adapters), [docs/adapters.md](docs/adapters.md) |
| **A task pack** | A small repository with 8 to 15 tasks, each with hidden tests and a reference solution. Python, Go and Rust packs are wanted. | [`packs/`](packs), [docs/tasks.md](docs/tasks.md) |
| **Test runner detection** | Teach the miner more test commands (pytest plugins, Bun, Deno, Gradle). | [`src/tasks/mine-git.ts`](src/tasks/mine-git.ts) |
| **Adverse event rules** | New patterns for risky agent behaviour, each with a test case. | [`src/grading/adverse.ts`](src/grading/adverse.ts) |

## Ground rules

- **Every behaviour change comes with a test.** Statistics changes need a test against a known value or a brute-force check (see `test/unit/stats.test.ts`).
- **Adapters ship with a recorded transcript.** Put a sanitised real transcript in `test/fixtures/transcripts/` and test the parser against it. An adapter is marked `beta` until someone verifies it against the real CLI.
- **Never weaken isolation silently.** If an agent cannot be isolated fully, the adapter must say so in `detect()` notes and the verifier must report it.
- **Honest output.** Placebo never rounds an inconclusive result up. If you add a verdict path, add the case where it should not fire.
- **Writing style.** Docs and user-facing strings use plain words, no em dashes and no comma before "and". `npm run check:prose` enforces this.

## Pull requests

1. Open an issue first for anything larger than a bug fix, so we can agree on the shape.
2. Keep PRs focused. One adapter or one feature per PR.
3. Run `npm run check` before pushing. CI runs the same thing on Linux and macOS.
4. Describe what you tested. For adapter work, include the agent version you checked against.

## Project layout

```
src/
  core/        trial orchestrator, interventions, results
  adapters/    one file per agent, plus the fake agent
  isolation/   sealed workspaces, canaries, startup verification
  grading/     check runner, adverse events, pricing
  stats/       permutation tests, intervals, verdict rules
  tasks/       task schema, git miner, validation, packs
  report/      terminal, HTML, markdown, badge
  mcp/         MCP server
  cli/         commands
packs/         bundled task packs
skills/        the /placebo skill installed by `placebo setup`
test/          unit and end-to-end tests, fixtures
```

By contributing you agree that your contributions are licensed under the MIT License.
