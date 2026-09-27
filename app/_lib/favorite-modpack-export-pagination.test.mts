import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./favorite-api.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../_components/favorite-modpack-export.tsx", import.meta.url), "utf8");
const historyLoaderStart = api.indexOf("export function loadFavoriteModpackExports");
const historyLoaderEnd = api.indexOf("export function loadFavoriteModpackExport(", historyLoaderStart);
const historyLoader = api.slice(historyLoaderStart, historyLoaderEnd);

test("favorite MRPack history consumes the server cursor envelope", () => {
  for (const required of [
    "FavoriteModpackExportPage",
    "hasMore",
    "nextCursor",
    "status",
    "cursor",
    "loadMoreHistory",
  ]) {
    assert.ok(api.includes(required) || component.includes(required), `missing ${required}`);
  }
  assert.doesNotMatch(api + component, /historyOffset|\boffset\b|\bpage=/);
  assert.doesNotMatch(historyLoader, /\)\.items;\s*\n}/);
});

test("favorite MRPack creation consumes the confirmed preflight snapshot", () => {
  for (const required of ["previewId", "previewHash", "expiresAt"]) {
    assert.ok(api.includes(required), `preview contract is missing ${required}`);
  }
  assert.match(api, /previewId:\s*string/);
  assert.match(api, /previewHash:\s*string/);
  assert.match(component, /createFavoriteModpackExport\(token, activeCollectionId, preview,/);
  const createStart = api.indexOf("export function createFavoriteModpackExport");
  const createEnd = api.indexOf("export function loadFavoriteModpackExports", createStart);
  const createRequest = api.slice(createStart, createEnd);
  assert.match(createRequest, /previewId/);
  assert.match(createRequest, /previewHash/);
  assert.match(createRequest, /preview\.previewId/);
  assert.match(createRequest, /preview\.previewHash/);
});
