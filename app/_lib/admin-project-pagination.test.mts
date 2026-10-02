import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin project workbench consumes scoped cursor pages without totals or offsets", async () => {
  const source = await readFile(new URL("../_components/admin-dashboard-panel.tsx", import.meta.url), "utf8");
  for (const required of ["nextCursor", "hasMore", "projectCursorHistory", 'parameters.set("cursor"']) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["projectOffset", 'parameters = new URLSearchParams({ limit: "40", offset:', "projects.total", "projects.offset"]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
