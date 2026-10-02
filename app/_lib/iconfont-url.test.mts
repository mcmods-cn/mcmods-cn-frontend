import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIconfontURL, resolveIconfontConfig } from "./iconfont-url.mts";

test("accepts only the official HTTPS Iconfont symbol endpoint", () => {
  assert.equal(
    normalizeIconfontURL("//at.alicdn.com/t/c/font_123abc.js"),
    "https://at.alicdn.com/t/c/font_123abc.js",
  );
  assert.equal(
    normalizeIconfontURL("https://at.alicdn.com/t/c/font_project-name.js"),
    "https://at.alicdn.com/t/c/font_project-name.js",
  );
});

test("rejects lookalike hosts and mutable script URL features", () => {
  for (const value of [
    "https://evilalicdn.com/t/c/font_123.js",
    "https://at.alicdn.com.evil.example/t/c/font_123.js",
    "https://sub.at.alicdn.com/t/c/font_123.js",
    "http://at.alicdn.com/t/c/font_123.js",
    "https://at.alicdn.com:444/t/c/font_123.js",
    "https://user:password@at.alicdn.com/t/c/font_123.js",
    "https://at.alicdn.com/t/c/font_123.js?cache=off",
    "https://at.alicdn.com/t/c/font_123.js#fragment",
    "https://at.alicdn.com/t/font_123.js",
    "https://at.alicdn.com/t/c/not-font.js",
  ]) {
    assert.equal(normalizeIconfontURL(value), "", value);
  }
});

test("requires one SHA-384 integrity value for configured executable scripts", () => {
  const integrity = `sha384-${"A".repeat(64)}`;
  assert.deepEqual(
    resolveIconfontConfig("//at.alicdn.com/t/c/font_123abc.js", integrity),
    { symbolUrl: "https://at.alicdn.com/t/c/font_123abc.js", integrity },
  );
  assert.equal(resolveIconfontConfig(undefined, undefined), undefined);
  assert.throws(() => resolveIconfontConfig("https://at.alicdn.com/t/c/font_123abc.js", undefined));
  assert.throws(() => resolveIconfontConfig(undefined, integrity));
  assert.throws(() => resolveIconfontConfig("https://evilalicdn.com/t/c/font_123abc.js", integrity));
  assert.throws(() => resolveIconfontConfig("https://at.alicdn.com/t/c/font_123abc.js", "sha256-weak"));
});
