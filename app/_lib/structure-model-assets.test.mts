import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import test from "node:test";
import * as THREE from "three";
import type { AssetSource } from "../../lib/mcmods-exporter/renderer/types";
import type { StructureBlueprint } from "../../lib/mcmods-exporter/renderer/blueprint";

const rendererDirectory = new URL("../../lib/mcmods-exporter/renderer/", import.meta.url).href;
// Node's test runner requires explicit file extensions for the two bundler imports.
const scene = await readFile(new URL("structureScene.ts", rendererDirectory), "utf8");
const resolvedScene = scene.replace(/from '([^']+)'/g, (_, name: string) => {
  if (name === "three") return `from ${JSON.stringify(import.meta.resolve(name))}`;
  const suffix = name === "./minecraftBlockModel" || name === "./blueprint" ? ".ts" : "";
  return `from ${JSON.stringify(new URL(name + suffix, rendererDirectory).href)}`;
});
const { outputText } = ts.transpileModule(resolvedScene, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildStructureScene, disposeStructureGroup } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const { buildMinecraftBlockModel } = await import(new URL("minecraftBlockModel.ts", rendererDirectory).href);

function assets(files: Record<string, string | object>, textureURLs: Record<string, string>): AssetSource {
  return {
    has: path => Object.hasOwn(files, path) || Object.hasOwn(textureURLs, path),
    json: async <T,>(path: string) => {
      if (!Object.hasOwn(files, path)) throw Error("absent test JSON: " + path);
      return files[path] as T;
    },
    text: async path => {
      const file = files[path];
      if (typeof file !== "string") throw Error("absent test text: " + path);
      return file;
    },
    url: path => textureURLs[path],
  };
}

test("OBJ materials load only indexed textures of materials used by the mesh", async t => {
  const requested: string[] = [];
  t.mock.method(THREE.ImageLoader.prototype, "load", function(this: THREE.ImageLoader, url: string) {
    requested.push(this.manager.resolveURL(url));
    return {} as HTMLImageElement;
  });
  const bundle = assets({
    "assets/test/blockstates/cube.json": { variants: { "": { model: "test:block/sample" } } },
    "assets/test/models/block/sample.json": { loader: "forge:obj", model: "test:block/sample" },
    "assets/test/models/block/sample.obj": "mtllib sample.mtl\nusemtl Front\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3",
    "assets/test/models/block/sample.mtl": [
      "newmtl Front", "Kd 0.5 0.5 0.5", "map_Kd -s 2 3 1 panel front.png",
      "disp missing-displacement.png", "bump missing-bump.png", "map_Ks missing-specular.png",
      "newmtl Unused", "map_Kd extra.png",
    ].join("\n"),
  }, {
    "assets/test/models/block/panel front.png": "blob:front-texture",
    "assets/test/models/block/extra.png": "blob:unused-texture",
  });
  const group = await buildMinecraftBlockModel(bundle, "test:cube");
  try {
    assert.deepEqual(requested, ["blob:front-texture"]);
    const mesh = group.getObjectByProperty("isMesh", true) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
    assert.deepEqual(mesh.material.map?.repeat.toArray(), [2, 3]);
    assert.equal(mesh.material.displacementMap, null);
  } finally {
    disposeStructureGroup(group);
  }
});

test("a fully occluded modeled state creates no fallback block or draw call", async t => {
  t.mock.method(THREE.ImageLoader.prototype, "load", () => ({} as HTMLImageElement));
  const bundle = assets({
    "assets/test/blockstates/panel.json": { variants: { "": { model: "test:block/panel" } } },
    "assets/test/models/block/panel.json": {
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { east: { texture: "test:block/panel", cullface: "east" } } }],
    },
  }, { "assets/test/textures/block/panel.png": "blob:panel" });
  const blueprint: StructureBlueprint = {
    format: "normalized_json", name: "two blocks", size: [2, 1, 1], paletteSize: 2, blockEntityCount: 0, entityCount: 0, warnings: [],
    blocks: [
      { position: [0, 0, 0], state: { id: "test:panel", properties: {} } },
      { position: [1, 0, 0], state: { id: "minecraft:chest", properties: {} } },
    ],
  };
  const visible = await buildStructureScene(bundle, blueprint, undefined, { cullInvisibleFaces: false });
  const culled = await buildStructureScene(bundle, blueprint);
  try {
    assert.equal(visible.modeledStateCount, 2);
    assert.equal(culled.modeledStateCount, 2);
    assert.equal(culled.culledFaceInstances, 1);
    assert.equal(culled.fallbackBlockCount, 0);
    assert.deepEqual(culled.missingStates, []);
    assert.equal(culled.drawCallCount, visible.drawCallCount - 1);
    assert.equal(culled.instanceCount, visible.instanceCount - 1);
  } finally {
    disposeStructureGroup(visible.group);
    disposeStructureGroup(culled.group);
  }
});
