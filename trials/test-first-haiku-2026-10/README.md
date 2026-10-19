# test-first on Claude Code with Haiku

**Verdict: Harmful.** A "read the tests first, then run them" skill made the agent cost 161% more per task (95% CI +79% to +277%, p = 0.004) and take 136% longer, with no measurable change in tests passed (+17 points, 95% CI 0 to +50, p = 0.50). The skill fired in 16 of 17 runs, so this is the skill doing its job and the job not paying off.

- **Skill tested:** [skill/SKILL.md](skill/SKILL.md) (content hash `c80c12e9`)
- **Tasks:** the bundled `starter-js` pack, 12 tasks sampled with seed 2026
- **Design:** 2 arms × 2 repeats per task, stopped early after 8 complete tasks once tokens and cost were settled
- **Agent:** Claude Code 2.1.25, model Haiku, flags isolation (verified: control saw only built-in skills)
- **Adverse events:** none. The agent wrote its own test files in 8 treatment runs, which Placebo records as information and replaces before grading
- **Cost of the whole trial:** $1.69 at API prices

Full numbers: [REPORT.md](REPORT.md) and [trial.json](trial.json). Per-run diffs and check logs are in [runs/](runs). Transcripts are left out to keep the repo small.

## Reproduce

```bash
npx placebo-cli trial trials/test-first-haiku-2026-10/skill --pack starter-js --limit 12 --model haiku \
  --until-confident --min-tasks 8 --budget 3.5 --seed 2026
```

Agents are not deterministic, so expect the numbers to move a little. The verdict should not.
