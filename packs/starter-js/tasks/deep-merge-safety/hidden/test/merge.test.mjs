import assert from "node:assert/strict";
import { test } from "node:test";
import { deepMerge } from "../src/merge.mjs";

test("does not mutate inputs", () => {
  const a = { x: { y: 1 } };
  const b = { x: { z: 2 } };
  const out = deepMerge(a, b);
  assert.deepEqual(out, { x: { y: 1, z: 2 } });
  assert.deepEqual(a, { x: { y: 1 } });
  assert.deepEqual(b, { x: { z: 2 } });
  assert.notEqual(out.x, a.x);
});

test("arrays replace", () => {
  assert.deepEqual(deepMerge({ list: [1, 2, 3] }, { list: [9] }), { list: [9] });
});

test("later sources win and null replaces", () => {
  assert.deepEqual(deepMerge({ a: { b: 1 } }, { a: null }), { a: null });
  assert.deepEqual(deepMerge({ a: 1 }, { a: 2 }, { a: 3 }), { a: 3 });
});

test("dates are kept as values", () => {
  const out = deepMerge({}, { when: new Date(0) });
  assert.ok(out.when instanceof Date);
});

test("blocks prototype pollution", () => {
  deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}}'));
  deepMerge({}, JSON.parse('{"constructor": {"prototype": {"polluted2": true}}}'));
  assert.equal({}.polluted, undefined);
  assert.equal({}.polluted2, undefined);
});
