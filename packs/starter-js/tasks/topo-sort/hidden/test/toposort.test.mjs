import assert from "node:assert/strict";
import { test } from "node:test";
import { topoSort } from "../src/toposort.mjs";

test("dependencies come first", () => {
  assert.deepEqual(topoSort({ app: ["lib", "util"], lib: ["util"], util: [] }), [
    "util",
    "lib",
    "app",
  ]);
});

test("includes nodes only seen as dependencies", () => {
  assert.deepEqual(topoSort({ a: ["b"] }), ["b", "a"]);
});

test("alphabetical tie-break", () => {
  assert.deepEqual(topoSort({ c: [], b: [], a: [], d: ["c", "a"] }), ["a", "b", "c", "d"]);
});

test("detects cycles", () => {
  assert.throws(
    () => topoSort({ a: ["b"], b: ["a"] }),
    (err) => /^cycle: /.test(err.message) && /a -> b -> a|b -> a -> b/.test(err.message),
  );
});

test("self loop", () => {
  assert.throws(() => topoSort({ x: ["x"] }), /cycle: x -> x/);
});

test("empty graph", () => {
  assert.deepEqual(topoSort({}), []);
});
