import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSimilarResourceGroups } from "./mod-content-layout-groups.mts";

test("cursor pages retain a group's member when the other member is not loaded", () => {
  const page = [{ resourcePublicId: "page-1", sectionPublicId: "root", similarGroupId: "cross-page" }, { resourcePublicId: "unrelated", sectionPublicId: "category", similarGroupId: "" }];
  assert.deepEqual(normalizeSimilarResourceGroups(page, false), page);
  assert.equal(normalizeSimilarResourceGroups(page, true)[0].similarGroupId, "");
});

test("complete layouts retain valid groups and clear proven invalid groups", () => {
  const valid = [{ sectionPublicId: "root", similarGroupId: "valid" }, { sectionPublicId: "root", similarGroupId: "valid" }];
  assert.deepEqual(normalizeSimilarResourceGroups(valid, true), valid);
  const invalid = [{ sectionPublicId: "root", similarGroupId: "invalid" }, { sectionPublicId: "category", similarGroupId: "invalid" }];
  assert.deepEqual(normalizeSimilarResourceGroups(invalid, false).map(item => item.similarGroupId), ["", ""]);
});

test("moving one member explicitly out of its group preserves the unloaded siblings' group", () => {
  const page = [{ resourcePublicId: "moving", sectionPublicId: "new-category", similarGroupId: "" }, { resourcePublicId: "remaining", sectionPublicId: "root", similarGroupId: "cross-page" }];
  assert.equal(normalizeSimilarResourceGroups(page, false)[1].similarGroupId, "cross-page");
});
