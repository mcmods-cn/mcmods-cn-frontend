import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveCommentWatchMute } from "./comment-watch-mute.mts";

test("comment watch controls do not infer a 24-hour mode from an exact deadline", async () => {
  const component = await readFile(new URL("../_components/user-comment-watches-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /mutedUntil\s*\?\s*"24h"/);
  assert.match(component, /resolveCommentWatchMute/);
  assert.match(component, /commentWatches\.mutedUntil/);
});

test("finite watch mutes preserve the exact server deadline instead of inventing a duration", () => {
  const now = Date.parse("2026-08-21T00:00:00.000Z");
  const oneHour = resolveCommentWatchMute(false, "2026-08-21T01:00:00.000Z", now);
  const sevenDays = resolveCommentWatchMute(false, "2026-08-28T00:00:00.000Z", now);
  assert.deepEqual(oneHour, { selection: "until", expiresAt: now + 60 * 60 * 1000 });
  assert.deepEqual(sevenDays, { selection: "until", expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
  assert.deepEqual(resolveCommentWatchMute(true, "2026-08-21T01:00:00.000Z", now), { selection: "forever" });
  assert.deepEqual(resolveCommentWatchMute(false, "2026-08-20T23:59:59.000Z", now), { selection: "none" });
  assert.deepEqual(resolveCommentWatchMute(false, "not-a-date", now), { selection: "invalid" });
});
