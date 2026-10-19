import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDuration } from "../src/duration.mjs";

test("single units", () => {
  assert.equal(parseDuration("250ms"), 250);
  assert.equal(parseDuration("90s"), 90_000);
  assert.equal(parseDuration("5m"), 300_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1d"), 86_400_000);
});

test("combined units", () => {
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("2d 4h"), 2 * 86_400_000 + 4 * 3_600_000);
  assert.equal(parseDuration("1m 30s 500ms"), 90_500);
});

test("decimals", () => {
  assert.equal(parseDuration("1.5h"), 5_400_000);
  assert.equal(parseDuration("0.5s"), 500);
});

test("rejects bad input", () => {
  for (const bad of ["", "10", "abc", "5x", "h1", "1h 2"]) {
    assert.throws(() => parseDuration(bad), TypeError, JSON.stringify(bad));
  }
});
