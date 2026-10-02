import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI task settings expose only the authoritative NATS concurrency control", async () => {
  const [shared, infrastructure, english, chinese] = await Promise.all([
    readFile(new URL("../_components/admin-console-shared.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/admin-console-infrastructure.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  const taskModelType = shared.match(/type AITaskModelConfig = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.ok(taskModelType);
  assert.doesNotMatch(taskModelType, /concurrencyLimit/);
  assert.doesNotMatch(infrastructure, /item\.concurrencyLimit|admin\.ai\.concurrencyLimit/);
  assert.match(infrastructure, /task\.maxConcurrent/);
  assert.match(infrastructure, /admin\.nats\.maxConcurrent/);

  for (const dictionary of [english, chinese]) {
    const ai = dictionary.replaceAll("\r\n", "\n").match(/\n    ai: \{([\s\S]*?)\n    \},\n/)?.[1] ?? "";
    assert.ok(ai);
    assert.doesNotMatch(ai, /^\s+concurrencyLimit:/m);
  }
  assert.match(english, /AI queue.+NATS/i);
  assert.match(chinese, /AI 队列.+NATS/);
  assert.match(english, /per-application-instance concurrency limit/i);
  assert.match(chinese, /每个应用实例的并发上限/);
});
