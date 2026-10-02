import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./community-post-api.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../_components/community-post-editor.tsx", import.meta.url), "utf8");
const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("community post edits carry the published revision and stop on an explicit conflict", () => {
  assert.match(api, /publishedRevisionId\?:\s*string/);
  assert.match(api, /baseRevisionId/);
  assert.match(api, /body:\s*JSON\.stringify\(\{\s*\.\.\.draft,\s*baseRevisionId\s*\}\)/s);
  assert.match(editor, /setBaseRevisionId\(post\.publishedRevisionId\s*\|\|\s*""\)/);
  assert.match(editor, /saveCommunityPost\(draft,\s*token,\s*id,\s*baseRevisionId\)/);
  assert.match(editor, /error instanceof ApiError[\s\S]*COMMUNITY_POST_EDIT_CONFLICT/);
  assert.match(editor, /communityPosts\.validation\.editConflict/);
  assert.match(english, /editConflict:/);
  assert.match(chinese, /editConflict:/);
});
