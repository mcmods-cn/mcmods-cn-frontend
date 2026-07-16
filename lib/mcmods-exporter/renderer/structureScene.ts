import * as THREE from 'three'
import { buildMinecraftBlockModel } from './minecraftBlockModel'
import { stateKey, type BlueprintBlock, type BlueprintState, type StructureBlueprint } from './blueprint'
import type { AssetSource } from './types'

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
  missingStates: Array<{ state: string; reason: string; blocks: number }>
}

export interface StructureSceneOptions {
  cullInvisibleFaces?: boolean
}

export async function buildStructureScene(
  bundle: AssetSource,
  blueprint: StructureBlueprint,
  onProgress?: (finished: number, total: number, state: string) => void,
  options: StructureSceneOptions = {},
): Promise<StructureSceneResult> {
  const stateGroups = new Map<string, { state: BlueprintState; blocks: BlueprintBlock[] }>()
  for (const block of blueprint.blocks) {
    const key = stateKey(block.state)
    const group = stateGroups.get(key) ?? { state: block.state, blocks: [] }
    group.blocks.push(block)
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
  let finished = 0

  const entries = Array.from(stateGroups.entries())
  const occupied = new Set(blueprint.blocks.map((block) => block.position.join(',')))
  let cursor = 0
  const loadNext = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++]
      if (!entry) return
      const [key, stateGroup] = entry
      onProgress?.(finished, entries.length, key)
      try {
        const prototype = await buildMinecraftBlockModel(bundle, stateGroup.state.id, stateGroup.state.properties)
        const stats = addPrototypeInstances(result, prototype, stateGroup.blocks, key, occupied, options.cullInvisibleFaces !== false)
        cullableFaceInstances += stats.cullableFaceInstances
        renderedCullableFaceInstances += stats.renderedCullableFaceInstances
        culledFaceInstances += stats.culledFaceInstances
        drawCallCount += stats.drawCallCount
        modeledStateCount++
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        addFallbackInstances(result, stateGroup.state, stateGroup.blocks, key)
        missingStates.push({ state: key, reason, blocks: stateGroup.blocks.length })
        fallbackStateCount++
        fallbackBlockCount += stateGroup.blocks.length
        drawCallCount++
      }
      finished++
      onProgress?.(finished, entries.length, key)
      if (finished % 12 === 0) await nextFrame()
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(modelLoadConcurrency, entries.length) },
    () => loadNext(),
  ))

  return {
    group: result,
    modeledStateCount,
    fallbackStateCount,
    fallbackBlockCount,
    cullableFaceInstances,
    renderedCullableFaceInstances,
    culledFaceInstances,
    drawCallCount,
    missingStates,
  }
}

interface PrototypeInstanceStats {
  cullableFaceInstances: number
  renderedCullableFaceInstances: number
  culledFaceInstances: number
  drawCallCount: number
}

function addPrototypeInstances(
  target: THREE.Group,
  prototype: THREE.Group,
  blocks: BlueprintBlock[],
  key: string,
  occupied: Set<string>,
  cullInvisibleFaces: boolean,
): PrototypeInstanceStats {
  prototype.scale.setScalar(1 / 16)
  prototype.updateMatrixWorld(true)
  let meshCount = 0
  let cullableFaceInstances = 0
  let renderedCullableFaceInstances = 0
  let culledFaceInstances = 0
  let drawCallCount = 0
  prototype.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return
    const cullable = Boolean(object.userData.cullFace)
    const visibleBlocks = cullInvisibleFaces && cullable
      ? blocks.filter((block) => !hasCullingNeighbor(block, object, occupied))
      : blocks
    if (cullable) {
      cullableFaceInstances += blocks.length
      renderedCullableFaceInstances += visibleBlocks.length
      culledFaceInstances += blocks.length - visibleBlocks.length
    }
    if (!visibleBlocks.length) return
    const mesh = new THREE.InstancedMesh(object.geometry, object.material, visibleBlocks.length)
    mesh.name = `${key}#${meshCount++}`
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.userData.blueprintBlocks = visibleBlocks
    const translation = new THREE.Matrix4()
    const matrix = new THREE.Matrix4()
    const matrices: THREE.Matrix4[] = []
    visibleBlocks.forEach((block, index) => {
      translation.makeTranslation(
        block.position[0] + 0.5,
        block.position[1] + 0.5,
        block.position[2] + 0.5,
      )
      matrix.multiplyMatrices(translation, object.matrixWorld)
      mesh.setMatrixAt(index, matrix)
      matrices.push(matrix.clone())
    })
    mesh.userData.blueprintMatrices = matrices
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    target.add(mesh)
    drawCallCount++
  })
  if (!meshCount) throw new Error('方块模型没有可实例化 Mesh')
  return { cullableFaceInstances, renderedCullableFaceInstances, culledFaceInstances, drawCallCount }
}

function hasCullingNeighbor(block: BlueprintBlock, object: THREE.Object3D, occupied: Set<string>) {
  const normal = directionVector(String(object.userData.cullFace))
  if (!normal) return false
  object.getWorldQuaternion(tempQuaternion)
  normal.applyQuaternion(tempQuaternion)
  const dx = Math.abs(normal.x) > 0.9 ? Math.sign(normal.x) : 0
  const dy = Math.abs(normal.y) > 0.9 ? Math.sign(normal.y) : 0
  const dz = Math.abs(normal.z) > 0.9 ? Math.sign(normal.z) : 0
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) return false
  return occupied.has(`${block.position[0] + dx},${block.position[1] + dy},${block.position[2] + dz}`)
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
  blocks: BlueprintBlock[],
  key: string,
) {
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
  const mesh = new THREE.InstancedMesh(geometry, material, blocks.length)
  mesh.name = `${key}#fallback`
  mesh.userData.blueprintBlocks = blocks
  mesh.userData.fallback = true
  const matrix = new THREE.Matrix4()
  const matrices: THREE.Matrix4[] = []
  blocks.forEach((block, index) => {
    matrix.makeTranslation(
      block.position[0] + 0.5,
      block.position[1] + 0.5,
      block.position[2] + 0.5,
    )
    mesh.setMatrixAt(index, matrix)
    matrices.push(matrix.clone())
  })
  mesh.userData.blueprintMatrices = matrices
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  target.add(mesh)
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
