import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project changelog timeline consumes bounded summary pages", async () => {
  const [api, component] = await Promise.all([
    readFile(new URL("./project-changelog-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/project-changelog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /bodyExcerpt: string/);
  assert.match(api, /bodyTruncated: boolean/);
  assert.match(api, /hasMore: boolean/);
  assert.match(api, /nextCursor: string/);
  assert.match(component, /nextCursor/);
  assert.match(component, /loadMore/);
  assert.doesNotMatch(component, /markdown=\{item\.bodyMarkdown\}/);
});
