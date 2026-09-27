import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./rating-api.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../_components/rating-panel.tsx", import.meta.url), "utf8");

test("rating review API consumes an opaque cursor envelope without totals or offsets", () => {
  const list = api.slice(api.indexOf("export type RatingList"), api.indexOf("export type RatingPayload"));
  const loader = api.slice(api.indexOf("export function getRatingReviews"), api.indexOf("export function saveRating"));
  assert.match(list, /hasMore:\s*boolean/);
  assert.match(list, /nextCursor:\s*string/);
  assert.match(loader, /params\.set\("cursor"/);
  assert.doesNotMatch(list + loader, /\btotal\b|\boffset\b|params\.set\("offset"/);
});

test("rating review modal keeps one bounded page and navigates cursor history", () => {
  assert.match(panel, /ratingCursorHistory/);
  assert.match(panel, /setRatingCursorHistory/);
  assert.match(panel, /result\.nextCursor/);
  assert.match(panel, /ratings\.reviewPage/);
  assert.doesNotMatch(panel, /setOffset|\boffset\s*\+/);
});
