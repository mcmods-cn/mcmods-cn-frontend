import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin log panels consume cursor envelopes without page offsets", async () => {
  const source = (await Promise.all([
    readFile(new URL("../_components/admin-console-oss.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/admin-console-shared.tsx", import.meta.url), "utf8"),
  ])).join("\n");
  assert.match(source, /type LogPage/);
  assert.match(source, /nextCursor/);
  assert.match(source, /hasMore/);
  assert.match(source, /loadMoreLogs/);
  assert.match(source, /cursor/);
  assert.doesNotMatch(source, /apiRequest<LogRow\[\]>\(`\/api\/v1\/admin\/logs/);
});
