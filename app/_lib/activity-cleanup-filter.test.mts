import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseActivityCleanupObjects } from "./activity-cleanup-filter.mts";

test("typed cleanup objects preserve valid IDs and report every malformed entry", () => {
  assert.deepEqual(parseActivityCleanupObjects("mod:abc, broken\n:missing-type\nmod: \n mod: xyz\n"), {
    objects: [{ type: "mod", id: "abc" }, { type: "mod", id: "xyz" }],
    invalidEntries: ["broken", ":missing-type", "mod:"],
  });
  assert.deepEqual(parseActivityCleanupObjects(" ,\n"), { objects: [], invalidEntries: [] });
});

test("the cleanup entry point refuses malformed filters before requesting a preview", async () => {
  const panel = await readFile(new URL("../_components/admin-activity-retention-panel.tsx", import.meta.url), "utf8");
  const preview = panel.slice(panel.indexOf("async function createPreview"), panel.indexOf("async function executeCleanup"));
  assert.ok(preview.indexOf("parsedObjects.invalidEntries.length") < preview.indexOf('"/api/v1/admin/activity-logs/cleanup/preview"'));
  assert.match(preview, /objects:\s*parsedObjects\.objects/);
  assert.match(panel, /previewKey === filterKey/);
});
