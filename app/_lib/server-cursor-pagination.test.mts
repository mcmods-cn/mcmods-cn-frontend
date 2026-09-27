import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadCompositeProjectPage } from "./project-resource-pagination.mts";
import { loadServerCursorPage, mergeServerCursorItems } from "./server-cursor-pagination.mts";

test("server catalog and project picker no longer emit legacy page/count pagination", async () => {
  const [catalog, api, picker] = await Promise.all([
    readFile(new URL("../_components/server-catalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("./server-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/editor/mod-resource-picker.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(catalog, /CatalogPagination/);
  assert.doesNotMatch(catalog, /result\?\.total|result\.total|result\.page|result\.pages/);
  assert.match(catalog, /nextCursor/);
  assert.match(catalog, /loadMore/);
  assert.doesNotMatch(api, /\btotal:\s*number|\bpage:\s*number|\bpages:\s*number/);
  assert.match(api, /hasMore:\s*boolean/);
  assert.match(api, /nextCursor:\s*string/);
  assert.doesNotMatch(picker, /parameters\.set\("page"/);
  assert.doesNotMatch(picker, /counts\s*=\s*await\s+Promise\.all/);
  assert.match(picker, /options\.cursor/);
});

test("server page loader strips legacy navigation and preserves the opaque cursor", async () => {
  let loadedPath = "";
  const page = await loadServerCursorPage(async (path) => {
    loadedPath = path;
    return { items: [{ id: "server002" }], limit: 40, hasMore: false, nextCursor: "" };
  }, new URLSearchParams("q=forge&page=9999&offset=60&cursor=stale&size=20&mods=create"), {
    sort: "heat",
    order: "desc",
    limit: 40,
  }, "opaque-next");
  assert.deepEqual(page.items, [{ id: "server002" }]);
  assert.deepEqual(Object.fromEntries(new URL(loadedPath, "https://frontend.example.test").searchParams), {
    q: "forge",
    mods: "create",
    sort: "heat",
    order: "desc",
    limit: "40",
    cursor: "opaque-next",
  });
  assert.deepEqual(mergeServerCursorItems(
    [{ id: "server001", name: "First" }],
    [{ id: "server001", name: "Duplicate" }, { id: "server002", name: "Second" }],
  ), [
    { id: "server001", name: "First" },
    { id: "server002", name: "Second" },
  ]);
});

test("mixed project picker advances legacy offsets and server cursors without count preflights", async () => {
  const calls: Array<{ type: string; limit: number; offset: number; cursor: string }> = [];
  const fetchPage = async (type: string, limit: number, offset: number, cursor: string) => {
    calls.push({ type, limit, offset, cursor });
    if (type === "mod") {
      const items = ["m1", "m2", "m3"].slice(offset, offset + limit).map((id) => ({ id }));
      return { items, total: 3 };
    }
    if (!cursor) return { items: [{ id: "s1" }], hasMore: true, nextCursor: "server-next" };
    return { items: [{ id: "s2" }], hasMore: false, nextCursor: "" };
  };
  const first = await loadCompositeProjectPage(["mod", "minecraft_server"], "query-scope", 2, "", fetchPage);
  assert.deepEqual(first.items, [{ id: "m1" }, { id: "m2" }]);
  assert.equal(first.hasMore, true);
  const second = await loadCompositeProjectPage(["mod", "minecraft_server"], "query-scope", 2, first.nextCursor, fetchPage);
  assert.deepEqual(second.items, [{ id: "m3" }, { id: "s1" }]);
  assert.equal(second.hasMore, true);
  const third = await loadCompositeProjectPage(["mod", "minecraft_server"], "query-scope", 2, second.nextCursor, fetchPage);
  assert.deepEqual(third.items, [{ id: "s2" }]);
  assert.equal(third.hasMore, false);
  assert.deepEqual(calls, [
    { type: "mod", limit: 2, offset: 0, cursor: "" },
    { type: "mod", limit: 2, offset: 2, cursor: "" },
    { type: "minecraft_server", limit: 1, offset: 0, cursor: "" },
    { type: "minecraft_server", limit: 2, offset: 0, cursor: "server-next" },
  ]);
  await assert.rejects(
    () => loadCompositeProjectPage(["mod", "minecraft_server"], "different-scope", 2, first.nextCursor, fetchPage),
    /invalid project picker cursor/,
  );
});
