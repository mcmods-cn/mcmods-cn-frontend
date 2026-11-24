import assert from "node:assert/strict";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { readExporterManifest, isAllNamespacesExport } from "./exporter-manifest-preflight.mts";
import { normalizeSimpleProjectCollections } from "./simple-project-normalization.mts";
import { recipeSlotPresentation } from "./recipe-slot-geometry.mts";
import { sameResourceIdentity, resolveSelectedResources, unresolvedPublicID } from "./resource-selection.mts";
import type { CatalogResourceRef } from "./editor-types";

const resource = (kind = "item", registry = "items", id = "minecraft:stone", publicId = "canonical"): CatalogResourceRef => ({ publicId, kind, registry, id, names: {} });

test("TP-008 normalizes null collections for all supported project types and preserves nonempty business arrays", () => {
  for (const projectType of ["plugin", "map", "resource_pack", "shader_pack", "datapack", "addon"]) {
    const gallery = [{ fileId: "owned-file", name: "image" }];
    const result = normalizeSimpleProjectCollections({ projectType, parentProjects: null, galleryImages: gallery, searchKeywords: null, authors: null, license: "MIT" });
    assert.deepEqual(result.parentProjects, []);
    assert.equal(result.galleryImages, gallery);
    assert.deepEqual(result.searchKeywords, []);
    assert.equal(result.license, "MIT");
  }
});

test("RPH-004 composite identity retains identical text in other kinds and tag registries", () => {
  assert.equal(sameResourceIdentity(resource(), resource("block", "blocks")), false);
  assert.equal(sameResourceIdentity(resource("tag", "items"), resource("tag", "fluids")), false);
  assert.equal(sameResourceIdentity(resource(), resource("item", "items", "MINECRAFT:STONE")), true);
  assert.notEqual(unresolvedPublicID("tag", "minecraft:stone", "items"), unresolvedPublicID("tag", "minecraft:stone", "fluids"));
});

test("RPH-005 input mapping resolves aliases despite response order and deduplicates canonical identities", () => {
  const a = { ...resource("item", "items", "alias:first", "input-a"), unresolved: true };
  const b = { ...resource("item", "items", "alias:second", "input-b"), unresolved: true };
  const unknown = { ...resource("item", "items", "alias:unknown", "input-unknown"), unresolved: true };
  const resolved = resolveSelectedResources(new Map([a, b, unknown].map((item) => [item.publicId, item])), [
    { ...resource(), requestedPublicId: "input-b" }, { ...resource(), requestedPublicId: "input-a" },
  ]);
  assert.deepEqual([...resolved.keys()], ["input-unknown", "canonical"]);
});

for (const kind of ["item", "fluid", "gas"]) for (const scale of [1, 2, 0.75]) {
  test(`GR-010 ${kind} preserves independent rect/visual_rect at scale ${scale}`, () => {
    const value = recipeSlotPresentation({ rect: { x: 10, y: 20, width: 24, height: 30 }, visual_rect: { x: 12, y: 25, width: 16, height: 18 } }, { kind }, scale);
    assert.deepEqual(value.style, { left: 10 * scale, top: 20 * scale, width: 24 * scale, height: 30 * scale });
    assert.deepEqual(value.visualStyle, { left: 2 * scale, top: 5 * scale, width: 16 * scale, height: 18 * scale });
  });
}

test("F-003 preflight reads stored/deflated real ZIP manifests without loading asset bytes", async () => {
  for (const level of [0, 6] as const) for (const allNamespaces of [true, false]) {
    const zip = zipSync({ "manifest.json": strToU8(JSON.stringify({ configuration: { all_namespaces: allNamespaces, namespaces: allNamespaces ? [] : ["audit"] } })), "assets/ignored.bin": new Uint8Array(1024) }, { level });
    const blob = new Blob([zip]);
    const manifest = await readExporterManifest(blob);
    assert.equal(isAllNamespacesExport(manifest), allNamespaces);
  }
  assert.equal(await readExporterManifest(new Blob(["invalid zip"])), undefined);
});

test("preflight selects only a root manifest and preserves case-insensitive duplicate handling", async () => {
  const root = strToU8(JSON.stringify({ configuration: { all_namespaces: false } }));
  const nested = { "assets/manifest.json": strToU8(JSON.stringify({ configuration: { all_namespaces: true } })) };
  const read = (files: Record<string, Uint8Array<ArrayBuffer>>) => readExporterManifest(new Blob([zipSync(files)]));
  assert.equal(await read(nested), undefined);
  assert.deepEqual(await read({ ...nested, "MANIFEST.JSON": root }), { configuration: { all_namespaces: false } });
  assert.equal(await read({ "MANIFEST.JSON": root, "manifest.json": root }), undefined);
});
