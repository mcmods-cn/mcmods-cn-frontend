import * as THREE from 'three'
import { buildMinecraftBlockModel } from './minecraftBlockModel'
import { stateKey, type BlueprintBlock, type BlueprintState, type StructureBlueprint } from './blueprint'
import {
  assertStructureSceneUsage,
  packInstanceLayers,
  selectPackedInstanceLayers,
  structureSceneTrackedBytes,
  type PackedInstanceLayers,
  type StructureSceneUsage,
} from './structureSceneBudget.mts'
import type { AssetSource } from './types'
import { abortReason, isAbortError, throwIfAborted } from './structureLoadControl.mts'

const modelLoadConcurrency = 6

export interface StructureSceneResult {
  group: THREE.Group
  modeledStateCount: number
  fallbackStateCount: number
  fallbackBlockCount: number
  cullableFaceInstances: number
  renderedCullableFaceInstances: number
  culledFaceInstances: number
  drawCallCount: number
  instanceCount: number
  contextCapacity: number
  trackedInstanceBytes: number
  missingStates: Array<{ state: string; reason: string; blocks: number }>
}

export interface StructureSceneOptions {
  cullInvisibleFaces?: boolean
  signal?: AbortSignal
}

export async function buildStructureScene(
  bundle: AssetSource,
  blueprint: StructureBlueprint,
  onProgress?: (finished: number, total: number, state: string) => void,
  options: StructureSceneOptions = {},
): Promise<StructureSceneResult> {
  const signal = options.signal
  throwIfAborted(signal)
  const stateGroups = new Map<string, { state: BlueprintState; blockIndices: number[] }>()
  const blockLayers = new Int32Array(blueprint.blocks.length)
  for (let blockIndex = 0; blockIndex < blueprint.blocks.length; blockIndex++) {
    abortCheckpoint(signal, blockIndex)
    const block = blueprint.blocks[blockIndex]!
    blockLayers[blockIndex] = block.position[1]
    const key = stateKey(block.state)
    const group = stateGroups.get(key) ?? { state: block.state, blockIndices: [] }
    group.blockIndices.push(blockIndex)
    stateGroups.set(key, group)
  }

  const result = new THREE.Group()
  result.name = blueprint.name
  const missingStates: StructureSceneResult['missingStates'] = []
  let modeledStateCount = 0
  let fallbackStateCount = 0
  let fallbackBlockCount = 0
  let cullableFaceInstances = 0
  let renderedCullableFaceInstances = 0
  let culledFaceInstances = 0
  let drawCallCount = 0
  let usage: StructureSceneUsage = {
    blockCount: blueprint.blocks.length,
    instanceCount: 0,
    contextCapacity: 0,
    layerEntryCount: 0,
    drawCallCount: 0,
  }
  let finished = 0

  const entries = Array.from(stateGroups.entries())
  const occupied = new Set<number>()
  for (let blockIndex = 0; blockIndex < blueprint.blocks.length; blockIndex++) {
    abortCheckpoint(signal, blockIndex)
    const block = blueprint.blocks[blockIndex]!
    const key = packedPositionKey(block.position[0], block.position[1], block.position[2], blueprint.size)
    if (key !== undefined) occupied.add(key)
  }
  let cursor = 0
  const loadNext = async () => {
    while (cursor < entries.length) {
      throwIfAborted(signal)
      const entry = entries[cursor++]
      if (!entry) return
      const [key, stateGroup] = entry
      onProgress?.(finished, entries.length, key)
      let prototype: THREE.Group | undefined
      try {
        prototype = await buildMinecraftBlockModel(bundle, stateGroup.state.id, stateGroup.state.properties, undefined, signal)
        throwIfAborted(signal)
        const stats = addPrototypeInstances(
          result,
          prototype,
          blueprint,
          stateGroup.blockIndices,
          blockLayers,
          key,
          occupied,
          usage,
          options.cullInvisibleFaces !== false,
          signal,
        )
        cullableFaceInstances += stats.cullableFaceInstances
        renderedCullableFaceInstances += stats.renderedCullableFaceInstances
        culledFaceInstances += stats.culledFaceInstances
        drawCallCount += stats.drawCallCount
        usage = addInstanceUsage(usage, stats)
        modeledStateCount++
      } catch (error) {
        if (prototype) disposeStructureGroup(prototype)
        if (isAbortError(error)) throw error
        const reason = error instanceof Error ? error.message : String(error)
        const stats = addFallbackInstances(result, stateGroup.state, blueprint, stateGroup.blockIndices, blockLayers, key, usage, signal)
        usage = addInstanceUsage(usage, stats)
        missingStates.push({ state: key, reason, blocks: stateGroup.blockIndices.length })
        fallbackStateCount++
        fallbackBlockCount += stateGroup.blockIndices.length
        drawCallCount++
      }
      finished++
      onProgress?.(finished, entries.length, key)
      if (finished % 12 === 0) await nextFrame(signal)
    }
  }
  try {
    const outcomes = await Promise.allSettled(Array.from(
      { length: Math.min(modelLoadConcurrency, entries.length) },
      () => loadNext(),
    ))
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    if (rejected) throw rejected.reason
    throwIfAborted(signal)
  } catch (error) {
    disposeStructureGroup(result)
    throw error
  }

  return {
    group: result,
    modeledStateCount,
    fallbackStateCount,
    fallbackBlockCount,
    cullableFaceInstances,
    renderedCullableFaceInstances,
    culledFaceInstances,
    drawCallCount,
    instanceCount: usage.instanceCount,
    contextCapacity: usage.contextCapacity,
    trackedInstanceBytes: structureSceneTrackedBytes(usage),
    missingStates,
  }
}

interface PrototypeInstanceStats {
  cullableFaceInstances: number
  renderedCullableFaceInstances: number
  culledFaceInstances: number
  drawCallCount: number
  instanceCount: number
  contextCapacity: number
  layerEntryCount: number
}

function addPrototypeInstances(
  target: THREE.Group,
  prototype: THREE.Group,
  blueprint: StructureBlueprint,
  blockIndices: number[],
  blockLayers: Int32Array,
  key: string,
  occupied: Set<number>,
  usage: StructureSceneUsage,
  cullInvisibleFaces: boolean,
  signal?: AbortSignal,
): PrototypeInstanceStats {
  throwIfAborted(signal)
  prototype.scale.setScalar(1 / 16)
  prototype.updateMatrixWorld(true)
  let cullableFaceInstances = 0
  let renderedCullableFaceInstances = 0
  let culledFaceInstances = 0
  let pendingInstanceCount = 0
  const parts: Array<{ object: THREE.Mesh; packed: PackedInstanceLayers }> = []
  prototype.traverse((object) => {
    throwIfAborted(signal)
    if (!(object instanceof THREE.Mesh) || !object.visible) return
    const cullable = Boolean(object.userData.cullFace)
    const neighborOffset = cullInvisibleFaces && cullable ? cullingNeighborOffset(object) : undefined
    let visibleBlockIndices = blockIndices
    if (neighborOffset) {
      visibleBlockIndices = []
      for (let position = 0; position < blockIndices.length; position++) {
        abortCheckpoint(signal, position)
        const blockIndex = blockIndices[position]!
        if (!hasCullingNeighbor(blueprint.blocks[blockIndex]!, neighborOffset, occupied, blueprint.size)) {
          visibleBlockIndices.push(blockIndex)
        }
      }
    }
    if (cullable) {
      cullableFaceInstances += blockIndices.length
      renderedCullableFaceInstances += visibleBlockIndices.length
      culledFaceInstances += blockIndices.length - visibleBlockIndices.length
    }
    if (!visibleBlockIndices.length) return
    assertStructureSceneUsage({
      ...usage,
      instanceCount: usage.instanceCount + pendingInstanceCount + visibleBlockIndices.length,
      drawCallCount: usage.drawCallCount + parts.length + 1,
    })
    parts.push({ object, packed: packInstanceLayers(visibleBlockIndices, blockLayers, signal) })
    pendingInstanceCount += visibleBlockIndices.length
  })
  if (!parts.length) throw new Error('方块模型没有可实例化 Mesh')
  const stats = instanceStats(cullableFaceInstances, renderedCullableFaceInstances, culledFaceInstances, parts.map((part) => part.packed))
  assertStructureSceneUsage(addInstanceUsage(usage, stats))
  for (let index = 0; index < parts.length; index++) {
    throwIfAborted(signal)
    const { object, packed } = parts[index]!
    const mesh = createStructureInstancedMesh(
      object.geometry,
      object.material,
      blueprint.blocks,
      packed,
      object.matrixWorld,
      `${key}#${index}`,
      signal,
    )
    target.add(mesh)
  }
  return stats
}

function hasCullingNeighbor(
  block: BlueprintBlock,
  offset: [number, number, number],
  occupied: Set<number>,
  size: [number, number, number],
) {
  const neighbor = packedPositionKey(
    block.position[0] + offset[0],
    block.position[1] + offset[1],
    block.position[2] + offset[2],
    size,
  )
  return neighbor !== undefined && occupied.has(neighbor)
}

function cullingNeighborOffset(object: THREE.Object3D): [number, number, number] | undefined {
  const normal = directionVector(String(object.userData.cullFace))
  if (!normal) return undefined
  object.getWorldQuaternion(tempQuaternion)
  normal.applyQuaternion(tempQuaternion)
  const dx = Math.abs(normal.x) > 0.9 ? Math.sign(normal.x) : 0
  const dy = Math.abs(normal.y) > 0.9 ? Math.sign(normal.y) : 0
  const dz = Math.abs(normal.z) > 0.9 ? Math.sign(normal.z) : 0
  return Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1 ? [dx, dy, dz] : undefined
}

const tempQuaternion = new THREE.Quaternion()
function directionVector(direction: string) {
  switch (direction) {
    case 'down': return new THREE.Vector3(0, -1, 0)
    case 'up': return new THREE.Vector3(0, 1, 0)
    case 'north': return new THREE.Vector3(0, 0, -1)
    case 'south': return new THREE.Vector3(0, 0, 1)
    case 'west': return new THREE.Vector3(-1, 0, 0)
    case 'east': return new THREE.Vector3(1, 0, 0)
    default: return undefined
  }
}

function addFallbackInstances(
  target: THREE.Group,
  state: BlueprintState,
  blueprint: StructureBlueprint,
  blockIndices: number[],
  blockLayers: Int32Array,
  key: string,
  usage: StructureSceneUsage,
  signal?: AbortSignal,
): PrototypeInstanceStats {
  throwIfAborted(signal)
  const packed = packInstanceLayers(blockIndices, blockLayers, signal)
  const stats = instanceStats(0, 0, 0, [packed])
  assertStructureSceneUsage(addInstanceUsage(usage, stats))
  const fluid = state.id.includes('water') || state.id.includes('lava') || state.id.includes('fluid')
  const material = new THREE.MeshStandardMaterial({
    color: fallbackColor(state.id),
    roughness: fluid ? 0.25 : 0.82,
    metalness: fluid ? 0.05 : 0,
    transparent: fluid,
    opacity: fluid ? 0.68 : 1,
    depthWrite: !fluid,
  })
  const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94)
  const mesh = createStructureInstancedMesh(geometry, material, blueprint.blocks, packed, identityMatrix, `${key}#fallback`, signal)
  mesh.userData.fallback = true
  target.add(mesh)
  return stats
}

interface StructureMeshInstanceData {
  packed: PackedInstanceLayers
  prototypeMatrix: THREE.Matrix4
  contextBlockIndices: Uint32Array
  contextMesh?: THREE.InstancedMesh
  viewKey: string
}

const identityMatrix = new THREE.Matrix4()

function createStructureInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  blocks: BlueprintBlock[],
  packed: PackedInstanceLayers,
  prototypeMatrix: THREE.Matrix4,
  name: string,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const mesh = new THREE.InstancedMesh(geometry, material, packed.blockIndices.length)
  mesh.name = name
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const data: StructureMeshInstanceData = {
    packed,
    prototypeMatrix: prototypeMatrix.clone(),
    contextBlockIndices: new Uint32Array(packed.maxContextInstances),
    viewKey: 'visible',
  }
  mesh.userData.structureInstanceData = data
  mesh.userData.structureActiveBlockIndices = packed.blockIndices
  writeBlockInstances(mesh, blocks, packed.blockIndices, data.prototypeMatrix, signal)
  updateInstanceBounds(mesh)
  return mesh
}

export function setStructureMeshLayerView(
  mesh: THREE.InstancedMesh,
  blocks: BlueprintBlock[],
  minLayer: number,
  maxLayer: number,
  outsideMode: 'visible' | 'transparent' | 'hidden',
  showBelow: boolean,
  showAbove: boolean,
) {
  const data = mesh.userData.structureInstanceData as StructureMeshInstanceData | undefined
  if (!data) return
  const viewKey = outsideMode === 'visible'
    ? 'visible'
    : `${outsideMode}:${Math.min(minLayer, maxLayer)}:${Math.max(minLayer, maxLayer)}:${showBelow}:${showAbove}`
  if (data.viewKey === viewKey) return
  if (outsideMode === 'visible') {
    writeBlockInstances(mesh, blocks, data.packed.blockIndices, data.prototypeMatrix)
    mesh.userData.structureActiveBlockIndices = data.packed.blockIndices
    updateInstanceBounds(mesh)
    clearContextMesh(data)
    data.viewKey = viewKey
    return
  }

  const selection = selectPackedInstanceLayers(data.packed, minLayer, maxLayer, showBelow, showAbove)
  const primary = data.packed.blockIndices.subarray(selection.primaryStart, selection.primaryEnd)
  writeBlockInstances(mesh, blocks, primary, data.prototypeMatrix)
  mesh.userData.structureActiveBlockIndices = primary
  updateInstanceBounds(mesh)

  if (outsideMode === 'transparent') {
    const below = data.packed.blockIndices.subarray(selection.belowStart, selection.belowEnd)
    const above = data.packed.blockIndices.subarray(selection.aboveStart, selection.aboveEnd)
    const contextCount = below.length + above.length
    if (contextCount > data.contextBlockIndices.length) throw new Error('Structure context layer capacity was underestimated')
    data.contextBlockIndices.set(below, 0)
    data.contextBlockIndices.set(above, below.length)
    if (contextCount) {
      const context = ensureContextMesh(mesh, data)
      const active = data.contextBlockIndices.subarray(0, contextCount)
      writeBlockInstances(context, blocks, active, data.prototypeMatrix)
      context.userData.structureActiveBlockIndices = active
      updateInstanceBounds(context)
    } else {
      clearContextMesh(data)
    }
  } else {
    clearContextMesh(data)
  }
  data.viewKey = viewKey
}

export function structureBlockAtInstance(mesh: THREE.InstancedMesh, instanceID: number, blocks: BlueprintBlock[]) {
  const indices = mesh.userData.structureActiveBlockIndices as Uint32Array | undefined
  const blockIndex = indices?.[instanceID]
  return blockIndex === undefined ? undefined : blocks[blockIndex]
}

function ensureContextMesh(mesh: THREE.InstancedMesh, data: StructureMeshInstanceData) {
  if (data.contextMesh) return data.contextMesh
  const context = new THREE.InstancedMesh(mesh.geometry, transparentMaterial(mesh.material), data.contextBlockIndices.length)
  context.name = `${mesh.name}#layer-context`
  context.userData.layerContext = true
  context.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.parent?.add(context)
  data.contextMesh = context
  return context
}

function clearContextMesh(data: StructureMeshInstanceData) {
  if (!data.contextMesh) return
  data.contextMesh.count = 0
  data.contextMesh.userData.structureActiveBlockIndices = emptyBlockIndices
  data.contextMesh.instanceMatrix.needsUpdate = true
}

const emptyBlockIndices = new Uint32Array(0)

function writeBlockInstances(
  mesh: THREE.InstancedMesh,
  blocks: BlueprintBlock[],
  blockIndices: Uint32Array,
  prototypeMatrix: THREE.Matrix4,
  signal?: AbortSignal,
) {
  const translation = new THREE.Matrix4()
  const matrix = new THREE.Matrix4()
  for (let instanceIndex = 0; instanceIndex < blockIndices.length; instanceIndex++) {
    abortCheckpoint(signal, instanceIndex)
    const block = blocks[blockIndices[instanceIndex]!]!
    translation.makeTranslation(block.position[0] + 0.5, block.position[1] + 0.5, block.position[2] + 0.5)
    matrix.multiplyMatrices(translation, prototypeMatrix)
    mesh.setMatrixAt(instanceIndex, matrix)
  }
  mesh.count = blockIndices.length
  mesh.instanceMatrix.needsUpdate = true
}

function updateInstanceBounds(mesh: THREE.InstancedMesh) {
  if (!mesh.count) return
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
}

function instanceStats(
  cullableFaceInstances: number,
  renderedCullableFaceInstances: number,
  culledFaceInstances: number,
  packed: PackedInstanceLayers[],
): PrototypeInstanceStats {
  return {
    cullableFaceInstances,
    renderedCullableFaceInstances,
    culledFaceInstances,
    drawCallCount: packed.length,
    instanceCount: packed.reduce((total, item) => total + item.blockIndices.length, 0),
    contextCapacity: packed.reduce((total, item) => total + item.maxContextInstances, 0),
    layerEntryCount: packed.reduce((total, item) => total + item.layers.length, 0),
  }
}

function addInstanceUsage(usage: StructureSceneUsage, stats: PrototypeInstanceStats): StructureSceneUsage {
  return {
    blockCount: usage.blockCount,
    instanceCount: usage.instanceCount + stats.instanceCount,
    contextCapacity: usage.contextCapacity + stats.contextCapacity,
    layerEntryCount: usage.layerEntryCount + stats.layerEntryCount,
    drawCallCount: usage.drawCallCount + stats.drawCallCount,
  }
}

function packedPositionKey(x: number, y: number, z: number, size: [number, number, number]) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)
    || x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) {
    return undefined
  }
  return x + size[0] * (z + size[2] * y)
}

function transparentMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  const clone = (entry: THREE.Material) => {
    const result = entry.clone()
    result.transparent = true
    result.opacity = 0.16
    result.depthWrite = false
    // Layer context is translucent even when the source PNG is fully opaque.
    result.forceSinglePass = false
    return result
  }
  return Array.isArray(material) ? material.map(clone) : clone(material)
}

function fallbackColor(id: string): THREE.Color {
  if (id.includes('water')) return new THREE.Color('#3978c7')
  if (id.includes('lava')) return new THREE.Color('#ef6a19')
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return new THREE.Color().setHSL(((hash >>> 0) % 360) / 360, 0.32, 0.48)
}

export function disposeStructureGroup(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object instanceof THREE.InstancedMesh) object.dispose()
    geometries.add(object.geometry)
    const entries = Array.isArray(object.material) ? object.material : [object.material]
    entries.forEach((material) => {
      materials.add(material)
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value)
      })
    })
  })
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
  geometries.forEach((geometry) => geometry.dispose())
}

function abortCheckpoint(signal: AbortSignal | undefined, position: number) {
  if ((position & 2047) === 0) throwIfAborted(signal)
}

function nextFrame(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cancelAnimationFrame(frame)
      reject(abortReason(signal!, 'Structure scene build was cancelled'))
    }
    const frame = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}
