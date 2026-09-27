import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  mergeSimpleProjectParentFacets,
  normalizeSimpleProjectParentFacetPage,
  simpleProjectParentFacetPagePath,
} from "./simple-project-facets.mts";

test("parent facet page path carries a bounded cursor and selected URL facts", () => {
  assert.equal(
    simpleProjectParentFacetPagePath("addon", "next page", ["mod:alpha", "modpack:beta"], 50),
    "/api/v1/content-projects/addon/facets/parents?limit=50&cursor=next+page&selected=mod%3Aalpha%2Cmodpack%3Abeta",
  );
});

test("parent facet pages merge by stable key and selected facts remain reachable", () => {
  assert.deepEqual(mergeSimpleProjectParentFacets(
    [{ key: "mod:alpha", label: "Alpha" }, { key: "modpack:beta", label: "Beta old" }],
    [{ key: "modpack:beta", label: "Beta" }, { key: "mod:gamma", label: "Gamma" }],
  ), [
    { key: "mod:alpha", label: "Alpha" },
    { key: "modpack:beta", label: "Beta" },
    { key: "mod:gamma", label: "Gamma" },
  ]);
});

test("parent facet responses fail closed on malformed pagination facts", () => {
  assert.deepEqual(normalizeSimpleProjectParentFacetPage({
    items: [{ key: "mod:alpha", label: "Alpha" }],
    selectedItems: [],
    hasMore: true,
    nextCursor: "opaque",
  }).items, [{ key: "mod:alpha", label: "Alpha" }]);
  assert.throws(() => normalizeSimpleProjectParentFacetPage({
    items: [], selectedItems: [], hasMore: true, nextCursor: "",
  }), /Invalid parent facet response/);
  assert.throws(() => normalizeSimpleProjectParentFacetPage({
    items: [{ key: "", label: "missing identity" }], selectedItems: [], hasMore: false, nextCursor: "",
  }), /Invalid parent facet response/);
});

test("simple project filters never derive global options from the current result page", async () => {
  const catalog = await readFile(new URL("../_components/simple-project-catalog.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("./simple-project-api.ts", import.meta.url), "utf8");
  assert.match(catalog, /loadSimpleProjectParentFacetPage/);
  assert.match(catalog, /mergeSimpleProjectParentFacets/);
  assert.match(catalog, /parentFacetsHasMore/);
  assert.match(catalog, /parentFacetsCursor/);
  assert.match(catalog, /catalogFilterOptions\(config, parentFacetItems\)/);
  assert.doesNotMatch(catalog, /catalogFilterOptions\(items/);
  assert.doesNotMatch(catalog, /items\.flatMap/);
  assert.match(catalog, /loaders: \[\.\.\.config\.loaders\]/);
  assert.match(catalog, /licenses: \[\.\.\.licenseOptions\]/);
  assert.match(api, /SimpleProjectParentFacetPage/);
  assert.match(api, /normalizeSimpleProjectParentFacetPage/);
});
