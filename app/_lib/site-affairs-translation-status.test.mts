import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");

test("site-affairs administration edits publication per translation", () => {
  assert.match(admin, /translations:\s*Record<\s*string,\s*\{\s*title:\s*string;\s*bodyMarkdown:\s*string;\s*status:\s*string\s*\}\s*>/);
  assert.match(admin, /setPublish\(value\.publish\)/);
  assert.doesNotMatch(admin, /setPublish\(item\.status\s*===\s*"published"\)/);
});
