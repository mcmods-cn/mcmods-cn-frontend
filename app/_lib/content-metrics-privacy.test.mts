import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./content-metrics-api.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../_components/content-metrics-panel.tsx", import.meta.url), "utf8");

test("public content metrics expose aggregates and editors without visitor history", () => {
  assert.doesNotMatch(api, /recentViewers/);
  assert.doesNotMatch(panel, /recentViewers|noViewers|Recent signed-in viewers|最近浏览的用户/);
  assert.match(panel, /metrics\.recentEditors/);
  assert.match(panel, /metrics\.totalViews/);
});
