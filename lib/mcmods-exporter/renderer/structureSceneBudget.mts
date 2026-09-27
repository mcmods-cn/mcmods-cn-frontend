export const structureSceneBudget = Object.freeze({
  maxInstances: 1_500_000,
  maxTrackedBytes: 128 * 1024 * 1024,
  maxDrawCalls: 512,
});

const matrixBufferBytesPerInstance = 16 * Float32Array.BYTES_PER_ELEMENT;
const blockIndexBytesPerInstance = Uint32Array.BYTES_PER_ELEMENT;

export type StructureSceneUsage = {
  blockCount: number;
  instanceCount: number;
  contextCapacity: number;
  layerEntryCount: number;
  drawCallCount: number;
};

export type PackedInstanceLayers = {
  blockIndices: Uint32Array;
  layers: Int32Array;
  offsets: Uint32Array;
  maxContextInstances: number;
};

export type PackedLayerSelection = {
  primaryStart: number;
  primaryEnd: number;
  belowStart: number;
  belowEnd: number;
  aboveStart: number;
  aboveEnd: number;
};

export class StructureSceneBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructureSceneBudgetError";
  }
}

export function structureSceneTrackedBytes(usage: StructureSceneUsage) {
  validateUsage(usage);
  return usage.blockCount * Int32Array.BYTES_PER_ELEMENT
    + (usage.instanceCount + usage.contextCapacity)
      * (matrixBufferBytesPerInstance + blockIndexBytesPerInstance)
    + usage.layerEntryCount * (Int32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT);
}

export function assertStructureSceneUsage(usage: StructureSceneUsage) {
  validateUsage(usage);
  if (usage.instanceCount > structureSceneBudget.maxInstances) {
    throw new StructureSceneBudgetError(
      `Structure instance count ${usage.instanceCount.toLocaleString()} exceeds browser budget ${structureSceneBudget.maxInstances.toLocaleString()}`,
    );
  }
  if (usage.drawCallCount > structureSceneBudget.maxDrawCalls) {
    throw new StructureSceneBudgetError(
      `Structure draw call count ${usage.drawCallCount.toLocaleString()} exceeds browser budget ${structureSceneBudget.maxDrawCalls.toLocaleString()}`,
    );
  }
  const trackedBytes = structureSceneTrackedBytes(usage);
  if (trackedBytes > structureSceneBudget.maxTrackedBytes) {
    throw new StructureSceneBudgetError(
      `Structure instance buffers ${trackedBytes.toLocaleString()} bytes exceed browser budget ${structureSceneBudget.maxTrackedBytes.toLocaleString()} bytes`,
    );
  }
}

export function packInstanceLayers(
  blockIndices: ArrayLike<number>,
  blockLayers: ArrayLike<number>,
  signal?: AbortSignal,
): PackedInstanceLayers {
  const counts = new Map<number, number>();
  for (let position = 0; position < blockIndices.length; position++) {
    if ((position & 2047) === 0) throwIfAborted(signal);
    const blockIndex = blockIndices[position];
    if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex >= blockLayers.length) {
      throw new RangeError(`Invalid structure block index ${String(blockIndex)}`);
    }
    const layer = blockLayers[blockIndex];
    if (!Number.isSafeInteger(layer) || layer < -0x8000_0000 || layer > 0x7fff_ffff) {
      throw new RangeError(`Invalid structure block layer ${String(layer)}`);
    }
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  const layerValues = [...counts.keys()].sort((left, right) => left - right);
  const layers = Int32Array.from(layerValues);
  const offsets = new Uint32Array(layers.length + 1);
  let largest = 0;
  let secondLargest = 0;
  for (let index = 0; index < layers.length; index++) {
    const count = counts.get(layers[index]!) ?? 0;
    offsets[index + 1] = offsets[index]! + count;
    if (count >= largest) {
      secondLargest = largest;
      largest = count;
    } else if (count > secondLargest) {
      secondLargest = count;
    }
  }
  const cursors = offsets.slice(0, layers.length);
  const layerPositions = new Map<number, number>();
  layerValues.forEach((layer, index) => layerPositions.set(layer, index));
  const sorted = new Uint32Array(blockIndices.length);
  for (let position = 0; position < blockIndices.length; position++) {
    if ((position & 2047) === 0) throwIfAborted(signal);
    const blockIndex = blockIndices[position]!;
    const layerPosition = layerPositions.get(blockLayers[blockIndex]!);
    if (layerPosition === undefined) throw new Error("Packed structure layer disappeared");
    sorted[cursors[layerPosition]!] = blockIndex;
    cursors[layerPosition]++;
  }
  return { blockIndices: sorted, layers, offsets, maxContextInstances: largest + secondLargest };
}

export function selectPackedInstanceLayers(
  packed: PackedInstanceLayers,
  minLayer: number,
  maxLayer: number,
  showBelow: boolean,
  showAbove: boolean,
): PackedLayerSelection {
  const lower = Math.min(minLayer, maxLayer);
  const upper = Math.max(minLayer, maxLayer);
  const primaryLayerStart = lowerBound(packed.layers, lower);
  const primaryLayerEnd = upperBound(packed.layers, upper);
  const [belowStart, belowEnd] = showBelow ? exactLayerSlice(packed, lower - 1) : [0, 0];
  const [aboveStart, aboveEnd] = showAbove ? exactLayerSlice(packed, upper + 1) : [0, 0];
  return {
    primaryStart: packed.offsets[primaryLayerStart]!,
    primaryEnd: packed.offsets[primaryLayerEnd]!,
    belowStart,
    belowEnd,
    aboveStart,
    aboveEnd,
  };
}

function exactLayerSlice(packed: PackedInstanceLayers, layer: number): [number, number] {
  const position = lowerBound(packed.layers, layer);
  if (position >= packed.layers.length || packed.layers[position] !== layer) return [0, 0];
  return [packed.offsets[position]!, packed.offsets[position + 1]!];
}

function lowerBound(values: Int32Array, target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(values: Int32Array, target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function validateUsage(usage: StructureSceneUsage) {
  for (const [field, value] of Object.entries(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid ${field}: ${String(value)}`);
  }
}
import { throwIfAborted } from "./structureLoadControl.mts";
