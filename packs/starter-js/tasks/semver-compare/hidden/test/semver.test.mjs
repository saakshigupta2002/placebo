import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions } from "../src/semver.mjs";

test("numeric parts", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("0.9.0", "1.0.0"), -1);
  assert.equal(compareVersions("v2.0.0", "2.0.0"), 0);
});

test("pre-release precedence", () => {
  const order = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(compareVersions(order[i], order[i + 1]), -1, `${order[i]} < ${order[i + 1]}`);
    assert.equal(compareVersions(order[i + 1], order[i]), 1, `${order[i + 1]} > ${order[i]}`);
  }
});

test("build metadata is ignored", () => {
  assert.equal(compareVersions("1.0.0+build.5", "1.0.0+build.9"), 0);
});

test("invalid versions throw", () => {
  for (const bad of ["1.2", "1.2.x", "", "a.b.c", "1.2.3-"]) {
    assert.throws(() => compareVersions(bad, "1.0.0"), TypeError, JSON.stringify(bad));
  }
});
