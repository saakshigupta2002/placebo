import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPacks } from "../../src/tasks/packs.js";
import { VERSION } from "../../src/version.js";

describe("package", () => {
  it("version constant matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    );
    expect(VERSION).toBe(pkg.version);
  });

  it("ships the starter packs", () => {
    const names = listPacks().map((p) => p.name);
    expect(names).toContain("starter-js");
  });
});
