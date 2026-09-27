import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { buildModContentLayoutRenderIndex } from "./mod-content-layout-render-index.mts";

type Resource = {
  resourcePublicId: string;
  sectionPublicId: string;
  ordinal: number;
  similarGroupId?: string;
};

test("layout render index groups, orders, clusters, and positions each resource once", () => {
  const resources: Resource[] = [
    { resourcePublicId: "r3", sectionPublicId: "b", ordinal: 0 },
    { resourcePublicId: "r2", sectionPublicId: "a", ordinal: 2, similarGroupId: "g" },
    { resourcePublicId: "r1", sectionPublicId: "a", ordinal: 1, similarGroupId: "g" },
    { resourcePublicId: "r4", sectionPublicId: "", ordinal: 0 },
  ];
  const index = buildModContentLayoutRenderIndex(resources, "root");
  const sectionA = index.sections.get("a");

  assert.deepEqual(sectionA?.entries.map((item) => item.resourcePublicId), ["r1", "r2"]);
  assert.deepEqual(sectionA?.clusters.map((cluster) => cluster.map((item) => item.resourcePublicId)), [["r1", "r2"]]);
  assert.equal(sectionA?.positionByResourceID.get("r1"), 0);
  assert.equal(sectionA?.positionByResourceID.get("r2"), 1);
  assert.equal(index.sections.get("root")?.entries[0]?.resourcePublicId, "r4");
  assert.equal(index.resourceByID.get("r3"), resources[0]);
});

test("20k resources are consumed by one top-level pass, independent of category count", () => {
  const resourceCount = 20_000;
  const categoryCount = 1_000;
  const source = Array.from({ length: resourceCount }, (_, index): Resource => ({
    resourcePublicId: `resource-${index}`,
    sectionPublicId: `category-${index % categoryCount}`,
    ordinal: Math.floor(index / categoryCount),
    similarGroupId: `group-${Math.floor(index / 4)}`,
  }));
  let indexedReads = 0;
  const resources = new Proxy(source, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) indexedReads++;
      return Reflect.get(target, property, receiver);
    },
  });

  const started = performance.now();
  const index = buildModContentLayoutRenderIndex(resources, "root");
  const elapsed = performance.now() - started;

  assert.equal(indexedReads, resourceCount);
  assert.equal(index.sections.size, categoryCount);
  assert.equal(index.resourceByID.size, resourceCount);
  assert.ok(elapsed < 2_000, `20k index took ${elapsed.toFixed(1)}ms`);
});

test("layout editor memoizes the production index and has no render-time resource filter or findIndex", async () => {
  const editor = await readFile(new URL("../_components/mod-content-layout-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /useMemo\(\(\) => buildModContentLayoutRenderIndex\(resources, root\.publicId\), \[resources, root\.publicId\]\)/);
  assert.match(editor, /layoutRenderIndex\.sections\.get\(category\.publicId\)/);
  assert.match(editor, /positionByResourceID\.get\(resource\.resourcePublicId\)/);
  assert.doesNotMatch(editor, /const entries = resources\.filter/);
  assert.doesNotMatch(editor, /entries\.findIndex/);
});
