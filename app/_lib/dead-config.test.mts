import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("primary dictionaries do not expose obsolete homepage placeholders", async () => {
  const dictionaries = await Promise.all([
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  for (const dictionary of dictionaries) {
    const normalized = dictionary.replaceAll("\r\n", "\n");
    const home = normalized.match(/\n  home: \{([\s\S]*?)\n  \},\n/)?.[1] ?? "";
    assert.ok(home);
    assert.doesNotMatch(home, /^\s+(subtitle|activityHint):/m);
  }
});

test("notification acceptance copy describes the reliable delivery stage instead of NATS publication", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  const messages = [english, chinese].map((dictionary) => {
    const normalized = dictionary.replaceAll("\r\n", "\n");
    const notifications = normalized.match(/\n    notifications: \{([\s\S]*?)\n    \},\n    notificationTemplates:/)?.[1] ?? "";
    return notifications.match(/^\s+queued: "([^"]+)",$/m)?.[1] ?? "";
  });
  assert.ok(messages.every(Boolean));
  assert.doesNotMatch(messages.join("\n"), /NATS/i);
  assert.match(messages[0], /reliable/i);
  assert.match(messages[1], /可靠/);
});

test("mod data login guidance names the actual permission sources", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  const messages = [english, chinese].map((dictionary) => {
    const normalized = dictionary.replaceAll("\r\n", "\n");
    const modContent = normalized.match(/\n  modContent: \{([\s\S]*?)\n  \},\n/)?.[1] ?? "";
    return modContent.match(/^\s+managerLoginRequired: "([^"]+)",$/m)?.[1] ?? "";
  });
  assert.ok(messages.every(Boolean));
  assert.doesNotMatch(messages.join("\n"), /\bowner\b|所有者/i);
  assert.match(messages[0], /verified developer/i);
  assert.match(messages[0], /project editor/i);
  assert.match(messages[0], /administrator/i);
  assert.match(messages[1], /已认证开发者/);
  assert.match(messages[1], /本站编辑员/);
  assert.match(messages[1], /管理员/);
});
