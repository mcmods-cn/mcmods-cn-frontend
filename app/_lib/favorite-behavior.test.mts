import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  appendCreatedFavoriteCollection,
  changeFavoriteSelection,
  favoriteSelectionChecked,
  favoriteSelectionDelta,
} from "./favorite-selection.ts";

const api = readFileSync(new URL("./favorite-api.ts", import.meta.url), "utf8");
const picker = readFileSync(new URL("../_components/favorite-picker-modal.tsx", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../_components/favorite-modpack-export.tsx", import.meta.url), "utf8");

test("favorite selection state supports multiple collection additions and removals", () => {
  const serverSelected = new Set(["collect01a", "collect01b"]);
  let changes = new Map<string, boolean>();
  changes = changeFavoriteSelection(changes, "collect01a", false);
  changes = changeFavoriteSelection(changes, "collect01c", true);

  assert.equal(favoriteSelectionChecked(serverSelected, changes, "collect01a"), false);
  assert.equal(favoriteSelectionChecked(serverSelected, changes, "collect01b"), true);
  assert.equal(favoriteSelectionChecked(serverSelected, changes, "collect01c"), true);
  assert.deepEqual(favoriteSelectionDelta(changes), {
    addCollectionIds: ["collect01c"],
    removeCollectionIds: ["collect01a"],
  });
});

test("a newly created collection is shown and selected without mutating prior state", () => {
  const originalCollections = [{ id: "collect01a", name: "Existing" }];
  const originalChanges = new Map<string, boolean>([["collect01a", false]]);
  const created = { id: "collect01b", name: "New" };
  const collections = appendCreatedFavoriteCollection(originalCollections, created);
  const changes = changeFavoriteSelection(originalChanges, created.id, true);

  assert.deepEqual(collections, [originalCollections[0], created]);
  assert.equal(changes.get(created.id), true);
  assert.equal(originalCollections.length, 1);
  assert.deepEqual([...originalChanges], [["collect01a", false]]);
});

test("a rejected save leaves the pending selection changes available for retry", async () => {
  const serverSelected = new Set(["collect01a"]);
  const changes = changeFavoriteSelection(new Map<string, boolean>(), "collect01b", true);
  await assert.rejects(Promise.reject(new Error("save rejected")), /save rejected/);
  assert.equal(favoriteSelectionChecked(serverSelected, changes, "collect01a"), true);
  assert.equal(favoriteSelectionChecked(serverSelected, changes, "collect01b"), true);

  const saveStart = picker.indexOf("async function save()");
  const saveEnd = picker.indexOf("\n  return <", saveStart);
  const saveFlow = picker.slice(saveStart, saveEnd);
  assert.match(saveFlow, /catch \(reason\)/);
  assert.doesNotMatch(saveFlow.slice(saveFlow.indexOf("catch (reason)")), /setSelectionChanges/);
});

test("favorite identity and download failures use canonical stable contracts", () => {
  assert.match(api, /entityPublicId:\s*string/);
  assert.doesNotMatch(api + picker, /entityKey/);
  assert.doesNotMatch(api, /整合包下载失败或下载链接已过期/);
  assert.match(api, /new ApiError\([\s\S]*response\.status[\s\S]*MODPACK_EXPORT_DOWNLOAD_FAILED/);
  assert.match(exporter, /MODPACK_EXPORT_DOWNLOAD_EXPIRED/);
  assert.match(exporter, /downloadExpired/);
  assert.match(exporter, /downloadForbidden/);
  assert.match(exporter, /downloadFailed/);
});
