import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeServerReviewPage, serverReviewPagePath } from "./server-review-pagination.mts";

test("server review page path carries status limit and opaque cursor", () => {
  assert.equal(
    serverReviewPagePath("pending", 50, "opaque+/="),
    "/api/v1/admin/server-reviews?status=pending&limit=50&cursor=opaque%2B%2F%3D",
  );
});

test("server review page merge preserves queue order without duplicates", () => {
  assert.deepEqual(
    mergeServerReviewPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]),
    [{ id: "a" }, { id: "b" }, { id: "c" }],
  );
});

test("the server review panel exposes bounded continuation and request cancellation", async () => {
  const source = await readFile(new URL("../_components/admin-server-panels.tsx", import.meta.url), "utf8");
  assert.match(source, /nextCursor/);
  assert.match(source, /loadMore/);
  assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /server-reviews\?status=\$\{status\}`/);
});

test("the server review queue loads full bodies and associations only on demand", async () => {
  const source = await readFile(new URL("../_components/admin-server-panels.tsx", import.meta.url), "utf8");
  const summaryStart = source.indexOf("type ServerReviewSummary");
  const detailStart = source.indexOf("type ServerReviewDetail");
  assert.ok(summaryStart >= 0 && detailStart > summaryStart, "summary and detail DTOs must be separate");
  const summary = source.slice(summaryStart, detailStart);
  assert.doesNotMatch(summary, /bodyMarkdown|proofText|proofFiles|links:|mods:/);
  assert.match(summary, /proofFileCount: number/);
  assert.match(summary, /linkCount: number/);
  assert.match(summary, /modCount: number/);
  assert.match(source, /function toggleDetails/);
  assert.match(source, /apiRequest<ServerReviewDetail>\(`\/api\/v1\/admin\/server-reviews\/\$\{item\.id\}`/);
  assert.match(source, /detail\.bodyMarkdown/);
});
