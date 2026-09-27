import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");
const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("site-affairs editors submit loaded baselines and preserve drafts on conflicts", () => {
  assert.match(admin, /baseRevision:\s*saveDraft\.revision/);
  assert.match(admin, /updatedAt:\s*string/);
  assert.match(admin, /baseUpdatedAt/);
  assert.match(admin, /error\s+instanceof\s+ApiError[\s\S]*SITE_PAGE_EDIT_CONFLICT/);
  assert.match(admin, /error\s+instanceof\s+ApiError[\s\S]*SITE_CHANGELOG_EDIT_CONFLICT/);
  assert.match(admin, /admin\.governance\.editConflict/);
  assert.match(english, /editConflict:/);
  assert.match(chinese, /editConflict:/);
});
