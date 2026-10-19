import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCSV } from "../src/csv.mjs";

test("simple rows", () => {
  assert.deepEqual(parseCSV("a,b,c\n1,2,3\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("quoted commas", () => {
  assert.deepEqual(parseCSV('name,note\n"Smith, J","hi"\n'), [
    ["name", "note"],
    ["Smith, J", "hi"],
  ]);
});

test("escaped quotes", () => {
  assert.deepEqual(parseCSV('"say ""hi""",x'), [['say "hi"', "x"]]);
});

test("line breaks inside quotes", () => {
  assert.deepEqual(parseCSV('a,"line1\nline2"\nb,c'), [
    ["a", "line1\nline2"],
    ["b", "c"],
  ]);
});

test("windows line endings", () => {
  assert.deepEqual(parseCSV("a,b\r\nc,d\r\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("empty fields are kept", () => {
  assert.deepEqual(parseCSV("a,,c\n,,\n"), [
    ["a", "", "c"],
    ["", "", ""],
  ]);
});
