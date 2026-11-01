import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogResourceRef } from "./editor-types";
import { resolveSelectedResources, sameResourceIdentity } from "./resource-selection.mts";

const ref = (kind: string, registry: string, publicId = "known"): CatalogResourceRef => ({
  kind, registry, publicId, id: "audit_rn:shared", names: { "en-US": "Known resource" },
});

test("RPH-004 real namespace DTO hydrates its manual family identity without deleting other kinds", () => {
  for (const [kind, family] of [["minecraft.item", "items"], ["minecraft.block", "blocks"], ["minecraft.fluid", "fluids"]]) {
    const manual = { ...ref(kind, family, "unresolved"), names: {}, unresolved: true };
    const known = ref(kind, "audit_rn");
    assert.equal(sameResourceIdentity(manual, known), true);
    const otherKind = ref(kind === "minecraft.item" ? "minecraft.block" : "minecraft.item", "audit_rn", "other-kind");
    const resolved = resolveSelectedResources(new Map([[manual.publicId, manual], [otherKind.publicId, otherKind]]), [known]);
    assert.deepEqual([...resolved.keys()].sort(), ["known", "other-kind"]);
    assert.deepEqual(resolved.get("known"), known);
    assert.equal(resolved.get("known")?.unresolved, undefined);
  }
});

test("RPH-004 equivalence keeps explicit registries, tag registries, and unknown families separate", () => {
  assert.equal(sameResourceIdentity(ref("minecraft.item", "custom-registry"), ref("minecraft.item", "audit_rn")), false);
  assert.equal(sameResourceIdentity(ref("minecraft.item", ""), ref("minecraft.item", "audit_rn")), false);
  assert.equal(sameResourceIdentity(ref("tag", "minecraft:item"), ref("tag", "minecraft:block")), false);
  assert.equal(sameResourceIdentity(ref("tag", "items"), ref("tag", "audit_rn")), false);
  assert.equal(sameResourceIdentity(ref("extension.unknown", "items"), ref("extension.unknown", "audit_rn")), false);
  assert.equal(sameResourceIdentity(ref("minecraft.item", "items"), ref("minecraft.block", "audit_rn")), false);
  assert.equal(sameResourceIdentity({ ...ref("item", "ITEMS"), id: "AUDIT_RN:SHARED" }, ref("minecraft.item", "audit_rn")), true);
});

for (const [kind, guessedFamily] of [
  ["extension.item_bundle", "items"],
  ["extension.fluid_jar", "fluids"],
  ["minecraft.custom_block", "blocks"],
]) {
  test(`RPH-004 unknown kind ${kind} retains its explicit registry scope`, () => {
    const manual = { ...ref(kind, guessedFamily, "unresolved"), names: {}, unresolved: true };
    const candidate = ref(kind, "audit_rn");
    assert.equal(sameResourceIdentity(manual, candidate), false);
    const selected = new Map([[manual.publicId, manual]]);
    const resolved = resolveSelectedResources(selected, [candidate]);
    assert.equal(resolved, selected);
    assert.equal(resolved.has(candidate.publicId), false);
  });
}
