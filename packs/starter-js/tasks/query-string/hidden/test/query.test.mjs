import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuery, stringifyQuery } from "../src/query.mjs";

test("parse basics", () => {
  assert.deepEqual(parseQuery("?a=1&b=two"), { a: "1", b: "two" });
});

test("parse repeated keys", () => {
  assert.deepEqual(parseQuery("tag=x&tag=y&tag=z"), { tag: ["x", "y", "z"] });
});

test("parse decoding", () => {
  assert.deepEqual(parseQuery("q=hello+world&name=J%C3%BCrgen&e=a%3Db"), {
    q: "hello world",
    name: "Jürgen",
    e: "a=b",
  });
});

test("parse flags and empty input", () => {
  assert.deepEqual(parseQuery("debug&x="), { debug: "", x: "" });
  assert.deepEqual(parseQuery(""), {});
  assert.deepEqual(parseQuery("?"), {});
});

test("stringify", () => {
  assert.equal(
    stringifyQuery({ b: "two words", a: ["1", "2"], skip: undefined }),
    "a=1&a=2&b=two%20words",
  );
});

test("round trip", () => {
  const obj = { city: "São Paulo", tags: ["a&b", "c"] };
  assert.deepEqual(parseQuery(stringifyQuery(obj)), obj);
});

test("stringify empty", () => {
  assert.equal(stringifyQuery({}), "");
});
