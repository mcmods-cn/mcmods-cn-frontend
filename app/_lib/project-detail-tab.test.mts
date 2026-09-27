import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseProjectDetailTab, projectDetailTabHref } from "./project-detail-tab.mts";

const tabs = ["introduction", "downloads", "gallery", "news"] as const;

test("every declared detail tab round-trips from the URL", () => {
  for (const tab of tabs) assert.equal(parseProjectDetailTab(tab, tabs, "introduction"), tab);
  assert.equal(parseProjectDetailTab("relationships", tabs, "introduction"), "introduction");
  assert.equal(parseProjectDetailTab(null, tabs, "introduction"), "introduction");
});

test("tab navigation preserves unrelated query and hash state", () => {
  assert.equal(
    projectDetailTabHref("/mods/example", "preview=1&tab=gallery", "news", "introduction", "#comments"),
    "/mods/example?preview=1&tab=news#comments",
  );
  assert.equal(
    projectDetailTabHref("/mods/example", "preview=1&tab=news", "introduction", "introduction", "comments"),
    "/mods/example?preview=1#comments",
  );
});

test("mod, project, and modpack details derive tab state only from navigation", async () => {
  const [hook, mod, simple, modpack] = await Promise.all([
    readFile(new URL("../_components/use-project-detail-tab.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/simple-project-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/modpack-detail.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(hook, /router\.push/);
  assert.match(hook, /window\.location\.hash/);
  assert.match(hook, /searchParams\.toString\(\)/);
  for (const source of [mod, simple, modpack]) {
    assert.match(source, /useProjectDetailTab/);
    assert.match(source, /selectTab/);
    assert.doesNotMatch(source, /selectedTab|setSelectedTab|searchParams\.get\("tab"\)/);
  }
});
