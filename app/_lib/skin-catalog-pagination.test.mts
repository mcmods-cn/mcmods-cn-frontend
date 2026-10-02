import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("skin catalog consumes opaque cursor pages without total or offset", async () => {
  const [component, api] = await Promise.all([
    readFile(new URL("../_components/skin-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("./skin-api.ts", import.meta.url), "utf8"),
  ]);
  for (const required of ["cursorHistory", "nextCursor", "hasMore", "skins.cursorResults"]) {
    assert.match(component, new RegExp(required));
  }
  assert.doesNotMatch(component, /\boffset\b|records\?\.total|records\.total/);
  const catalogContract = api.slice(api.indexOf("export type SkinListResponse"), api.indexOf("export type SkinWardrobePage"));
  const catalogLoader = api.slice(api.indexOf("export function loadSkins"), api.indexOf("export function loadSkin("));
  assert.match(catalogContract, /hasMore:\s*boolean/);
  assert.match(catalogContract, /nextCursor:\s*string/);
  assert.match(catalogLoader, /params\.set\("cursor"/);
  assert.doesNotMatch(catalogContract + catalogLoader, /\btotal:\s*number|\boffset:\s*number|params\.set\("offset"/);
});
