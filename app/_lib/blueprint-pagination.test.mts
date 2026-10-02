import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadBlueprintPage, mergeBlueprintPageItems } from "./blueprint-pagination.mts";

test("blueprint page loader preserves filters, ordering, and opaque cursor", async () => {
  let loadedPath = "";
  const page = await loadBlueprintPage(async (path) => {
    loadedPath = path;
    return { items: [{ id: "blueprint002" }], hasMore: false, nextCursor: "" };
  }, {
    limit: 36,
    query: "  red castle  ",
    sort: "name",
    order: "asc",
  }, "opaque-cursor");
  assert.deepEqual(page.items, [{ id: "blueprint002" }]);
  assert.deepEqual(Object.fromEntries(new URL(loadedPath, "https://frontend.example.test").searchParams), {
    limit: "36",
    q: "red castle",
    sort: "name",
    order: "asc",
    cursor: "opaque-cursor",
  });
});

test("blueprint page merge retains order and suppresses cross-page duplicates", () => {
  assert.deepEqual(mergeBlueprintPageItems(
    [{ id: "blueprint001", title: "First" }],
    [{ id: "blueprint001", title: "Duplicate" }, { id: "blueprint002", title: "Second" }],
  ), [
    { id: "blueprint001", title: "First" },
    { id: "blueprint002", title: "Second" },
  ]);
});

test("blueprint library exposes one abortable cursor boundary and no fixed window", async () => {
  const [component, pagination] = await Promise.all([
    readFile(new URL("../_components/blueprint-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("./blueprint-pagination.mts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /loadBlueprintPage/);
  assert.match(component, /mergeBlueprintPageItems/);
  assert.match(component, /requestGeneration/);
  assert.match(component, /AbortController/);
  assert.match(component, /nextCursor/);
  assert.match(component, /blueprints\.loadMore/);
  assert.match(pagination, /cursor/);
  assert.doesNotMatch(component, /limit:\s*"60"/);
  assert.doesNotMatch(component, /offset/);
});
