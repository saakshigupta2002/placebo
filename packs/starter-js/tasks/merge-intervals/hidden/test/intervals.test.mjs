import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeIntervals } from "../src/intervals.mjs";

test("unsorted input", () => {
  assert.deepEqual(
    mergeIntervals([
      [5, 6],
      [1, 2],
      [3, 4],
    ]),
    [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  );
});

test("touching intervals merge", () => {
  assert.deepEqual(
    mergeIntervals([
      [1, 2],
      [2, 3],
    ]),
    [[1, 3]],
  );
});

test("contained intervals do not shrink the result", () => {
  assert.deepEqual(
    mergeIntervals([
      [1, 10],
      [2, 3],
    ]),
    [[1, 10]],
  );
});

test("overlapping chain", () => {
  assert.deepEqual(
    mergeIntervals([
      [8, 10],
      [1, 3],
      [2, 6],
      [15, 18],
    ]),
    [
      [1, 6],
      [8, 10],
      [15, 18],
    ],
  );
});

test("does not mutate the input", () => {
  const input = [
    [3, 4],
    [1, 2],
  ];
  mergeIntervals(input);
  assert.deepEqual(input, [
    [3, 4],
    [1, 2],
  ]);
});

test("empty input", () => {
  assert.deepEqual(mergeIntervals([]), []);
});
