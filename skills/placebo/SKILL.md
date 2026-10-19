---
name: placebo
description: Run a controlled trial to find out whether an agent skill, an instructions file (CLAUDE.md / AGENTS.md), a model or a different coding agent actually helps on this codebase. Use when the user asks whether a skill works, wants to test or verify a skill before installing it, compares two models or agents, asks if a prompt change helped, or wants evidence instead of claims ("is this skill worth it", "does this CLAUDE.md help", "is opus worth the cost here").
---

# Placebo: controlled trials for agent skills

Placebo runs the same real coding tasks twice, once with the thing under test and once without, in sealed copies of the repository. Hidden tests grade both runs and paired statistics give a verdict: WORKS, PLACEBO, HARMFUL or INCONCLUSIVE.

## Before you start

1. Check the tools are ready: `placebo doctor`. Fix anything marked ✗ before running a trial.
2. Trials start real agent sessions and spend real tokens. Tell the user roughly what it will cost before starting: about 2 × tasks × repeats sessions. Default to `--budget 5` unless they say otherwise. Suggest a cheaper model (`--model haiku` or `--model sonnet`) for a first screen.
3. Never report a result before the trial has finished. Never estimate what a trial "would probably show".

## Pick the tasks

- If the repository has tests and a history of small fixes: `placebo mine` writes validated tasks to `.placebo/tasks`. Each task is a past commit whose tests fail before the change and pass after it.
- If mining finds nothing, or the user just wants a quick check, use the bundled pack: `--pack starter-js`.
- Hand-written tasks are YAML files with a `prompt` and a `check` command. See the task format in the Placebo docs.

## Run the trial

| User wants to know | Command |
|---|---|
| Does this skill help? | `placebo trial <skill-folder-or-github-url>` |
| Did my edit to this skill make it better or worse? | `placebo trial <skill> --baseline <old-folder-or-git-revision>` (for example `--baseline HEAD~1`) |
| Does this CLAUDE.md / AGENTS.md help? | `placebo trial --instructions <file>` |
| Is model B worth it over model A? | `placebo trial --model <a> --vs-model <b>` |
| Is agent B better than agent A here? | `placebo trial --agent claude-code --vs-agent codex` |

Useful flags: `--limit 10` tasks, `--repeats 2`, `--until-confident` to stop once settled, `--budget <usd>`, `--open` to open the report.

If you have the Placebo MCP tools, use `placebo_trial_start` and poll `placebo_trial_status` instead of running the CLI in the foreground.

## Read the verdict honestly

- **WORKS**: a statistically clear improvement in tests passed, or a clear cost cut with no measurable loss in tests passed. Quote the effect with its interval, for example "cost -12% (95% CI -18% to -6%)".
- **PLACEBO**: no measurable effect, or the skill never activated. Say so plainly. A skill that never fired did nothing, whatever its README claims.
- **HARMFUL**: fewer tasks passed, cost rose with no gain, or the agent did something dangerous (leaked a planted secret, tampered with tests, changed files outside the workspace). Show the adverse events.
- **INCONCLUSIVE**: not enough evidence. Report the "about N tasks would settle it" estimate and offer to run more tasks. Do not round an inconclusive result up to "it seems to help".

Always mention the skill activation rate, the number of tasks and the isolation status. If isolation was not verified, the result cannot be trusted; say that first.

The full report is at `.placebo/trials/<id>/report.html`. The numbers are in `trial.json` and `REPORT.md` is ready to paste into a PR or README. `placebo badge` prints a README badge.
