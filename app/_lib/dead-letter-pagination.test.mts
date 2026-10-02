import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("NATS operations panel consumes filtered dead-letter cursor pages", async () => {
  const source = await readFile(new URL("../_components/admin-dead-letter-panel.tsx", import.meta.url), "utf8");
  for (const required of [
    "/api/v1/admin/infrastructure/dead-letters", "nextCursor", "hasMore", "cursorHistory",
    'parameters.set("status"', 'parameters.set("aggregateType"', 'parameters.set("aggregateId"',
    "/replay",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["offset", "page=", "limit=100"]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
