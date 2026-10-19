# Security Policy

Placebo runs coding agents with permissions bypassed inside temporary workspaces, so security matters here more than in most CLIs.

## What Placebo does to limit risk

- Each run works in a fresh temporary copy of the repository with no git history. The copy is deleted afterwards unless you pass `--keep`.
- Agents start with your personal skills, plugins and MCP servers switched off. Their startup report is checked before any result is trusted.
- Fake secrets are planted in every workspace so leaks show up as adverse events.
- Web tools are disabled by default.

## What it does not do

Placebo is not a sandbox. In the default `flags` isolation mode the agent runs as your user and could, in principle, read or change files outside the workspace. Trial only skills you would be willing to run in your own terminal, or run Placebo inside a container or a disposable VM. `home` isolation (a fresh HOME per run) narrows this further but is still not a security boundary.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting instead (the **Security** tab, then **Report a vulnerability**) and include steps to reproduce. You will get a reply within a few days. A fix or mitigation follows as soon as one is ready. Credit is given in the changelog unless you prefer otherwise.
