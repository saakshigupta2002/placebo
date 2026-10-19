import assert from "node:assert/strict";
import { test } from "node:test";
import { wrap } from "../src/wrap.mjs";

test("wraps at spaces", () => {
  assert.equal(
    wrap("the quick brown fox jumps over the lazy dog", 10),
    "the quick\nbrown fox\njumps over\nthe lazy\ndog",
  );
});

test("exact fit stays on one line", () => {
  assert.equal(wrap("abc def", 7), "abc def");
});

test("long words are split", () => {
  assert.equal(wrap("supercalifragilistic is long", 8), "supercal\nifragili\nstic is\nlong");
});

test("collapses runs of spaces", () => {
  assert.equal(wrap("a    b   c", 3), "a b\nc");
});

test("keeps paragraphs", () => {
  assert.equal(wrap("one two three\n\nfour five", 7), "one two\nthree\n\nfour\nfive");
});

test("validates width", () => {
  for (const bad of [0, -1, 2.5]) assert.throws(() => wrap("x", bad), RangeError);
});
