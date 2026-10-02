import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resource picker hydrates every preselection through one batch boundary", async () => {
  const dialog = await readFile(new URL("../_components/editor/resource-picker-dialog.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("./editor-api.ts", import.meta.url), "utf8");
  assert.match(dialog, /loadCatalogResourcePresentations\(pending, locale, token, controller\.signal\)/);
  assert.doesNotMatch(dialog, /Promise\.all\(Array\.from\(\{ length: Math\.min\(6, resources\.length\)/);
  assert.doesNotMatch(dialog, /const page = await loadPage\(/);
  assert.match(api, /POST/);
  assert.match(api, /\/api\/v1\/catalog\/resource-presentations/);
});

test("batch hydration remains independent from each picker's browsing loader", async () => {
  const dialog = await readFile(new URL("../_components/editor/resource-picker-dialog.tsx", import.meta.url), "utf8");
  const hydrationStart = dialog.indexOf("const pending = value.filter(needsResourceHydration)");
  const hydrationEnd = dialog.indexOf("  const cursorBased", hydrationStart);
  assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart);
  const hydration = dialog.slice(hydrationStart, hydrationEnd);
  assert.doesNotMatch(hydration, /loadPage/);
});
