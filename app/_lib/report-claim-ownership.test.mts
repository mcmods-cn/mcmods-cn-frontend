import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../_components/admin-report-panel.tsx", import.meta.url), "utf8");

test("report resolution UI follows the server-owned claim lock", () => {
  assert.match(source, /claimedByCurrentUser: boolean/);
  assert.match(source, /canTakeover: boolean/);
  assert.match(source, /const reportId = detail\.id[\s\S]*reports\/\$\{reportId\}\/takeover/);
  assert.match(source, /detail\.status === "in_review" && detail\.claimedByCurrentUser/);
  assert.doesNotMatch(source, /detail\.status === "pending" \|\| detail\.status === "in_review" \? <form/);
});
