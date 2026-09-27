import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-console-oss.tsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../_components/admin-console-shared.tsx", import.meta.url), "utf8");
const zh = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");

test("SEC029 admin UI exposes only short-lived OSS-signed object access", () => {
  const source = `${panel}\n${shared}\n${zh}\n${en}`;
  assert.equal(source.includes("esa_private_origin"), false);
  assert.equal(source.includes("downloadModeESAPrivateOrigin"), false);
  assert.match(panel, /downloadUrlMode:\s*"oss_presigned"/);
  assert.match(shared, /downloadUrlMode:\s*"oss_presigned"/);
  assert.match(panel, /max=\{60\}/);
  assert.match(zh, /不超过 60 分钟的有效期/);
  assert.match(en, /expiry of at most 60 minutes/);
});
