import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChangelogEventAt } from "./changelog-form.mts";

test("empty and invalid changelog times remain recoverable validation failures", () => {
  for (const value of ["", " ", "not-a-date", "2026-99-99T10:00"]) {
    assert.equal(normalizeChangelogEventAt(value), undefined);
  }
});

test("valid changelog time preserves its instant in the API payload", () => {
  assert.equal(normalizeChangelogEventAt("2026-10-02T09:15:00+08:00"), "2026-10-02T01:15:00.000Z");
  const local = "2026-10-02T09:15";
  assert.equal(normalizeChangelogEventAt(local), new Date(local).toISOString());
});
