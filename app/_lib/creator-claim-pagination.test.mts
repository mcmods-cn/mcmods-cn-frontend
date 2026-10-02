import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { creatorClaimPagePath } from "./creator-claim-pagination.mts";

test("creator claim page paths always request a bounded page", () => {
  assert.equal(creatorClaimPagePath(""), "/api/v1/admin/creator-claims?limit=50");
  assert.equal(
    creatorClaimPagePath("cursor with+/="),
    "/api/v1/admin/creator-claims?limit=50&cursor=cursor+with%2B%2F%3D",
  );
});

test("creator claim panel replaces pages and cancels obsolete requests", () => {
  const source = fs.readFileSync(new URL("../_components/admin-community-panels.tsx", import.meta.url), "utf8");
  const panel = source.slice(source.indexOf("export function CreatorClaimsPanel"), source.indexOf("export function ActivityMonitorPanel"));

  assert.match(panel, /AbortController/);
  assert.match(panel, /\.abort\(\)/);
  assert.match(panel, /cursorHistory/);
  assert.match(panel, /nextCursor/);
  assert.match(panel, /hasMore/);
  assert.match(panel, /setItems\(response\.items\)/);
  assert.doesNotMatch(panel, /setItems\(\(current\) => \[\.\.\.current/);
  assert.doesNotMatch(panel, /apiRequest<\{ items: CreatorClaim\[\] \}>\("\/api\/v1\/admin\/creator-claims"/);
});
