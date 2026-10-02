import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./favorite-api.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../_components/favorite-modpack-export.tsx", import.meta.url), "utf8");
const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("favorite MRPack history exposes the facts required to reproduce confirmation", () => {
  assert.match(api, /allowCompatibleOnly:\s*boolean/);
  assert.match(api, /reportVersion:\s*number/);
  assert.match(api, /rebuildSource:\s*FavoriteModpackExportRebuildSource/);
  assert.match(component, /preview\.allowCompatibleOnly\s*\|\|\s*hasOmissions/);
});

test("favorite MRPack history offers explicit current and original rebuild sources", () => {
  for (const required of [
    'FavoriteModpackExportRebuildSource = "current_collection" | "original_snapshot"',
    "rebuildFavoriteModpackExportPreview",
    "/rebuild-preflight",
    "JSON.stringify({ source })",
    "rebuildFavoriteModpackExportPreview(token, detail.task.id, source)",
    'onRebuildCurrent={() => rebuildFromHistory("current_collection")}',
    'onRebuildOriginal={() => rebuildFromHistory("original_snapshot")}',
  ]) {
    assert.ok(api.includes(required) || component.includes(required), `missing ${required}`);
  }
  assert.doesNotMatch(component, /function returnToSettings/);
  for (const locale of [english, chinese]) {
    assert.match(locale, /rebuildCurrentCollection:/);
    assert.match(locale, /rebuildOriginalSnapshot:/);
  }
});
