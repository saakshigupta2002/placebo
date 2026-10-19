# How Placebo measures

A trial answers one question: **does this change make the agent better or worse at real work on this codebase? By how much?** Everything below exists to make that answer trustworthy.

## The design

| Clinical trial | Placebo |
|---|---|
| Patients | Tasks: real past changes from your repository, or a bundled pack |
| Treatment arm | The agent with the intervention (a skill, an instructions file, a model or a different agent) |
| Control arm | The same agent without it |
| Outcome | Hidden tests pass or fail, plus tokens, cost, time and lines changed |
| Adverse events | Leaked secrets, tampered tests, writes outside the workspace, risky commands |
| Pairing | Every task runs in both arms, so each task is its own control |

Each task runs `repeats` times per arm (default 2). The order of the two arms is decided by a seeded coin flip per task and repeat, so neither arm always gets a warm cache or the quieter minute.

## Sealed workspaces

Every run gets a fresh directory built with `git archive` from the task's starting commit, then committed once so agents that expect git still work. **There is no history in it.** An agent cannot run `git log` and find the future fix, which is a known way agents cheat on repository benchmarks.

The tests that grade the task are withheld. After the agent stops, Placebo writes the hidden test files over whatever the agent left (so editing or deleting them gains nothing), then runs the task's check command. Exit code 0 means pass.

Heavy dependency folders such as `node_modules` and `.venv` are symlinked from your repository instead of reinstalled, so tasks start in seconds.

## Isolation and how it is checked

The two arms must differ only in the intervention. Your own setup must not leak into either arm.

**flags mode** (default) keeps your login but starts the agent with project and local settings only, strict MCP config, no session persistence and web tools off. For Claude Code that is `--setting-sources project,local --strict-mcp-config --no-session-persistence --disallowedTools WebFetch,WebSearch`. The skill under test is loaded for the treatment session only, through a temporary plugin directory, so nothing is ever installed into your config.

**home mode** goes further: each run gets a brand new `HOME`. It needs a token the agent can use without your keychain (`claude setup-token`, then `CLAUDE_CODE_OAUTH_TOKEN`).

Either way, Placebo does not take isolation on trust. Claude Code reports every skill, plugin and MCP server it loaded in its first stream event. Placebo compares the first control run with the first treatment run:

- control must show none of your personal skills (it reads `~/.claude/skills` and friends to know their names), no plugins and no MCP servers;
- treatment must show exactly what control showed, plus the intervention.

If either check fails, the trial stops, the verdict is INCONCLUSIVE and the CLI exits with code 2.

## Statistics

Placebo estimates the effect **per task first**, then combines tasks. Repeats sharpen each task's estimate but never count as extra independent evidence, which is the usual way small evaluations overstate their confidence.

- **Tests passed:** for each task, treatment pass rate minus control pass rate. The effect is the mean difference in percentage points.
- **Tokens, cost, time, lines changed:** for each task, the log of treatment over control. The effect is the geometric mean ratio, shown as a percentage change.

**p-values** come from an exact paired sign-flip permutation test. If the intervention did nothing, each task's difference is equally likely to be positive or negative, so Placebo enumerates every sign pattern (exactly up to 16 tasks, Monte Carlo beyond that) and asks how often the total is at least as extreme as observed. It makes no normality assumption.

**95% intervals** are found by inverting that same test: the interval holds every effect size the test would not reject. That means an interval excludes zero exactly when p is below 0.05. The interval and the p-value can never disagree.

A Wilcoxon signed-rank test on the same differences is stored in `trial.json` as a cross-check.

## Verdicts

| Verdict | Rule |
|---|---|
| **HARMFUL** | More treatment runs than control runs had a critical adverse event; or tests passed dropped significantly; or cost rose significantly with no gain in tests passed |
| **PLACEBO** | The skill never activated; or both the tests-passed interval sits inside ±10 points and the cost interval inside ±10% |
| **WORKS** | Tests passed rose significantly; or cost fell significantly with no significant drop in tests passed |
| **INCONCLUSIVE** | Anything else, including fewer than 6 tasks (the smallest possible p-value with 5 tasks is 0.06). Placebo estimates how many tasks would settle it. |

Significance means p below 0.05 with the interval excluding zero. Cost falls back to tokens when the agent does not report cost.

## Stopping early

`--until-confident` checks the statistics after every finished task, once at least `--min-tasks` (default 6) are done. It stops when tests passed, cost or tokens is settled, or when a skill has not fired in any treatment run. Stopping rules inflate false positives a little when used aggressively. Use it to save money on clear-cut cases. When the result matters, run a fixed design.

## What a trial cannot tell you

- A trial measures **your tasks with your agent and model**. A skill can help on one codebase and do nothing on another. That is the point of running it on yours.
- Mined tasks come from commits that changed code and tests together. They skew toward well-specified, testable work.
- Commit messages are terse. Tasks mined from them are harder than a well-written issue, equally for both arms.
- Placebo is not a sandbox. See [SECURITY.md](../SECURITY.md).
