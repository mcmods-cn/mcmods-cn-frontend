import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { datetimeLocalToRFC3339 } from "./ban-end-time.ts";

const panel = readFileSync(new URL("../_components/admin-ban-panel.tsx", import.meta.url), "utf8");

test("an empty ban end remains a permanent-ban null", () => {
  assert.equal(datetimeLocalToRFC3339(""), null);
  assert.equal(datetimeLocalToRFC3339("   "), null);
});

test("a datetime-local value round-trips through RFC3339 in the user's local timezone", () => {
  const encoded = datetimeLocalToRFC3339("2026-08-24T12:34");
  assert.match(encoded || "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);

  const decoded = new Date(encoded || "");
  assert.equal(decoded.getFullYear(), 2026);
  assert.equal(decoded.getMonth(), 7);
  assert.equal(decoded.getDate(), 24);
  assert.equal(decoded.getHours(), 12);
  assert.equal(decoded.getMinutes(), 34);
});

test("invalid calendar values and non-local wire formats are rejected", () => {
  for (const value of ["2026-02-30T12:00", "2026-08-24T25:00", "2026-08-24T12:00Z", "not-a-date"]) {
    assert.throws(() => datetimeLocalToRFC3339(value), RangeError);
  }
});

test("the ban form sends the normalized timestamp instead of the raw control value", () => {
  assert.match(panel, /datetimeLocalToRFC3339\(String\(form\.get\("endsAt"\)\s*\|\|\s*""\)\)/);
  assert.match(panel, /internalNote:\s*form\.get\("internalNote"\),\s*endsAt,?\s*\}\)/);
  assert.match(panel, /admin\.governance\.invalidBanEnd/);
});
