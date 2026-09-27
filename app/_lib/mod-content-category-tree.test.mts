import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createModContentCategoryReparentPolicy,
  MAX_MOD_CONTENT_CATEGORY_DEPTH,
} from "./mod-content-category-tree.mts";

type Category = { publicId: string; parentPublicId: string; ordinal: number; name: string };

const rootID = "root";
const categories: Category[] = [
  { publicId: "target-1", parentPublicId: rootID, ordinal: 0, name: "target level 1" },
  { publicId: "target-2", parentPublicId: "target-1", ordinal: 0, name: "target level 2" },
  { publicId: "moving", parentPublicId: rootID, ordinal: 1, name: "moving" },
  { publicId: "moving-child", parentPublicId: "moving", ordinal: 0, name: "child" },
  { publicId: "moving-grandchild", parentPublicId: "moving-child", ordinal: 0, name: "grandchild" },
];

test("category reparent policy rejects a shallow parent when the moved subtree would exceed depth four", () => {
  const policy = createModContentCategoryReparentPolicy(rootID, categories);

  assert.equal(MAX_MOD_CONTENT_CATEGORY_DEPTH, 4);
  assert.equal(policy.canReparent("moving", "target-2"), false);
  assert.equal(policy.reparent("moving", "target-2"), null);
  assert.equal(policy.canReparent("moving", "target-1"), true);

  const moved = policy.reparent("moving", "target-1");
  assert.ok(moved);
  assert.equal(moved.find((item) => item.publicId === "moving")?.parentPublicId, "target-1");
});

test("category reparent policy rejects self, descendants, missing parents and malformed current trees", () => {
  const policy = createModContentCategoryReparentPolicy(rootID, categories);
  assert.equal(policy.canReparent("moving", "moving"), false);
  assert.equal(policy.canReparent("moving", "moving-grandchild"), false);
  assert.equal(policy.canReparent("moving", "missing"), false);

  const malformed = createModContentCategoryReparentPolicy(rootID, [
    { publicId: "a", parentPublicId: "b", ordinal: 0 },
    { publicId: "b", parentPublicId: "a", ordinal: 0 },
  ]);
  assert.equal(malformed.canReparent("a", rootID), false);
  assert.equal(malformed.reparent("a", rootID), null);
});

test("parent dropdown and drag relationship editor call the same reparent function and filter with the same policy", async () => {
  const source = await readFile(new URL("../_components/mod-content-layout-editor.tsx", import.meta.url), "utf8");
  assert.match(source, /const categoryReparentPolicy = useMemo\(\(\) => createModContentCategoryReparentPolicy/);
  assert.match(source, /onReparent=\{reparentCategory\}/);
  assert.match(source, /onChange=\{\(event\) => reparentCategory\(category\.publicId, event\.target\.value\)\}/);
  assert.match(source, /categoryReparentPolicy\.canReparent\(category\.publicId, item\.publicId\)/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => onCategoriesChange\(normalizeCategoryOrdinals\(categories\.map/);
});
