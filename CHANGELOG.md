# Changelog

## 0.1.0 (unreleased)

First release.

- `placebo trial`: controlled trials of a skill, an instructions file, a model or an agent, with paired permutation statistics and four verdicts.
- `--baseline`: compare two versions of a skill (a folder, a GitHub URL or a git revision such as `HEAD~1`). Control gets the old version and treatment the new one. Firing is reported for both.
- `--resume`: continue a trial that stopped on a usage limit or a crash, keeping its finished runs. Placebo stops scheduling as soon as the agent reports a usage limit.
- `placebo mine`: turns commits that change code and tests together into validated tasks.
- Bundled `starter-js` pack with 12 tasks.
- Claude Code adapter (verified against Claude Code 2.1.25), Codex adapter (beta) and a deterministic fake agent.
- Isolation verifier that checks each arm's startup report, planted canary secrets and adverse event detection.
- Terminal, HTML, markdown and badge reports.
- MCP server and `/placebo` skill, installed with `placebo setup`.
