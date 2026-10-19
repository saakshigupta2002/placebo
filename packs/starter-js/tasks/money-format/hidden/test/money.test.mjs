import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney } from "../src/money.mjs";

test("thousands separators", () => {
  assert.equal(formatMoney(123456789), "$1,234,567.89");
  assert.equal(formatMoney(100000), "$1,000.00");
  assert.equal(formatMoney(99), "$0.99");
});

test("negative amounts", () => {
  assert.equal(formatMoney(-500), "-$5.00");
  assert.equal(formatMoney(-123456, "EUR"), "-€1,234.56");
});

test("zero-decimal currencies", () => {
  assert.equal(formatMoney(1500, "JPY"), "¥1,500");
});

test("other currencies", () => {
  assert.equal(formatMoney(250, "GBP"), "£2.50");
  assert.equal(formatMoney(250, "CHF"), "CHF 2.50");
});

test("rejects fractional cents", () => {
  assert.throws(() => formatMoney(10.5), TypeError);
  assert.throws(() => formatMoney(Number.NaN), TypeError);
});
