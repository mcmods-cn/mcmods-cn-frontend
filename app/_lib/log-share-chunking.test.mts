import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public log details contain metadata while bodies use bounded cursor chunks", async () => {
  const api = await readFile(new URL("./log-share-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /type LogShareEntry = \{[^}]*\btext:/);
  assert.match(api, /loadPublicLogShareEntry/);
  assert.match(api, /nextCursor/);
});

test("log viewer retains only one abortable chunk", async () => {
  const viewer = await readFile(new URL("../_components/log-share-viewer.tsx", import.meta.url), "utf8");
  assert.match(viewer, /loadPublicLogShareEntry/);
  assert.match(viewer, /AbortController/);
  assert.match(viewer, /cursorHistory/);
  assert.doesNotMatch(viewer, /text\.split\("\\n"\)/);
  assert.doesNotMatch(viewer, /maxRenderedCharacters/);
});
