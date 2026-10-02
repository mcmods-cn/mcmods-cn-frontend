import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-activity-retention-panel.tsx", import.meta.url), "utf8");
const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("activity cleanup distinguishes completed deletion from pending audit repair", () => {
  assert.match(panel, /status:\s*"completed"\s*\|\s*"audit_pending"/);
  assert.match(panel, /result\.status === "audit_pending"/);
  assert.match(panel, /admin\.activityRetention\.auditPending/);
  assert.match(english, /auditPending:/);
  assert.match(chinese, /auditPending:/);
});
