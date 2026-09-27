import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-unresolved-references.tsx", import.meta.url), "utf8");

test("unresolved-reference filters use backend authoritative types", () => {
  assert.match(panel, /unresolved-reference-types/);
  assert.match(panel, /referenceTypes\.map/);
  assert.match(panel, /unresolvedReferenceTypeLabel/);
  assert.doesNotMatch(panel, /\["mod", "minecraft\.item", "minecraft\.enchantment", "tag", "plugin", "server"\]\.map/);
});
