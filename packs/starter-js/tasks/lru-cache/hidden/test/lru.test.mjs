import assert from "node:assert/strict";
import { test } from "node:test";
import { LRUCache } from "../src/lru.mjs";

test("basic get and set", () => {
  const c = new LRUCache(2);
  c.set("a", 1).set("b", 2);
  assert.equal(c.get("a"), 1);
  assert.equal(c.size, 2);
  assert.equal(c.get("zzz"), undefined);
});

test("evicts the least recently used entry", () => {
  const c = new LRUCache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.has("b"), false);
  assert.equal(c.has("a"), true);
  assert.equal(c.has("c"), true);
});

test("set refreshes recency and updates the value", () => {
  const c = new LRUCache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("a", 10);
  c.set("c", 3);
  assert.equal(c.get("a"), 10);
  assert.equal(c.has("b"), false);
});

test("has does not refresh recency", () => {
  const c = new LRUCache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.has("a");
  c.set("c", 3);
  assert.equal(c.has("a"), false);
});

test("delete", () => {
  const c = new LRUCache(3);
  c.set("a", 1);
  assert.equal(c.delete("a"), true);
  assert.equal(c.delete("a"), false);
  assert.equal(c.size, 0);
});

test("validates capacity", () => {
  for (const bad of [0, -1, 1.5, "3"]) assert.throws(() => new LRUCache(bad), RangeError);
});
