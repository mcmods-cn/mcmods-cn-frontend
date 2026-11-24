import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("the two base dictionaries explain how to recover from a community edit conflict", () => {
  assert.match(english, /editConflict:/);
  assert.match(chinese, /editConflict:/);
});
