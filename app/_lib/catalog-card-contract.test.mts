import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog list contracts use body-free card DTOs", async () => {
  const simple = await readFile(new URL("./simple-project-api.ts", import.meta.url), "utf8");
  const modpack = await readFile(new URL("./modpack-api.ts", import.meta.url), "utf8");

  assert.match(simple, /type SimpleProjectCardLocalization = Omit<SimpleProjectLocalization, "bodyMarkdown">/);
  assert.match(simple, /type SimpleProjectList = \{ items: SimpleProjectCard\[\]/);
  assert.match(modpack, /type BackendModpackList = \{ items: BackendModpackCard\[\]/);
  assert.match(modpack, /gallery: record\.hasGallery/);
  assert.doesNotMatch(modpack.match(/export type BackendModpackCard[\s\S]*?;\n\};/)?.[0] ?? "", /bodyMarkdown|galleryImages|mods:/);
});

test("simple-project list consumers request only their active locale", async () => {
  const catalog = await readFile(new URL("../_components/simple-project-catalog.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../_components/home-page.tsx", import.meta.url), "utf8");
  const picker = await readFile(new URL("../_components/editor/mod-resource-picker.tsx", import.meta.url), "utf8");

  assert.match(catalog, /requestParams\.set\("locale", locale\)/);
  assert.match(home, /content-projects\/plugin\?[^`]*locale=\$\{encodeURIComponent\(locale\)\}/);
  assert.match(picker, /parameters\.set\("locale", locale\)/);
  for (const source of [catalog, home, picker]) {
    assert.match(source, /SimpleProjectCard/);
  }
});
