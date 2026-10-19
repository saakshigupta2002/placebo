import assert from "node:assert/strict";
import { test } from "node:test";
import * as kit from "../src/index.mjs";

test("every module is exported", () => {
  for (const name of [
    "parseDuration",
    "slugify",
    "LRUCache",
    "compareVersions",
    "parseCSV",
    "deepMerge",
    "toRoman",
    "fromRoman",
    "wrap",
    "mergeIntervals",
    "topoSort",
    "parseQuery",
    "stringifyQuery",
    "formatMoney",
  ]) {
    assert.equal(typeof kit[name], "function", name);
  }
});
