import assert from "node:assert/strict";
import test from "node:test";
import { timezoneLabel, timezoneOption } from "./timezones.ts";

test("the timezone choices search the labels and offsets actually displayed on the selected date", () => {
  const dates = [new Date("2026-01-15T12:00:00Z"), new Date("2026-07-15T12:00:00Z")];
  for (const locale of ["en-US", "zh-CN"]) for (const date of dates) {
    for (const zone of ["America/New_York", "Asia/Shanghai", "UTC", "Old/Unknown_Zone"]) {
      const { timezone, name, offset, searchText } = timezoneOption(zone, locale, date);
      assert.equal(timezone, zone);
      assert.equal(timezoneLabel(zone, locale, date), `${name} (${offset})`);
      for (const term of [zone, zone.replaceAll("_", " ").replaceAll("/", " / "), name, offset]) {
        assert.ok(searchText.includes(term.toLocaleLowerCase()));
      }
    }
  }
  assert.notEqual(timezoneOption("America/New_York", "en-US", dates[0]).offset, timezoneOption("America/New_York", "en-US", dates[1]).offset);
});
