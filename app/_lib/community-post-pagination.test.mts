import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./community-post-api.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../_components/community-post-catalog.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../_components/community-post-editor.tsx", import.meta.url), "utf8");

test("community catalog consumes narrow opaque cursor pages", () => {
  assert.match(api, /export type CommunityPostSummary/);
  assert.match(api, /summary:\s*string/);
  assert.match(api, /hasMore:\s*boolean/);
  assert.match(api, /nextCursor:\s*string/);
  assert.match(api, /cursor/);
  assert.doesNotMatch(api.slice(api.indexOf("function loadCommunityPosts"), api.indexOf("function loadCommunityPostCategories")), /offset|total/);
  assert.match(catalog, /communityPostCursorHistory/);
  assert.match(catalog, /nextCursor/);
  assert.doesNotMatch(catalog, /CatalogPagination|setTotal|result\.total|filters\.page\b/);
});

test("community editor enforces the server reference budgets before save", () => {
  assert.match(api, /communityPostProjectReferenceLimit\s*=\s*32/);
  assert.match(api, /communityPostResourceReferenceLimit\s*=\s*64/);
  assert.match(editor, /communityPostProjectReferenceLimit/);
  assert.match(editor, /communityPostResourceReferenceLimit/);
  assert.match(editor, /referenceLimit/);
});
