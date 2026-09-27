import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../_components/community-post-editor.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("community-post-api.ts", import.meta.url), "utf8");

test("community post editor requires and preserves a registered source locale", () => {
  assert.match(editor, /supportedLocales/);
  assert.match(editor, /sourceLocale:\s*post\.sourceLocale/);
  assert.match(editor, /value=\{draft\.sourceLocale/);
  assert.match(editor, /setDraft\(\{\s*\.\.\.draft,\s*sourceLocale:/);
  assert.match(editor, /communityPosts\.fields\.sourceLocale/);
  assert.match(editor, /communityPosts\.fields\.sourceLocaleHint/);
  assert.match(api, /body:\s*JSON\.stringify\(\{\s*\.\.\.draft,/);
});
