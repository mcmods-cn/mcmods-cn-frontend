import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resource picker delegates exclusion and continuation to every authoritative catalog page", async () => {
  const source = await readFile(new URL("../_components/editor/mod-resource-picker.tsx", import.meta.url), "utf8");
  assert.match(source, /parameters\.set\("excludeSiteId", excludeSiteId\)/);
  assert.doesNotMatch(source, /containsExcluded/);
  assert.doesNotMatch(source, /items\.filter\(\(item\) => item\.source\?\.siteId !== excludeSiteId\)/);
  assert.match(source, /loadCompositeProjectPage/);
  assert.match(source, /options\.cursor/);
  assert.doesNotMatch(source, /counts\s*=\s*await\s+Promise\.all/);
  assert.doesNotMatch(source, /counts\.reduce/);
});
