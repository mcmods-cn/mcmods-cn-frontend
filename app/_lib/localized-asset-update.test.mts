import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { localizedAssetContentPayload } from "./localized-asset-update.mts";

test("localized asset content is serialized as one bounded snapshot", () => {
  assert.deepEqual(localizedAssetContentPayload("zh-CN", [
    { locale: "zh-CN", fields: { name: " 中文 ", summary: " 介绍 ", contentMarkdown: "正文" }, editable: true },
    { locale: "en-US", fields: { name: "English", summary: "Summary", contentMarkdown: "Body" }, editable: true },
    { locale: "ja", fields: { name: "", summary: "", contentMarkdown: "" }, editable: true },
    { locale: "ru", fields: { name: "Generated", summary: "", contentMarkdown: "" }, editable: false },
  ]), {
    defaultLocale: "zh-CN",
    localizations: [
      { locale: "zh-CN", name: "中文", summary: "介绍", contentMarkdown: "正文" },
      { locale: "en-US", name: "English", summary: "Summary", contentMarkdown: "Body" },
    ],
  });
});

test("the editor submits exactly one mutation for each asset kind", async () => {
  const source = await readFile(new URL("../_components/localized-asset-editor.tsx", import.meta.url), "utf8");
  assert.match(source, /localizedAssetContentPayload/);
  assert.match(source, /updateSkin[\s\S]{0,500}\.\.\.content/);
  assert.match(source, /blueprints[\s\S]{0,500}\.\.\.content/);
  assert.doesNotMatch(source, /for \(const version[\s\S]{0,800}method: "PUT"/);
});
