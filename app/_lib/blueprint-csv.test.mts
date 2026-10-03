import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell } from "./blueprint-csv.mts";

test("CSV material text cannot become a spreadsheet formula", () => {
  for (const value of ["=1+1", "+SUM(1,2)", "-1+2", "@SUM(1,2)", "  =HYPERLINK(\"https://example.invalid\")", "\tplain", "\rplain", "\nplain", "\uFEFF=1+1"]) {
    assert.equal(csvCell(value), `"'${value.replaceAll('"', '""')}"`);
  }
});

test("CSV quoting preserves normal names, numeric counts and embedded quotes", () => {
  assert.equal(csvCell("minecraft:stone"), '"minecraft:stone"');
  assert.equal(csvCell("64"), '"64"');
  assert.equal(csvCell('Block, "white"\nsecond line'), '"Block, ""white""\nsecond line"');
  assert.equal(csvCell(""), '""');
});
