import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { changelogDraftForLocale, switchChangelogLocaleDraft } from "./site-changelog-locale-editor.ts";

const panel = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");

const translations = {
  "en-US": { title: "English", bodyMarkdown: "English body", status: "published" },
  "zh-CN": { title: "中文", bodyMarkdown: "中文正文", status: "draft" },
};

test("a changelog locale loads only its exact translation and never another language", () => {
  assert.deepEqual(changelogDraftForLocale(translations, "zh-CN"), {
    bodyMarkdown: "中文正文",
    publish: false,
    title: "中文",
  });
  assert.deepEqual(changelogDraftForLocale({ "en-US": translations["en-US"] }, "zh-CN"), {
    bodyMarkdown: "",
    publish: false,
    title: "",
  });
});

test("locale switches preserve independent unsaved drafts", () => {
  const first = switchChangelogLocaleDraft({
    currentDraft: { bodyMarkdown: "English edit", publish: true, title: "Edited EN" },
    currentLocale: "en-US",
    drafts: {},
    nextLocale: "zh-CN",
    translations,
  });
  assert.deepEqual(first.nextDraft, { bodyMarkdown: "中文正文", publish: false, title: "中文" });

  const second = switchChangelogLocaleDraft({
    currentDraft: { bodyMarkdown: "中文修改", publish: true, title: "修改中文" },
    currentLocale: "zh-CN",
    drafts: first.drafts,
    nextLocale: "en-US",
    translations,
  });
  assert.deepEqual(second.nextDraft, { bodyMarkdown: "English edit", publish: true, title: "Edited EN" });
});

test("the changelog panel keeps the editing record and switches through the locale draft boundary", () => {
  assert.match(panel, /setEditingItem\(item\)/);
  assert.match(panel, /function changeChangelogLocale/);
  assert.match(panel, /switchChangelogLocaleDraft/);
  assert.match(panel, /onChange=\{\(event\) => changeChangelogLocale\(event\.target\.value\)\}/);
});
