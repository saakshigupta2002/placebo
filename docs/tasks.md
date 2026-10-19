# Tasks

A task is one piece of work with an automatic pass or fail check. Placebo gets tasks three ways.

## 1. Mine them from your history

```bash
placebo mine                     # scans the last 300 commits, writes up to 20 tasks
placebo mine --scan 1000 --max 30
placebo mine --test-cmd "npx vitest run {files}"
```

A commit becomes a task when:

1. it has exactly one parent and changes both source files and test files;
2. it touches at most 8 source files, 400 source lines and 10 test files (bigger commits are rarely a single task);
3. its test files **fail** at the parent commit, with the source as it was;
4. its test files **pass** at the commit itself, twice in a row (flaky tests are dropped).

The prompt is the commit message (minus trailers such as `Signed-off-by`) plus the names of the hidden test files. The test command is detected from the repository at that commit: vitest, jest, mocha, ava, `node --test`, pytest, unittest, `go test`, `cargo test` and rspec are recognised. Pass `--test-cmd` to override; `{files}` becomes the hidden test paths.

If mining finds nothing, the usual reasons are printed for each skipped commit: the change was too large, the tests already passed before it, or the tests fail even with the real change (often because the test runner changed over the project's history).

## 2. Use a bundled pack

```bash
placebo pack list
placebo trial ./my-skill --pack starter-js
placebo pack init starter-js     # copy it into .placebo/packs to read or edit
```

`starter-js` is a small JavaScript utility library with 12 tasks: 7 features and 5 bug reports, each with hidden tests and a reference solution. It needs no installs and is graded with `node:test`. Packs are built with a fixed-date commit, so the starting commit hash is the same on every machine and public trial results are comparable.

## 3. Write them by hand

```yaml
# .placebo/tasks/rate-limit-header.yaml
id: rate-limit-header
title: Return Retry-After on 429
prompt: |
  Requests over the rate limit get a 429 with no Retry-After header,
  so clients retry immediately. Add the header with the seconds until
  the window resets.
repo: ../..                      # path to the git repo, relative to this file
base: 3f2a1c9                    # commit the agent starts from
hidden:
  from: 9b7e004                  # read hidden files from this commit...
  files: [test/rate-limit.test.ts]
check: npx vitest run {files}    # exit 0 means pass
setup: npm ci                    # optional, runs before the agent
link: [node_modules]             # optional, symlinked from the repo
timeout: 900                     # agent time limit, seconds
```

Instead of `hidden.from` you can use `hidden.dir`, a folder next to the task file holding the hidden files. A task with no hidden files simply runs `check` as is, which suits tasks graded by a script.

Check your tasks before a trial:

```bash
placebo tasks validate
```
