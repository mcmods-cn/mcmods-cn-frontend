import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("layout and advancement clients keep only one compact server page", async () => {
  const api = await readFile(new URL("./mod-content-api.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../_components/mod-content-section-page.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../_components/mod-content-layout-editor.tsx", import.meta.url), "utf8");
  assert.match(api, /export type ModContentLayoutSummary/);
  assert.match(api, /patchModContentLayout/);
  assert.doesNotMatch(api, /loadAllModContent(?:AdvancementGraph|LayoutResources)/);
  assert.doesNotMatch(page, /loadAllModContentAdvancementGraph/);
  assert.doesNotMatch(editor, /loadAllModContentLayoutResources/);
  assert.match(page, /section\?\.templateCode === "advancement"[\s\S]{0,120}advancementResources\.length > 0/);
  assert.match(page, /cursorHistory/);
  assert.match(editor, /cursorHistory/);
});

test("incremental layout mutation never sends a full resource snapshot", async () => {
  const api = await readFile(new URL("./mod-content-api.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../_components/mod-content-layout-editor.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../_components/mod-content-workspace.tsx", import.meta.url), "utf8");
  assert.match(api, /method: "PATCH"/);
  assert.match(editor, /patchModContentLayout/);
  assert.match(workspace, /patchModContentLayout/);
  assert.doesNotMatch(editor, /updateModContentLayout/);
  assert.doesNotMatch(workspace, /updateModContentLayout/);
});
