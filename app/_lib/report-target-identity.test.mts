import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-report-panel.tsx", import.meta.url), "utf8");

test("report administration exposes the target actor with an explicit role", () => {
  assert.match(panel, /targetActorRole\?:\s*"submitter"\s*\|\s*"author"\s*\|\s*"owner"\s*\|\s*"subject"/);
  assert.match(panel, /detail\.targetActorRole/);
  assert.match(panel, /detail\.targetActorName/);
  assert.doesNotMatch(panel, /targetAuthorId|targetAuthorName/);
});
