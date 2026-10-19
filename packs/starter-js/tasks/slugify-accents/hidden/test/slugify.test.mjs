import assert from "node:assert/strict";
import { test } from "node:test";
import { slugify } from "../src/slugify.mjs";

test("collapses separators", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  many   spaces  "), "many-spaces");
  assert.equal(slugify("a--b__c"), "a-b-c");
});

test("folds accents", () => {
  assert.equal(slugify("Crème Brûlée"), "creme-brulee");
  assert.equal(slugify("Ångström Über"), "angstrom-uber");
});

test("keeps digits", () => {
  assert.equal(slugify("Top 10 Tips for 2026"), "top-10-tips-for-2026");
});

test("empty when nothing usable", () => {
  assert.equal(slugify("!!!"), "");
});
