import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("seed crawler admin consumes summary cursors and fetches payload detail on demand", async () => {
  const source = await readFile(new URL("../_components/admin-automation-panels.tsx", import.meta.url), "utf8");
  assert.match(source, /type SeedCrawlerPage/);
  assert.match(source, /nextCursor/);
  assert.match(source, /loadMoreSeedRuns/);
  assert.match(source, /loadMoreSeedCandidates/);
  assert.match(source, /seed-crawler\/candidates\/\$\{encodeURIComponent/);
  assert.match(source, /candidateDetail/);
  assert.match(source, /firstSeenRunId: string/);
  assert.match(source, /lastSeenRunId: string/);
});
