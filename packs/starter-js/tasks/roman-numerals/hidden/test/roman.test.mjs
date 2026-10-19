import assert from "node:assert/strict";
import { test } from "node:test";
import { fromRoman, toRoman } from "../src/roman.mjs";

test("toRoman", () => {
  const cases = {
    1: "I",
    4: "IV",
    9: "IX",
    14: "XIV",
    40: "XL",
    90: "XC",
    400: "CD",
    1994: "MCMXCIV",
    2026: "MMXXVI",
    3999: "MMMCMXCIX",
  };
  for (const [n, s] of Object.entries(cases)) assert.equal(toRoman(Number(n)), s);
});

test("toRoman range", () => {
  for (const bad of [0, 4000, -5, 2.5, Number.NaN]) assert.throws(() => toRoman(bad), RangeError);
});

test("fromRoman", () => {
  assert.equal(fromRoman("MCMXCIV"), 1994);
  assert.equal(fromRoman("mmxxvi"), 2026);
  assert.equal(fromRoman("III"), 3);
});

test("round trip", () => {
  for (let n = 1; n <= 3999; n++) assert.equal(fromRoman(toRoman(n)), n);
});

test("rejects non-canonical numerals", () => {
  for (const bad of ["IIII", "VX", "IC", "", "ABC", "MMMM"])
    assert.throws(() => fromRoman(bad), SyntaxError, JSON.stringify(bad));
});
