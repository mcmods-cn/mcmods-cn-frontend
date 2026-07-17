import * as THREE from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { AssetSource } from './types'

type Vec3 = [number, number, number]
type Vec4 = [number, number, number, number]
type FaceDirection = 'down' | 'up' | 'north' | 'south' | 'west' | 'east'

interface ModelFace {
  texture: string
  uv?: Vec4
  rotation?: number
  tintindex?: number
  cullface?: FaceDirection
}

interface ModelElement {
  from: Vec3
  to: Vec3
  rotation?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean }
  faces: Partial<Record<FaceDirection, ModelFace>>
}

interface ModelJson {
  parent?: string
  loader?: string
  'porting_lib:loader'?: string
  'porting_lib:obj_marker'?: unknown
  model?: string
  mtl_override?: string
  mtlOverride?: string
  flip_v?: boolean
  flipV?: boolean
  textures?: Record<string, string>
  elements?: ModelElement[]
  children?: Record<string, ModelJson>
  item_render_order?: string[]
  visibility?: Record<string, boolean>
  base?: ModelJson
  perspectives?: Record<string, ModelJson>
  frame?: ModelElement[]
  bottomLEDs?: ModelElement[]
  bottomPort?: ModelElement[]
  topLEDs?: ModelElement[]
  topPort?: ModelElement[]
  frontLEDs?: ModelElement[]
  frontPort?: ModelElement[]
  backLEDs?: ModelElement[]
  backPort?: ModelElement[]
  rightLEDs?: ModelElement[]
  rightPort?: ModelElement[]
  leftLEDs?: ModelElement[]
  leftPort?: ModelElement[]
}

interface ModelApply {
  model?: string
  type?: string
  models?: Array<BlockStateJson | ModelApply>
  x?: number
  y?: number
  uvlock?: boolean
}

interface BlockStateJson {
  variants?: Record<string, ModelApply | ModelApply[]>
  multipart?: Array<{ when?: unknown; apply: ModelApply | ModelApply[] }>
}

interface ResolvedModel {
  loader?: string
  objModel?: string
  mtlOverride?: string
  flipV: boolean
  textures: Record<string, string>
  elements: ModelElement[]
  children: Array<{ name: string; model: ResolvedModel }>
  visibility: Record<string, boolean>
  baseModel?: ResolvedModel
  customElementGroups: Record<string, ModelElement[]>
}

export interface ExportedBlockEntityTexture {
  appearance?: string
  path: string
  uv_transform_required?: boolean
}

export interface ExportedBlockEntityMeshVertex {
  position: number[]
  uv: number[]
  normal: number[]
}

export interface ExportedBlockEntityMeshFace {
  vertices: ExportedBlockEntityMeshVertex[]
}

export interface ExportedBlockEntityVariant {
  variantId: string
  objPath: string
  meshPath: string
  vertexCount: number
  quadCount: number
  coordinateSpace: string
  uvSpace: string
  uvOrigin: string
  uvComplete: boolean
  textures: ExportedBlockEntityTexture[]
  mesh: {
    schema_version?: string
    coordinate_space?: string
    uv_space?: string
    uv_origin?: string
    vertex_count?: number
    quad_count?: number
    faces?: ExportedBlockEntityMeshFace[]
  }
}

export interface ExportedBlockEntityModel {
  blockId: string
  blockEntityTypeId: string
  modelSource: string
  modelAvailable: boolean
  variants: ExportedBlockEntityVariant[]
}

const directions: FaceDirection[] = ['down', 'up', 'north', 'south', 'west', 'east']
const mekanismEnergyCubeGroupNames = [
  'frame',
  'bottomLEDs', 'bottomPort',
  'topLEDs', 'topPort',
  'frontLEDs', 'frontPort',
  'backLEDs', 'backPort',
  'rightLEDs', 'rightPort',
  'leftLEDs', 'leftPort',
] as const

export async function buildMinecraftBlockModel(
  bundle: AssetSource,
  blockId: string,
  defaultState: Record<string, string> = {},
  blockEntityModel?: ExportedBlockEntityModel,
): Promise<THREE.Group> {
  const { namespace, path } = splitId(blockId)
  if (blockEntityModel?.modelAvailable && blockEntityModel.variants.length) {
    try {
      return await createExportedBlockEntityGroup(bundle, blockId, defaultState, blockEntityModel)
    } catch (error) {
      if (blockEntityModel.modelSource === 'minecraft_chest_layer') throw error
      // Some runtime renderers export atlas-space UVs that cannot be used
      // without the original atlas transform. Fall back to the block model.
    }
  }
  if (namespace === 'minecraft' && isVanillaChest(path)) {
    return createVanillaChestGroup(bundle, path, defaultState)
  }
  const blockStatePath = `assets/${namespace}/blockstates/${path}.json`
  const blockState = await bundle.json<BlockStateJson>(blockStatePath)
  const applies = selectApplies(blockState, defaultState)
  if (!applies.length) throw new Error(`blockstate 没有可渲染 model：${blockStatePath}`)

  const result = new THREE.Group()
  for (const apply of applies) {
    if (!apply.model) continue
    const model = await resolveModel(bundle, apply.model, new Set())
    const modelGroup = await createModelGroup(bundle, model, blockId, defaultState)
    modelGroup.rotation.order = 'YXZ'
    modelGroup.rotation.x = THREE.MathUtils.degToRad(-(apply.x ?? 0))
    modelGroup.rotation.y = THREE.MathUtils.degToRad(-(apply.y ?? 0))
    result.add(modelGroup)
  }
  return result
}

async function createExportedBlockEntityGroup(
  bundle: AssetSource,
  blockId: string,
  defaultState: Record<string, string>,
  model: ExportedBlockEntityModel,
): Promise<THREE.Group> {
  const requestedVariant = defaultState.type ?? defaultState.chest_type
  const variant = model.variants.find((entry) => entry.variantId === requestedVariant && entry.uvComplete)
    ?? model.variants.find((entry) => entry.variantId === 'single' && entry.uvComplete)
    ?? model.variants.find((entry) => entry.variantId === 'default' && entry.uvComplete)
    ?? model.variants.find((entry) => entry.uvComplete)
  if (!variant) throw new Error('exported block entity model has no complete UV variant')
  const mesh = variant.mesh
  const faces = mesh.faces ?? []
  if (
    mesh.schema_version !== 'mcmods-uv-quad-mesh/v1'
    || mesh.coordinate_space !== 'block_units'
    || mesh.uv_space !== variant.uvSpace
    || mesh.uv_origin !== variant.uvOrigin
    || faces.length !== variant.quadCount
  ) throw new Error('exported block entity mesh metadata is invalid')
  const texture = variant.textures.find((entry) => entry.appearance === 'default' && !entry.uv_transform_required)
    ?? variant.textures.find((entry) => !entry.uv_transform_required)
  if (!texture?.path) throw new Error('exported block entity model requires an unavailable atlas UV transform')
  const textureURL = bundle.url(texture.path)
  if (!textureURL) throw new Error(`exported block entity texture is missing: ${texture.path}`)

  const positions: number[] = []
  const uvs: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const face of faces) {
    if (face.vertices.length !== 4) throw new Error('exported block entity mesh contains a non-quad face')
    const offset = positions.length / 3
    for (const vertex of face.vertices) {
      if (vertex.position.length !== 3 || vertex.uv.length !== 2 || vertex.normal.length !== 3) {
        throw new Error('exported block entity mesh contains an invalid vertex')
      }
      positions.push(
        (vertex.position[0]! - 0.5) * 16,
        (vertex.position[1]! - 0.5) * 16,
        (vertex.position[2]! - 0.5) * 16,
      )
      const textureV = variant.uvOrigin === 'top_left' ? 1 - vertex.uv[1]! : vertex.uv[1]!
      uvs.push(vertex.uv[0]!, textureV)
      normals.push(vertex.normal[0]!, vertex.normal[1]!, vertex.normal[2]!)
    }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const map = await new THREE.TextureLoader().loadAsync(textureURL)
  map.colorSpace = THREE.SRGBColorSpace
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.NearestMipmapNearestFilter
  const material = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.05,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, material))
  if (isVanillaChest(splitId(blockId).path)) group.rotation.y = chestFacingRotation(defaultState.facing)
  group.userData.blockEntityRenderer = model.modelSource
  group.userData.blockEntityVariant = variant.variantId
  return group
}

function splitId(id: string): { namespace: string; path: string } {
  const separator = id.indexOf(':')
  return separator < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, separator), path: id.slice(separator + 1) }
}

function selectApplies(blockState: BlockStateJson, defaultState: Record<string, string>): ModelApply[] {
  if (blockState.variants) {
    const entries = Object.entries(blockState.variants)
    const selected = entries.find(([key]) => variantMatches(key, defaultState)) ?? entries[0]
    if (!selected) return []
    const selectedApplies = Array.isArray(selected[1]) ? selected[1].slice(0, 1) : [selected[1]]
    return selectedApplies.flatMap((apply) => expandBlockStateApply(apply, defaultState))
  }
  return (blockState.multipart ?? []).flatMap((part) => {
    if (part.when !== undefined && !multipartConditionMatches(part.when, defaultState)) return []
    const apply = part.apply
    const applies = Array.isArray(apply) ? apply.slice(0, 1) : [apply]
    return applies.flatMap((entry) => expandBlockStateApply(entry, defaultState))
  })
}

function multipartConditionMatches(condition: unknown, state: Record<string, string>): boolean {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return true
  const record = condition as Record<string, unknown>
  if (Array.isArray(record.OR)) return record.OR.some((entry) => multipartConditionMatches(entry, state))
  if (Array.isArray(record.AND)) return record.AND.every((entry) => multipartConditionMatches(entry, state))
  return Object.entries(record).every(([property, expected]) => {
    if (property === 'OR' || property === 'AND') return true
    if (typeof expected !== 'string') return true
    return expected.split('|').includes(state[property] ?? '')
  })
}

function expandBlockStateApply(apply: ModelApply, defaultState: Record<string, string>): ModelApply[] {
  if (apply.type !== 'neoforge:composite') return apply.model ? [apply] : []
  return (apply.models ?? []).flatMap((entry) => {
    if ('type' in entry && entry.type === 'neoforge:composite') return expandBlockStateApply(entry as ModelApply, defaultState)
    if ('model' in entry && entry.model) return expandBlockStateApply(entry as ModelApply, defaultState)
    return selectApplies(entry as BlockStateJson, defaultState)
  })
}

function variantMatches(key: string, state: Record<string, string>): boolean {
  if (!key) return true
  return key.split(',').every((pair) => {
    const [name, value] = pair.split('=')
    return name !== undefined && value !== undefined && state[name] === value
  })
}

async function resolveModel(
  bundle: AssetSource,
  modelId: string,
  visited: Set<string>,
): Promise<ResolvedModel> {
  const location = parseLocation(modelId)
  const canonical = `${location.namespace}:${location.path}`
  if (visited.has(canonical)) throw new Error(`模型 parent 循环引用：${canonical}`)
  visited.add(canonical)

  const builtin = builtinModel(canonical)
  const current = builtin ?? await bundle.json<ModelJson>(`assets/${location.namespace}/models/${location.path}.json`)
  const resolved = await resolveModelJson(bundle, current, location.namespace, visited, canonical)
  visited.delete(canonical)
  return resolved
}

async function resolveModelJson(
  bundle: AssetSource,
  current: ModelJson,
  namespace: string,
  visited: Set<string>,
  identity: string,
): Promise<ResolvedModel> {
  let parent: ResolvedModel | undefined
  if (current.parent) {
    parent = await resolveModel(bundle, current.parent, visited)
  }
  let children = parent?.children ?? []
  if (current.children) {
    children = []
    for (const [name, child] of Object.entries(current.children)) {
      const childIdentity = `${identity}#children/${name}`
      if (visited.has(childIdentity)) throw new Error(`模型 children 循环引用：${childIdentity}`)
      visited.add(childIdentity)
      try {
        children.push({ name, model: await resolveModelJson(bundle, child, namespace, visited, childIdentity) })
      } finally {
        visited.delete(childIdentity)
      }
    }
  }
  let baseModel = parent?.baseModel
  if (current.base) {
    const baseIdentity = `${identity}#base`
    if (visited.has(baseIdentity)) throw new Error(`模型 base 循环引用：${baseIdentity}`)
    visited.add(baseIdentity)
    try {
      baseModel = await resolveModelJson(bundle, current.base, namespace, visited, baseIdentity)
    } finally {
      visited.delete(baseIdentity)
    }
  }
  return {
    loader: current.loader
      ?? current['porting_lib:loader']
      ?? (current['porting_lib:obj_marker'] !== undefined ? 'porting_lib:obj' : undefined)
      ?? parent?.loader,
    objModel: current.model ?? parent?.objModel,
    mtlOverride: current.mtl_override ?? current.mtlOverride ?? parent?.mtlOverride,
    flipV: current.flip_v ?? current.flipV ?? parent?.flipV ?? false,
    textures: { ...(parent?.textures ?? {}), ...(current.textures ?? {}) },
    elements: current.elements ?? parent?.elements ?? [],
    children,
    visibility: { ...(parent?.visibility ?? {}), ...(current.visibility ?? {}) },
    baseModel,
    customElementGroups: {
      ...(parent?.customElementGroups ?? {}),
      ...readCustomElementGroups(current),
    },
  }
}

async function createModelGroup(
  bundle: AssetSource,
  model: ResolvedModel,
  blockId: string,
  blockState: Record<string, string>,
): Promise<THREE.Group> {
  if (model.loader === 'forge:obj' || model.loader === 'neoforge:obj' || model.loader === 'porting_lib:obj') {
    return createForgeObjGroup(bundle, model)
  }
  if (model.loader === 'forge:composite' || model.loader === 'neoforge:composite' || model.loader === 'porting_lib:composite') {
    return createForgeCompositeGroup(bundle, model, blockId, blockState)
  }
  if (model.loader === 'forge:separate_transforms' || model.loader === 'neoforge:separate_transforms') {
    if (!model.baseModel) throw new Error(`${model.loader} 模型缺少 base`)
    return createModelGroup(bundle, model.baseModel, blockId, blockState)
  }
  if (model.loader === 'forge:empty' || model.loader === 'neoforge:empty' || model.loader === 'porting_lib:empty') {
    return new THREE.Group()
  }
  const elements = model.loader === 'mekanism:energy_cube'
    ? mekanismEnergyCubeElements(model)
    : model.elements
  const group = new THREE.Group()
  const materialCache = new Map<string, THREE.MeshStandardMaterial>()
  for (const element of elements) {
    for (const direction of directions) {
      const face = element.faces[direction]
      if (!face) continue
      const textureId = resolveTexture(face.texture, model.textures)
      if (!textureId) continue
      const textureLocation = parseLocation(textureId)
      const texturePath = `assets/${textureLocation.namespace}/textures/${textureLocation.path}.png`
      const url = bundle.url(texturePath)
      if (!url) continue
      const tint = minecraftTintColor(blockId, textureId, face.tintindex, blockState)
      const materialKey = `${texturePath}|${tint ?? 'none'}`
      let material = materialCache.get(materialKey)
      if (!material) {
        const texture = new THREE.TextureLoader().load(url)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestMipmapNearestFilter
        material = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.05,
          roughness: 0.86,
          metalness: 0,
          side: THREE.DoubleSide,
          color: tint ?? 0xffffff,
        })
        materialCache.set(materialKey, material)
      }
      const geometry = faceGeometry(element, direction, face)
      const mesh = new THREE.Mesh(geometry, material)
      if (face.cullface) mesh.userData.cullFace = face.cullface
      group.add(mesh)
    }
  }
  if (!group.children.length) {
    if (model.loader) {
      throw new Error(`模型使用自定义 loader：${model.loader}；该 loader 不是标准 Minecraft elements/faces 模型`)
    }
    throw new Error('模型没有可渲染的 faces，或导出包缺少引用贴图')
  }
  return group
}

function readCustomElementGroups(model: ModelJson): Record<string, ModelElement[]> {
  const groups: Record<string, ModelElement[]> = {}
  for (const name of mekanismEnergyCubeGroupNames) {
    const elements = model[name]
    if (Array.isArray(elements)) groups[name] = elements
  }
  return groups
}

function mekanismEnergyCubeElements(model: ResolvedModel): ModelElement[] {
  const groups = model.customElementGroups
  if (!groups.frame?.length) {
    throw new Error('mekanism:energy_cube 模型缺少 frame 元素')
  }
  // Mekanism's item renderer uses active ports on every side when no side NBT
  // exists: front is lit and the other five sides are unlit. Both states render
  // the LED and port geometry, so the website can reproduce the default item
  // model by composing all exported groups in the loader's official order.
  return mekanismEnergyCubeGroupNames.flatMap((name) => groups[name] ?? [])
}

async function createForgeCompositeGroup(
  bundle: AssetSource,
  model: ResolvedModel,
  blockId: string,
  blockState: Record<string, string>,
): Promise<THREE.Group> {
  if (!model.children.length) throw new Error(`${model.loader} 模型缺少 children 子模型`)
  const group = new THREE.Group()
  const failures: string[] = []
  for (const child of model.children) {
    if (model.visibility[child.name] === false) continue
    try {
      const childGroup = await createModelGroup(bundle, child.model, blockId, blockState)
      childGroup.name = child.name
      group.add(childGroup)
    } catch (error) {
      failures.push(`${child.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!group.children.length) {
    const detail = failures.length ? failures.join('；') : '全部 children 均被 visibility 隐藏'
    throw new Error(`${model.loader} 没有可渲染子模型：${detail}`)
  }
  if (failures.length) group.userData.compositeWarnings = failures
  return group
}

async function createForgeObjGroup(bundle: AssetSource, model: ResolvedModel): Promise<THREE.Group> {
  if (!model.objModel) throw new Error(`${model.loader} 模型 JSON 缺少 model 字段`)
  const objLocation = parseLocation(model.objModel)
  const objPath = modelAssetPath(objLocation.namespace, objLocation.path, '.obj')
  if (!bundle.has(objPath)) throw new Error(`导出包缺少 OBJ：${objPath}`)
  const objText = await bundle.text(objPath)

  const manager = new THREE.LoadingManager()
  let materialCreator: ReturnType<MTLLoader['parse']> | undefined
  const mtlPath = findMtlPath(bundle, objText, objPath, objLocation.namespace, model.mtlOverride)
  if (mtlPath) {
    const mtlText = await bundle.text(mtlPath)
    const rewrittenMtl = rewriteMtlTexturePaths(bundle, mtlText, mtlPath, objLocation.namespace, model.textures)
    materialCreator = new MTLLoader(manager).parse(rewrittenMtl, '')
    materialCreator.preload()
  }

  const loader = new OBJLoader(manager)
  if (materialCreator) loader.setMaterials(materialCreator)
  const object = loader.parse(objText)
  object.traverse((child) => {
    if (child.name && model.visibility[child.name] === false) child.visible = false
  })
  if (model.flipV) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const uv = child.geometry.getAttribute('uv')
      if (!uv) return
      for (let index = 0; index < uv.count; index++) uv.setY(index, 1 - uv.getY(index))
      uv.needsUpdate = true
    })
  }
  normalizeObjToBlock(object)
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      material.side = THREE.DoubleSide
      if (material instanceof THREE.MeshPhongMaterial) {
        material.transparent = true
        material.alphaTest = 0.05
        material.shininess = 5
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace
          material.map.magFilter = THREE.NearestFilter
          material.map.minFilter = THREE.NearestMipmapNearestFilter
        }
      }
    })
  })
  return object
}

function findMtlPath(
  bundle: AssetSource,
  objText: string,
  objPath: string,
  namespace: string,
  override: string | undefined,
): string | undefined {
  const declared = objText.match(/^\s*mtllib\s+(.+)\s*$/mi)?.[1]?.trim()
  const candidates = [
    override ? resolveModelSidecarPath(override, objPath, namespace, '.mtl') : undefined,
    declared ? resolveModelSidecarPath(declared, objPath, namespace, '.mtl') : undefined,
    objPath.replace(/\.obj$/i, '.mtl'),
  ].filter((value): value is string => Boolean(value))
  return candidates.find((candidate) => bundle.has(candidate))
}

function rewriteMtlTexturePaths(
  bundle: AssetSource,
  source: string,
  mtlPath: string,
  namespace: string,
  textures: Record<string, string>,
): string {
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim()
    if (!/^(?:map_[a-z0-9_]+|bump|norm)\s+/i.test(trimmed)) return line
    const parts = trimmed.split(/\s+/)
    const reference = parts.at(-1)
    if (!reference) return line
    const resolvedReference = reference.startsWith('#') ? resolveTexture(reference, textures) : reference
    if (!resolvedReference) return line
    const texturePath = resolveTextureAssetPath(resolvedReference, mtlPath, namespace)
    const url = bundle.url(texturePath)
    if (!url) return line
    parts[parts.length - 1] = url
    return parts.join(' ')
  }).join('\n')
}

function resolveTextureAssetPath(reference: string, basePath: string, namespace: string): string {
  if (reference.includes(':')) {
    const location = parseLocation(reference)
    const path = location.path.startsWith('textures/') ? location.path : `textures/${location.path}`
    return normalizeAssetPath(`assets/${location.namespace}/${ensureExtension(path, '.png')}`)
  }
  if (reference.startsWith('textures/')) {
    return normalizeAssetPath(`assets/${namespace}/${ensureExtension(reference, '.png')}`)
  }
  if (reference.includes('/') && !reference.startsWith('.') && !reference.endsWith('.png')) {
    return normalizeAssetPath(`assets/${namespace}/textures/${ensureExtension(reference, '.png')}`)
  }
  return normalizeAssetPath(`${basePath.slice(0, basePath.lastIndexOf('/') + 1)}${reference}`)
}

function resolveModelSidecarPath(reference: string, basePath: string, namespace: string, extension: string): string {
  if (reference.includes(':')) {
    const location = parseLocation(reference)
    return modelAssetPath(location.namespace, location.path, extension)
  }
  if (reference.startsWith('models/')) {
    return normalizeAssetPath(`assets/${namespace}/${ensureExtension(reference, extension)}`)
  }
  return normalizeAssetPath(`${basePath.slice(0, basePath.lastIndexOf('/') + 1)}${ensureExtension(reference, extension)}`)
}

function modelAssetPath(namespace: string, path: string, extension: string): string {
  const modelPath = path.startsWith('models/') ? path : `models/${path}`
  return normalizeAssetPath(`assets/${namespace}/${ensureExtension(modelPath, extension)}`)
}

function normalizeAssetPath(path: string): string {
  const output: string[] = []
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') output.pop()
    else output.push(segment)
  }
  return output.join('/')
}

function ensureExtension(path: string, extension: string): string {
  return path.toLocaleLowerCase().endsWith(extension) ? path : `${path}${extension}`
}

function normalizeObjToBlock(object: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(object)
  if (bounds.isEmpty()) throw new Error('OBJ 不包含可渲染顶点')
  const size = bounds.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(largest) || largest <= 0) throw new Error('OBJ 尺寸无效')
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = 16 / largest
  object.position.copy(center).multiplyScalar(-scale)
  object.scale.setScalar(scale)
}

function faceGeometry(element: ModelElement, direction: FaceDirection, face: ModelFace): THREE.BufferGeometry {
  const [x1, y1, z1] = element.from.map((value) => value - 8) as Vec3
  const [x2, y2, z2] = element.to.map((value) => value - 8) as Vec3
  const points: Record<FaceDirection, Vec3[]> = {
    down: [[x1, y1, z2], [x1, y1, z1], [x2, y1, z1], [x2, y1, z2]],
    up: [[x1, y2, z1], [x1, y2, z2], [x2, y2, z2], [x2, y2, z1]],
    north: [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]],
    south: [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]],
    west: [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]],
    east: [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]],
  }
  const vertices = points[direction].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  if (element.rotation) rotateElement(vertices, element.rotation)

  const uv = face.uv ?? defaultUv(element, direction)
  let uvPoints: Array<[number, number]> = [
    [uv[0] / 16, 1 - uv[3] / 16],
    [uv[2] / 16, 1 - uv[3] / 16],
    [uv[2] / 16, 1 - uv[1] / 16],
    [uv[0] / 16, 1 - uv[1] / 16],
  ]
  const turns = (((face.rotation ?? 0) / 90) % 4 + 4) % 4
  for (let index = 0; index < turns; index++) uvPoints = [uvPoints[3]!, ...uvPoints.slice(0, 3)]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap((point) => point.toArray()), 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvPoints.flat(), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return geometry
}

function rotateElement(points: THREE.Vector3[], rotation: NonNullable<ModelElement['rotation']>) {
  const origin = new THREE.Vector3(...rotation.origin.map((value) => value - 8) as Vec3)
  const angle = THREE.MathUtils.degToRad(rotation.angle)
  const matrix = new THREE.Matrix4()
  if (rotation.axis === 'x') matrix.makeRotationX(angle)
  else if (rotation.axis === 'y') matrix.makeRotationY(angle)
  else matrix.makeRotationZ(angle)
  points.forEach((point) => point.sub(origin).applyMatrix4(matrix).add(origin))
}

function defaultUv(element: ModelElement, direction: FaceDirection): Vec4 {
  const [x1, y1, z1] = element.from
  const [x2, y2, z2] = element.to
  if (direction === 'down' || direction === 'up') return [x1, z1, x2, z2]
  if (direction === 'north' || direction === 'south') return [x1, 16 - y2, x2, 16 - y1]
  return [z1, 16 - y2, z2, 16 - y1]
}

function resolveTexture(reference: string, textures: Record<string, string>): string | undefined {
  let value = reference
  const seen = new Set<string>()
  while (value.startsWith('#')) {
    const key = value.slice(1)
    if (seen.has(key)) return undefined
    seen.add(key)
    const next = textures[key]
    if (!next) return undefined
    value = next
  }
  return value
}

function minecraftTintColor(
  blockId: string,
  textureId: string,
  tintIndex: number | undefined,
  state: Record<string, string>,
): number | undefined {
  if (tintIndex === undefined) return undefined
  const path = splitId(blockId).path
  const texturePath = parseLocation(textureId).path

  if (path === 'lily_pad') return 0x208030
  if (path === 'spruce_leaves') return 0x619961
  if (path === 'birch_leaves') return 0x80a755
  if (path.includes('leaves') || path.includes('vine') || texturePath.includes('leaves')) return 0x48b518
  if (path.includes('water')) return 0x3f76e4
  if (path === 'redstone_wire') return redstoneTint(Number(state.power ?? 0))
  if (path.includes('stem')) return stemTint(Number(state.age ?? 0))
  if (
    path === 'grass_block'
    || path.includes('grass')
    || path.includes('fern')
    || path === 'sugar_cane'
    || texturePath.includes('grass')
  ) return 0x91bd59

  // Unknown modded tint handlers cannot be reproduced without executing the
  // mod. White preserves authored texture colors instead of guessing.
  return 0xffffff
}

function redstoneTint(rawPower: number): number {
  const power = Math.min(15, Math.max(0, Number.isFinite(rawPower) ? rawPower : 0)) / 15
  const red = power === 0 ? 0.3 : power * 0.6 + 0.4
  const green = Math.max(0, power * power * 0.7 - 0.5)
  const blue = Math.max(0, power * power * 0.6 - 0.7)
  return (Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255)
}

function stemTint(rawAge: number): number {
  const age = Math.min(7, Math.max(0, Number.isFinite(rawAge) ? rawAge : 0))
  const red = age * 32
  const green = 255 - age * 8
  const blue = age * 4
  return (red << 16) | (green << 8) | blue
}

function isVanillaChest(path: string): boolean {
  return path === 'chest' || path === 'trapped_chest' || path === 'ender_chest'
}

function createVanillaChestGroup(
  bundle: AssetSource,
  path: string,
  state: Record<string, string>,
): THREE.Group {
  // Vanilla chests use a BlockEntityWithoutLevelRenderer and therefore have
  // no elements/faces model. The exported particle texture provides a stable
  // resource-backed approximation when entity textures are unavailable.
  const textureId = path === 'ender_chest' ? 'minecraft:block/obsidian' : 'minecraft:block/oak_planks'
  const bodyMaterial = blockTextureMaterial(bundle, textureId, path === 'ender_chest' ? 0x241f35 : 0x9a6a3a)
  const latchMaterial = new THREE.MeshStandardMaterial({
    color: path === 'trapped_chest' ? 0xb64b42 : 0xc8b16b,
    roughness: 0.58,
    metalness: 0.18,
  })
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), bodyMaterial)
  body.position.y = -3
  const lid = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), bodyMaterial)
  lid.position.y = 4.5
  const latch = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), latchMaterial)
  latch.position.set(0, 1.5, -7.5)
  group.add(body, lid, latch)
  group.rotation.y = chestFacingRotation(state.facing)
  group.userData.compatibilityRenderer = 'minecraft:chest'
  return group
}

function blockTextureMaterial(bundle: AssetSource, textureId: string, fallbackColor: number): THREE.MeshStandardMaterial {
  const textureLocation = parseLocation(textureId)
  const texturePath = `assets/${textureLocation.namespace}/textures/${textureLocation.path}.png`
  const url = bundle.url(texturePath)
  if (!url) return new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.86, metalness: 0 })
  const texture = new THREE.TextureLoader().load(url)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapNearestFilter
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.86, metalness: 0 })
}

function chestFacingRotation(facing: string | undefined): number {
  switch (facing) {
    case 'east': return -Math.PI / 2
    case 'south': return Math.PI
    case 'west': return Math.PI / 2
    default: return 0
  }
}

function parseLocation(id: string) {
  const separator = id.indexOf(':')
  return separator >= 0
    ? { namespace: id.slice(0, separator), path: id.slice(separator + 1) }
    // ResourceLocation.withDefaultNamespace uses minecraft for unqualified
    // model parents and textures. "block/block" is minecraft:block/block,
    // not <current-mod>:block/block.
    : { namespace: 'minecraft', path: id }
}

function builtinModel(id: string): ModelJson | undefined {
  const cubeFaces = (textures: Partial<Record<FaceDirection, string>>): ModelElement[] => [{
    from: [0, 0, 0], to: [16, 16, 16],
    faces: Object.fromEntries(Object.entries(textures).map(([direction, texture]) => [direction, { texture }])) as Partial<Record<FaceDirection, ModelFace>>,
  }]
  switch (id) {
    case 'minecraft:block/block': return {}
    case 'minecraft:block/cube': return { elements: cubeFaces({ down: '#down', up: '#up', north: '#north', south: '#south', west: '#west', east: '#east' }) }
    case 'minecraft:block/cube_all': return { elements: cubeFaces({ down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' }) }
    case 'minecraft:block/cube_column': return { elements: cubeFaces({ down: '#end', up: '#end', north: '#side', south: '#side', west: '#side', east: '#side' }) }
    case 'minecraft:block/cube_bottom_top': return { elements: cubeFaces({ down: '#bottom', up: '#top', north: '#side', south: '#side', west: '#side', east: '#side' }) }
    case 'minecraft:block/orientable': return { elements: cubeFaces({ down: '#top', up: '#top', north: '#front', south: '#side', west: '#side', east: '#side' }) }
    default: return undefined
  }
}
