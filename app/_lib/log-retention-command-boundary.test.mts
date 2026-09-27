import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("log retention UI separates policy saves from manual cleanup", async () => {
  const [panel, english, chinese] = await Promise.all([
    readFile(new URL("../_components/admin-console-oss.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /method: "PUT"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /\/api\/v1\/admin\/logs\/cleanup/);
  assert.match(panel, /admin\.logs\.cleanupComplete/);
  assert.doesNotMatch(panel, /setMessage\(t\("admin\.logs\.policySaved", \{ count:/);
  assert.doesNotMatch(english, /Saving immediately removes expired logs/);
  assert.doesNotMatch(chinese, /保存策略时会立即按新策略清理/);
});
