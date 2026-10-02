import assert from "node:assert/strict";
import test from "node:test";
import { formatI18nMessage, parseI18nOverrides } from "./i18n-message.mts";

test("damaged local translation storage cannot inject non-string or blank messages", () => {
  for (const value of ["null", "[]", "broken", '{"en-US":null}', '{"zh-CN":[]}']) assert.deepEqual(parseI18nOverrides(value), {});
  assert.deepEqual(parseI18nOverrides('{"en":{"good":"hello","bad":42,"empty":"  ","object":{},"array":[]},"unsupported":{"good":"no"}}'), { "en-US": { good: "hello" } });
});

test("interpolation preserves parameter values literally without cascading or replacement syntax", () => {
  assert.equal(formatI18nMessage("{a} / {b}", { a: "{b}", b: "$&" }), "{b} / $&");
  assert.equal(formatI18nMessage("{a} {a}", { a: "$`$'" }), "$`$' $`$'");
  assert.equal(formatI18nMessage("{missing} {constructor}", {}), "{missing} {constructor}");
  assert.equal(formatI18nMessage("count {count}", { count: 0 }), "count 0");
});
