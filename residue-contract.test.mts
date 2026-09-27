import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const siteAffairsSource = readFileSync(
  new URL("./app/_components/site-affairs-pages.tsx", import.meta.url),
  "utf8",
);

test("blackroom status formatter has no unused locale parameter", () => {
  assert.doesNotMatch(siteAffairsSource, /banStatus\(item,\s*locale,\s*t\)/);
  assert.doesNotMatch(siteAffairsSource, /function banStatus\([^)]*locale/);
  assert.match(siteAffairsSource, /banStatus\(item,\s*t\)/);
  assert.match(siteAffairsSource, /function BlackroomListPage\(\) \{\s*const \{ t \} = useI18n\(\)/);
});
