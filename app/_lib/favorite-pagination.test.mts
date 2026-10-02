import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./favorite-api.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../_components/mod-catalog.tsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("../_components/favorite-picker-modal.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../_components/user-home.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../_components/user-profile-overview.tsx", import.meta.url), "utf8");

test("favorite collection and item APIs expose bounded opaque cursor pages", () => {
  assert.match(api, /export type FavoritePage<T>/);
  assert.match(api, /hasMore:\s*boolean/);
  assert.match(api, /nextCursor:\s*string/);
  for (const name of ["loadFavoriteCollections", "loadFavoriteItems", "loadPublicFavoriteCollections", "loadPublicFavoriteItems"]) {
    const start = api.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `${name} is missing`);
    const body = api.slice(start, api.indexOf("\n}", start) + 2);
    assert.match(body, /cursor/);
    assert.match(body, /FavoritePage</);
  }
});

test("catalog checks only the current result page through one membership summary request", () => {
  assert.match(api, /function loadFavoriteMembershipSummary/);
  assert.match(api, /favorites\/summary/);
  assert.match(catalog, /loadFavoriteMembershipSummary/);
  assert.match(catalog, /backendMods\.map/);
  assert.doesNotMatch(catalog, /loadFavoriteCollections|loadFavoriteItems|Promise\.all\(collections\.map/);
});

test("favorite selectors and public pages keep bounded cursor histories", () => {
  assert.match(picker, /favoritePickerCursorHistory/);
  assert.match(account, /favoriteCollectionCursorHistory/);
  assert.match(account, /favoriteItemCursorHistory/);
  assert.match(profile, /publicFavoriteCollectionCursorHistory/);
  assert.match(profile, /publicFavoriteItemCursorHistory/);
  for (const source of [picker, account, profile]) {
    assert.match(source, /nextCursor/);
    assert.match(source, /hasMore/);
  }
});
