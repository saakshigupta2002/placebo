import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTasks } from "../../src/tasks/load.js";
import { buildPrompt, detectTestCommand, mineTasks } from "../../src/tasks/mine-git.js";
import { makeTempDir, removeDir } from "../../src/util/fs.js";
import { git } from "../../src/util/git.js";

let repo: string;
let out: string;

async function commit(files: Record<string, string>, message: string): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-q", "-m", message]);
}

const t = (body: string) =>
  `import assert from "node:assert/strict";\nimport { test } from "node:test";\n${body}\n`;

beforeAll(async () => {
  repo = makeTempDir("minerepo");
  out = makeTempDir("minetasks");
  await git(repo, ["init", "-q", "-b", "main"]);
  await commit(
    {
      "package.json": JSON.stringify({
        name: "m",
        type: "module",
        scripts: { test: "node --test" },
      }),
      "src/add.mjs": "export const add = (a, b) => a - b;\n",
      "test/smoke.test.mjs": t('test("ok", () => assert.ok(true));'),
    },
    "initial",
  );
  await commit(
    {
      "src/add.mjs": "export const add = (a, b) => a + b;\n",
      "test/add.test.mjs": t(
        'import { add } from "../src/add.mjs";\ntest("adds", () => assert.equal(add(2, 3), 5));',
      ),
    },
    "Fix add returning the difference\n\nadd(2, 3) returned -1.\n\nSigned-off-by: Someone <s@example.com>",
  );
  await commit({ "README.md": "# m\n" }, "docs: readme");
  await commit(
    {
      "src/mul.mjs": "export const mul = (a, b) => a * b;\n",
      "test/mul.test.mjs": t(
        'import { mul } from "../src/mul.mjs";\ntest("multiplies", () => assert.equal(mul(3, 4), 12));',
      ),
    },
    "Add mul",
  );
  await commit(
    {
      "src/add.mjs": "// adds two numbers\nexport const add = (a, b) => a + b;\n",
      "test/smoke2.test.mjs": t('test("still ok", () => assert.ok(true));'),
    },
    "Document add",
  );
});

afterAll(() => {
  removeDir(repo);
  removeDir(out);
});

describe("git miner", () => {
  it("keeps commits whose tests fail before and pass after, rejecting the rest", async () => {
    const r = await mineTasks({
      repo,
      outDir: out,
      maxTasks: 10,
      scan: 50,
      validate: true,
      maxSourceFiles: 8,
      maxSourceLines: 400,
      maxTestFiles: 10,
    });
    expect(r.written.map((x) => x.title).sort()).toEqual([
      "Add mul",
      "Fix add returning the difference",
    ]);
    expect(r.rejected.map((x) => x.reason)).toContain(
      "hidden tests already pass before the change",
    );
    const tasks = loadTasks(out);
    const fix = tasks.find((x) => x.title.startsWith("Fix add"))!;
    expect(fix.check).toBe("node --test {files}");
    expect(fix.hidden.files).toEqual(["test/add.test.mjs"]);
    expect(fix.prompt).toContain("add(2, 3) returned -1.");
    expect(fix.prompt).not.toContain("Signed-off-by");
    expect(fix.solution?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("detects test runners from package.json", async () => {
    expect(await detectTestCommand(repo, "HEAD", ["test/add.test.mjs"])).toBe(
      "node --test {files}",
    );
    expect(await detectTestCommand(repo, "HEAD", ["tests/test_x.py"])).toMatch(
      /-m unittest \{files\}$/,
    );
    expect(await detectTestCommand(repo, "HEAD", ["pkg/x_test.go"])).toBe("go test ./pkg");
  });

  it("writes prompts like issues", () => {
    expect(buildPrompt("Fix it", "", ["t/a.test.ts"])).toBe(
      "Fix it\n\nMake this change in the repository. Hidden tests will check your work; they live at `t/a.test.ts`. Do not change those test files. When you are done, stop.",
    );
  });
});
