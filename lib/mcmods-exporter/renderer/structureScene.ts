import * as THREE from 'three'
import { buildMinecraftBlockModel } from './minecraftBlockModel'
import { stateKey, type BlueprintBlock, type BlueprintState, type StructureBlueprint } from './blueprint'
import type { AssetSource } from './types'

export interface StructureSceneResult {
  group: THREE.Group
  modeledStateCount: number
  fallbackStateCount: number
  fallbackBlockCount: number
  missingStates: Array<{ state: string; reason: string; blocks: number }>
}

export async function buildStructureScene(
  bundle: AssetSource,
  blueprint: StructureBlueprint,
  onProgress?: (finished: number, total: number, state: string) => void,
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
  let finished = 0

  for (const [key, stateGroup] of stateGroups) {
    onProgress?.(finished, stateGroups.size, key)
    try {
      const prototype = await buildMinecraftBlockModel(bundle, stateGroup.state.id, stateGroup.state.properties)
      addPrototypeInstances(result, prototype, stateGroup.blocks, key)
      modeledStateCount++
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      addFallbackInstances(result, stateGroup.state, stateGroup.blocks, key)
      missingStates.push({ state: key, reason, blocks: stateGroup.blocks.length })
      fallbackStateCount++
      fallbackBlockCount += stateGroup.blocks.length
    }
    finished++
    onProgress?.(finished, stateGroups.size, key)
    if (finished % 4 === 0) await nextFrame()
  }

  return { group: result, modeledStateCount, fallbackStateCount, fallbackBlockCount, missingStates }
}

function addPrototypeInstances(
  target: THREE.Group,
  prototype: THREE.Group,
  blocks: BlueprintBlock[],
  key: string,
) {
  prototype.scale.setScalar(1 / 16)
  prototype.updateMatrixWorld(true)
  let meshCount = 0
  prototype.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return
    const mesh = new THREE.InstancedMesh(object.geometry, object.material, blocks.length)
    mesh.name = `${key}#${meshCount++}`
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.userData.blueprintBlocks = blocks
    const translation = new THREE.Matrix4()
    const matrix = new THREE.Matrix4()
    blocks.forEach((block, index) => {
      translation.makeTranslation(
        block.position[0] + 0.5,
        block.position[1] + 0.5,
        block.position[2] + 0.5,
      )
      matrix.multiplyMatrices(translation, object.matrixWorld)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    target.add(mesh)
  })
  if (!meshCount) throw new Error('方块模型没有可实例化 Mesh')
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
  blocks.forEach((block, index) => {
    matrix.makeTranslation(
      block.position[0] + 0.5,
      block.position[1] + 0.5,
      block.position[2] + 0.5,
    )
    mesh.setMatrixAt(index, matrix)
  })
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
