import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertStructureSceneUsage,
  packInstanceLayers,
  selectPackedInstanceLayers,
  structureSceneTrackedBytes,
} from "../../lib/mcmods-exporter/renderer/structureSceneBudget.mts";

test("instance layers keep one compact block index and expose contiguous layer slices", () => {
  const layers = Int32Array.from([4, 2, 3, 2, 5, 3, 3]);
  const packed = packInstanceLayers(Uint32Array.from([0, 1, 2, 3, 4, 5, 6]), layers);
  assert.deepEqual([...packed.blockIndices], [1, 3, 2, 5, 6, 0, 4]);
  assert.deepEqual([...packed.layers], [2, 3, 4, 5]);
  assert.deepEqual([...packed.offsets], [0, 2, 5, 6, 7]);
  assert.equal(packed.maxContextInstances, 5);

  const selection = selectPackedInstanceLayers(packed, 3, 3, true, true);
  assert.deepEqual([...packed.blockIndices.subarray(selection.primaryStart, selection.primaryEnd)], [2, 5, 6]);
  assert.deepEqual([...packed.blockIndices.subarray(selection.belowStart, selection.belowEnd)], [1, 3]);
  assert.deepEqual([...packed.blockIndices.subarray(selection.aboveStart, selection.aboveEnd)], [0]);
});

test("joint browser budget rejects a sparse six-face 600k structure", () => {
  const sparseCube = {
    blockCount: 600_000,
    instanceCount: 3_600_000,
    contextCapacity: 0,
    layerEntryCount: 6,
    drawCallCount: 6,
  };
  assert.throws(() => assertStructureSceneUsage(sparseCube), /instance/i);
  assert.doesNotThrow(() => assertStructureSceneUsage({
    ...sparseCube,
    instanceCount: 600_000,
    contextCapacity: 6_000,
    layerEntryCount: 200,
    drawCallCount: 1,
  }));
  assert.throws(() => assertStructureSceneUsage({
    ...sparseCube,
    instanceCount: 1,
    drawCallCount: 513,
  }), /draw call/i);
  assert.ok(structureSceneTrackedBytes({
    ...sparseCube,
    instanceCount: 600_000,
    contextCapacity: 6_000,
    layerEntryCount: 200,
    drawCallCount: 1,
  }) < 128 * 1024 * 1024);
});

test("600k layer index stays compact and layer selection does not scan the full scene", () => {
  const count = 600_000;
  const blockIndices = new Uint32Array(count);
  const blockLayers = new Int32Array(count);
  for (let index = 0; index < count; index++) {
    blockIndices[index] = index;
    blockLayers[index] = index % 200;
  }
  const started = performance.now();
  const packed = packInstanceLayers(blockIndices, blockLayers);
  const elapsed = performance.now() - started;
  const selection = selectPackedInstanceLayers(packed, 100, 100, true, true);
  const touched = selection.primaryEnd - selection.primaryStart
    + selection.belowEnd - selection.belowStart
    + selection.aboveEnd - selection.aboveStart;
  assert.equal(touched, 9_000);
  assert.ok(touched < count / 50);
  assert.ok(packed.blockIndices.byteLength + packed.layers.byteLength + packed.offsets.byteLength < 2_500_000);
  assert.ok(elapsed < 10_000, `packing took ${elapsed.toFixed(1)}ms`);
});

test("renderer source has no per-face block arrays or Matrix4 clones", async () => {
  const scene = await readFile(new URL("../../lib/mcmods-exporter/renderer/structureScene.ts", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../../lib/mcmods-exporter/renderer/StructureRenderer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(scene, /matrix\.clone\(\)/);
  assert.doesNotMatch(scene, /blueprintMatrices/);
  assert.doesNotMatch(scene, /blueprintBlocks\s*=\s*(visibleBlocks|blocks)/);
  assert.doesNotMatch(renderer, /blocks\.forEach\(\(block, index\)/);
  assert.match(scene, /packInstanceLayers/);
  assert.match(renderer, /setStructureMeshLayerView/);
});
