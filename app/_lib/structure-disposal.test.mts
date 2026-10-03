import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import ts from "typescript";

async function loadSceneModule() {
  const url = new URL("../../lib/mcmods-exporter/renderer/structureScene.ts", import.meta.url);
  const unusedModel = `data:text/javascript,export const buildMinecraftBlockModel=()=>{};export const stateKey=()=>'';`;
  const source = (await readFile(url, "utf8")).replace(/from '([^']+)'/g, (_, name: string) => {
    const resolved = name === "three" ? import.meta.resolve(name)
      : name === "./minecraftBlockModel" || name === "./blueprint" ? unusedModel
      : new URL(name, url).href;
    return `from ${JSON.stringify(resolved)}`;
  });
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("structure disposal releases each real Three instance buffer and shared resources once", async () => {
  const { disposeStructureGroup } = await loadSceneModule();
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const primary = new THREE.InstancedMesh(geometry, material, 2);
  const context = new THREE.InstancedMesh(geometry, material, 1);
  group.add(primary, context);
  const disposed = { primary: 0, context: 0, geometry: 0, material: 0, texture: 0 };
  primary.addEventListener("dispose", () => disposed.primary++);
  context.addEventListener("dispose", () => disposed.context++);
  geometry.addEventListener("dispose", () => disposed.geometry++);
  material.addEventListener("dispose", () => disposed.material++);
  texture.addEventListener("dispose", () => disposed.texture++);
  disposeStructureGroup(group);
  assert.deepEqual(disposed, { primary: 1, context: 1, geometry: 1, material: 1, texture: 1 });
});
