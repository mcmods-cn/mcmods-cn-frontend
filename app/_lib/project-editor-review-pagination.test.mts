import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeProjectEditorReviewPage, projectEditorReviewPagePath } from "./project-editor-review-pagination.mts";

test("project editor review path carries status limit and opaque cursor", () => {
  assert.equal(
    projectEditorReviewPagePath("pending", 50, "opaque+/="),
    "/api/v1/admin/project-editor-applications?status=pending&limit=50&cursor=opaque%2B%2F%3D",
  );
});

test("project editor review merge preserves queue order without duplicates", () => {
  assert.deepEqual(
    mergeProjectEditorReviewPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]),
    [{ id: "a" }, { id: "b" }, { id: "c" }],
  );
});

test("editor review panel uses bounded continuation and cancellation", async () => {
  const source = await readFile(new URL("../_components/admin-mod-panels.tsx", import.meta.url), "utf8");
  assert.match(source, /projectEditorReviewPagePath/);
  assert.match(source, /editorNextCursor/);
  assert.match(source, /editorLoadingMore/);
  assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /kind === "content" \?[^\n]+: "\/api\/v1\/admin\/project-editor-applications"/);
});
