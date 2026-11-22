import assert from "node:assert/strict";
import test from "node:test";
import {
  createModContentCategoryTree,
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
  const policy = createModContentCategoryTree(rootID, categories);

  assert.equal(MAX_MOD_CONTENT_CATEGORY_DEPTH, 4);
  assert.equal(policy.canReparent("moving", "target-2"), false);
  assert.equal(policy.reparent("moving", "target-2"), null);
  assert.equal(policy.canReparent("moving", "target-1"), true);

  const moved = policy.reparent("moving", "target-1");
  assert.ok(moved);
  assert.equal(moved.find((item) => item.publicId === "moving")?.parentPublicId, "target-1");
});

test("category reparent policy rejects self, descendants, missing parents and malformed current trees", () => {
  const policy = createModContentCategoryTree(rootID, categories);
  assert.equal(policy.canReparent("moving", "moving"), false);
  assert.equal(policy.canReparent("moving", "moving-grandchild"), false);
  assert.equal(policy.canReparent("moving", "missing"), false);

  const malformed = createModContentCategoryTree(rootID, [
    { publicId: "a", parentPublicId: "b", ordinal: 0 },
    { publicId: "b", parentPublicId: "a", ordinal: 0 },
  ]);
  assert.equal(malformed.canReparent("a", rootID), false);
  assert.equal(malformed.reparent("a", rootID), null);
});

test("both views use ordered siblings and depths even when the input contains an unreachable cycle", () => {
  const tree = createModContentCategoryTree(rootID, categories);
  assert.deepEqual(tree.ordered.map((node) => node.publicId), ["target-1", "target-2", "moving", "moving-child", "moving-grandchild"]);
  assert.deepEqual(tree.childrenByParent.get(rootID)?.map((node) => node.publicId), ["target-1", "moving"]);
  assert.equal(tree.depths.get("moving-grandchild"), 3);
  assert.equal(tree.canAddChild("moving-grandchild"), true);
  const broken = createModContentCategoryTree(rootID, [...categories, { publicId: "orphan", parentPublicId: "orphan", ordinal: 0 }]);
  assert.deepEqual(broken.ordered, tree.ordered);
  assert.equal(broken.canAddChild(rootID), false);
  assert.equal(broken.reparent("moving", "target-1"), null);
});

test("moving tied siblings updates only their order and preserves nested data", () => {
  const siblings = [
    { publicId: "b", parentPublicId: rootID, ordinal: 10, name: "B" },
    { publicId: "a", parentPublicId: rootID, ordinal: 10, name: "A" },
    { publicId: "child", parentPublicId: "a", ordinal: 7, name: "Child" },
  ];
  const tree = createModContentCategoryTree(rootID, siblings);
  assert.deepEqual(tree.ordered.map((node) => node.name), ["A", "Child", "B"]);
  assert.equal(tree.moveSibling("a", -1), null);
  const moved = tree.moveSibling("b", -1);
  assert.ok(moved);
  assert.deepEqual(moved.map((node) => node.ordinal), [0, 1, 7]);
  assert.equal(moved[2], siblings[2]);
  assert.deepEqual(siblings.map((node) => node.ordinal), [10, 10, 7]);
});
