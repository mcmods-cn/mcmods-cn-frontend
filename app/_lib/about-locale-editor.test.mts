import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canSubmitAboutDraft, isCurrentAboutDraftResponse } from "./about-locale-editor.ts";

const panel = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");

test("about responses must belong to the current locale and request generation", () => {
  const current = {
    aborted: false,
    currentGeneration: 4,
    requestGeneration: 4,
    requestedLocale: "zh-CN",
    responseLocale: "zh-CN",
    selectedLocale: "zh-CN",
  };

  assert.equal(isCurrentAboutDraftResponse(current), true);
  assert.equal(isCurrentAboutDraftResponse({ ...current, aborted: true }), false);
  assert.equal(isCurrentAboutDraftResponse({ ...current, requestGeneration: 3 }), false);
  assert.equal(isCurrentAboutDraftResponse({ ...current, requestedLocale: "en-US" }), false);
  assert.equal(isCurrentAboutDraftResponse({ ...current, responseLocale: "en-US" }), false);
});

test("about saves stay locked until the selected locale has a valid loaded draft", () => {
  const draft = { locale: "zh-CN" };

  assert.equal(canSubmitAboutDraft({ draft, loadError: "", loading: false, saving: false, selectedLocale: "zh-CN" }), true);
  assert.equal(canSubmitAboutDraft({ draft, loadError: "", loading: false, saving: false, selectedLocale: "en-US" }), false);
  assert.equal(canSubmitAboutDraft({ draft, loadError: "", loading: true, saving: false, selectedLocale: "zh-CN" }), false);
  assert.equal(canSubmitAboutDraft({ draft, loadError: "failed", loading: false, saving: false, selectedLocale: "zh-CN" }), false);
  assert.equal(canSubmitAboutDraft({ draft, loadError: "", loading: false, saving: true, selectedLocale: "zh-CN" }), false);
  assert.equal(canSubmitAboutDraft({ draft: undefined, loadError: "", loading: false, saving: false, selectedLocale: "zh-CN" }), false);
});

test("the about panel aborts superseded loads and saves against the validated draft locale", () => {
  assert.match(panel, /new AbortController\(\)/);
  assert.match(panel, /isCurrentAboutDraftResponse/);
  assert.match(panel, /canSubmitAboutDraft/);
  assert.match(panel, /site-affairs\/about\/\$\{saveDraft\.locale\}/);
  assert.match(panel, /baseRevision:\s*saveDraft\.revision/);
  assert.match(panel, /disabled=\{!canEdit\}/);
});
