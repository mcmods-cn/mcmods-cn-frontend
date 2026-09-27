import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mod-content resource API uses opaque cursors and split compact streams", async () => {
  const source = await readFile(new URL("./mod-content-api.ts", import.meta.url), "utf8");
  assert.match(source, /parameters\.set\("cursor", options\.cursor\)/);
  assert.match(source, /"resource-graph"/);
  assert.match(source, /"layout"/);
  assert.match(source, /ModContentLayoutSummaryPage/);
  assert.doesNotMatch(source, /parameters\.set\("offset"/);
  assert.doesNotMatch(source, /parameters\.set\("all"/);
  assert.doesNotMatch(source, /pageSize = 20000/);
});

test("public section pages increment ordinary cards and use the advancement graph", async () => {
  const source = await readFile(new URL("../_components/mod-content-section-page.tsx", import.meta.url), "utf8");
  assert.match(source, /loadModContentSectionResources/);
  assert.match(source, /loadModContentAdvancementGraph/);
  assert.match(source, /nextCursor/);
  assert.match(source, /setResources\(\(current\) => \[\.\.\.current, \.\.\.page\.items\]\)/);
  assert.match(source, /cursorHistory/);
  assert.doesNotMatch(source, /loadAllModContentSectionResources/);
});

test("layout mutations load the authenticated compact snapshot", async () => {
  const editor = await readFile(new URL("../_components/mod-content-layout-editor.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../_components/mod-content-workspace.tsx", import.meta.url), "utf8");
  assert.match(editor, /loadModContentLayoutSnapshot/);
  assert.match(workspace, /patchModContentLayout/);
  assert.doesNotMatch(editor, /loadAllModContentSectionResources/);
  assert.doesNotMatch(workspace, /loadAllModContentSectionResources/);
});
