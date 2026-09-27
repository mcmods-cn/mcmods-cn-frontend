import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateAntiAbuseSettings, type AntiAbuseSettings } from "./anti-abuse-settings.mts";

function settings(): AntiAbuseSettings {
  return {
    enabled: true, emergencyMode: false,
    logThreshold: 20, moderationThreshold: 40, challengeThreshold: 60, tempBlockThreshold: 80, denyThreshold: 100,
    newAccountDays: 7, trustedAccountDays: 90, trustedMinimumLevel: 5,
    duplicateWindowHours: 24, similarityThreshold: 900, temporaryBlockMinutes: 30,
    policies: { "comment.create": { burstLimit: 4, burstSeconds: 10, hourLimit: 60, dayLimit: 240, objectLimit: 12, objectMinutes: 10, pendingLimit: 0 } },
  };
}

test("the complete default-shaped anti-abuse configuration is valid", () => {
  assert.equal(validateAntiAbuseSettings(settings()), undefined);
});

test("global bounds and threshold dependencies fail before save", () => {
  const invalid = settings();
  invalid.trustedMinimumLevel = 1001;
  assert.equal(validateAntiAbuseSettings(invalid), "globalBounds");
  invalid.trustedMinimumLevel = 5;
  invalid.trustedAccountDays = 6;
  assert.equal(validateAntiAbuseSettings(invalid), "accountOrder");
  invalid.trustedAccountDays = 90;
  invalid.challengeThreshold = 30;
  assert.equal(validateAntiAbuseSettings(invalid), "thresholdOrder");
});

test("per-action second and minute windows use their real service bounds", () => {
  const invalid = settings();
  invalid.policies["comment.create"]!.burstSeconds = 3601;
  assert.equal(validateAntiAbuseSettings(invalid), "policyBounds");
  invalid.policies["comment.create"]!.burstSeconds = 10;
  invalid.policies["comment.create"]!.objectMinutes = 0;
  assert.equal(validateAntiAbuseSettings(invalid), "policyBounds");
});

test("the administrator panel renders every persisted setting", async () => {
  const source = await readFile(new URL("../_components/admin-anti-abuse-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /validateAntiAbuseSettings/);
  for (const key of ["newAccountDays", "trustedAccountDays", "trustedMinimumLevel", "duplicateWindowHours", "temporaryBlockMinutes", "burstSeconds", "objectMinutes"]) {
    assert.match(source, new RegExp(key));
  }
  assert.match(source, /瞬时窗口（秒）/);
  assert.match(source, /单对象窗口（分钟）/);
});
