import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("./content-history-api.ts", import.meta.url);
const componentPath = new URL("../_components/content-history.tsx", import.meta.url);

test("content history API exposes a bounded cursor page", async () => {
  const source = await readFile(apiPath, "utf8");
  for (const required of ["limit: number", "hasMore: boolean", "nextCursor: string", "contentHistoryPagePath"]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /parameters\.set\("cursor"/);
});

test("content history renders one page and navigates opaque cursors", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const required of ["cursorHistory", "page?.hasMore", "page.nextCursor", "common.previous", "common.next", "AbortController"]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /setItems\(\(current\).*\.\.\.result\.items/s);
});

