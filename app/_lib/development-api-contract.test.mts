import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCatalogSortDirection, normalizeCatalogSortField } from "./catalog-sort.ts";

test("catalog sorting accepts only canonical field and direction parameters", () => {
  for (const legacy of ["latest", "oldest", "created", "nameAsc", "nameDesc"]) {
    assert.equal(normalizeCatalogSortField(legacy, "updated"), "updated");
  }
  assert.equal(normalizeCatalogSortField("published", "updated"), "published");
  assert.equal(normalizeCatalogSortDirection(undefined, "desc", "published"), "desc");
  assert.equal(normalizeCatalogSortDirection(undefined, "desc", "name"), "asc");
  assert.equal(normalizeCatalogSortDirection("desc", "asc", "name"), "desc");
});

test("project automation consumes the canonical camelCase response contract directly", async () => {
  const source = await readFile(new URL("../_components/project-auto-update-settings.tsx", import.meta.url), "utf8");
  for (const legacy of [
    "public_id", "update_kind", "source_type", "external_project_id", "external_project_url", "verified_at",
    "interval_code", "next_run_at", "last_run_at", "last_status", "last_error_code", "last_error",
    "license_override", "license_override_reason", "license_override_source", "created_at", "started_at", "finished_at",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${legacy}\\b`));
  }
  assert.match(source, /apiRequest<\{ items: AutomationRun\[\] \}>/);
  assert.match(source, /key=\{run\.id\}/);
});

test("anti-abuse bot-rule writes do not expose an ignored readOnly option", async () => {
  const source = await readFile(new URL("../_components/admin-anti-abuse-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /readOnly\s*:/);
  assert.match(source, /kind: values\.get\("kind"\), label: values\.get\("label"\), matcher: values\.get\("matcher"\), token: values\.get\("botToken"\)/);
});
