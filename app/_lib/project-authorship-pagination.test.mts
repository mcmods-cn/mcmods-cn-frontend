import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeProjectAuthorshipPage, projectAuthorshipPagePath } from "./project-authorship-pagination.mts";

test("project authorship page path carries status limit and opaque cursor", () => {
  assert.equal(
    projectAuthorshipPagePath("pending", 50, "opaque+/="),
    "/api/v1/admin/project-authorship-relations?status=pending&limit=50&cursor=opaque%2B%2F%3D",
  );
});

test("project authorship page merge preserves queue order without duplicates", () => {
  assert.deepEqual(
    mergeProjectAuthorshipPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]),
    [{ id: "a" }, { id: "b" }, { id: "c" }],
  );
});

test("project authorship panel exposes bounded continuation and request cancellation", async () => {
  const source = await readFile(new URL("../_components/admin-project-authorship-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /nextCursor/);
  assert.match(source, /loadMore/);
  assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /project-authorship-relations\?status=\$\{status\}`/);
});
