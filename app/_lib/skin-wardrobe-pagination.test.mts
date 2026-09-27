import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./skin-api.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../_components/user-player-profiles-panel.tsx", import.meta.url), "utf8");

test("wardrobe API exposes a cursor page instead of normalizing a fixed array", () => {
  assert.match(api, /export type SkinWardrobePage\s*=\s*\{/);
  assert.match(api, /hasMore:\s*boolean/);
  assert.match(api, /nextCursor:\s*string/);
  assert.match(api, /loadWardrobe\([^)]*query/);
  assert.match(api, /params\.set\("cursor",\s*query\.cursor\)/);
  assert.doesNotMatch(api, /loadWardrobe[\s\S]{0,300}normalizeItems\(response\)/);
});

test("profile panel incrementally appends wardrobe pages and preserves loaded options", () => {
  assert.match(panel, /wardrobeNextCursor/);
  assert.match(panel, /wardrobeHasMore/);
  assert.match(panel, /loadMoreWardrobe/);
  assert.match(panel, /setWardrobe\(\(items\)\s*=>[\s\S]{0,300}publicId/);
  assert.match(panel, /skins\.wardrobeLoadMore/);
  assert.doesNotMatch(panel, /loadWardrobe\(token\)\.then\(normalizeItems/);
});
