import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadCreatorPage, mergeCreatorPageItems } from "./creator-pagination.mts";

test("creator page loader preserves the complete cursor query contract", async () => {
  let loadedPath = "";
  const page = await loadCreatorPage(async (path) => {
    loadedPath = path;
    return { items: [{ publicId: "creator002" }], hasMore: false, nextCursor: "" };
  }, {
    limit: 40,
    kind: "author",
    query: "  build team  ",
    sort: "name",
    order: "asc",
  }, "opaque-cursor");
  assert.deepEqual(page.items, [{ publicId: "creator002" }]);
  const parameters = new URL(loadedPath, "https://frontend.example.test").searchParams;
  assert.deepEqual(Object.fromEntries(parameters), {
    limit: "40",
    kind: "author",
    query: "build team",
    sort: "name",
    order: "asc",
    cursor: "opaque-cursor",
  });
});

test("creator page merge retains order and suppresses cross-page duplicates", () => {
  assert.deepEqual(mergeCreatorPageItems(
    [{ publicId: "creator001", name: "First" }],
    [{ publicId: "creator001", name: "Duplicate" }, { publicId: "creator002", name: "Second" }],
  ), [
    { publicId: "creator001", name: "First" },
    { publicId: "creator002", name: "Second" },
  ]);
});

test("creator catalog and picker share one cursor pagination boundary", async () => {
  const [catalog, picker, pagination] = await Promise.all([
    readFile(new URL("../_components/creator-catalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/creator-picker.tsx", import.meta.url), "utf8"),
    readFile(new URL("./creator-pagination.mts", import.meta.url), "utf8"),
  ]);
  for (const source of [catalog, picker]) {
    assert.match(source, /loadCreatorPage/);
    assert.match(source, /nextCursor/);
    assert.match(source, /creators\.loadMore/);
  }
  assert.match(pagination, /mergeCreatorPageItems/);
  assert.doesNotMatch(catalog, /limit:\s*"100"/);
  assert.doesNotMatch(picker, /limit:\s*"60"/);
});
