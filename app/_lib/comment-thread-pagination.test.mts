import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentURL = new URL("../_components/comment-section.tsx", import.meta.url);
const apiURL = new URL("comment-api.ts", import.meta.url);

test("comment branch loads bounded cursor pages and merges them", async () => {
  const [component, api] = await Promise.all([
    readFile(componentURL, "utf8"),
    readFile(apiURL, "utf8"),
  ]);

  assert.match(api, /loadCommentThread\(commentId: string, cursor: string \| undefined, token\?: string\)/);
  assert.match(api, /nextCursor: string/);
  assert.match(component, /setNextCursor\(result\.nextCursor\)/);
  assert.match(component, /mergeComments\(current, result\.items\)/);
  assert.match(component, /mods\.comments\.loadMore/);
  assert.match(component, /window\.location\.assign\(`\/comments\/\$\{encodeURIComponent\(id\)\}`\)/);
});
