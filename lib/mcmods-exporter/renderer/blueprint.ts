import { Buffer } from 'buffer'
import { gunzipSync, unzlibSync } from 'fflate'
import { decode } from 'nbt-ts'

type Compound = Record<string, unknown>
export type Vec3 = [number, number, number]

export interface BlueprintState {
  id: string
  properties: Record<string, string>
}

export interface BlueprintBlock {
  position: Vec3
  state: BlueprintState
  blockEntity?: Compound
}

export interface StructureBlueprint {
  name: string
  format: 'vanilla_nbt' | 'sponge_schem' | 'litematic' | 'normalized_json'
  dataVersion?: number
  size: Vec3
  blocks: BlueprintBlock[]
  paletteSize: number
  blockEntityCount: number
  entityCount: number
  warnings: string[]
}

const MAX_VOLUME = 16_000_000
const MAX_VISIBLE_BLOCKS = 600_000

export function parseBlueprint(input: Uint8Array, name: string): StructureBlueprint {
  if (name.toLocaleLowerCase().endsWith('.json')) {
    return parseNormalizedJson(new TextDecoder().decode(input), name)
  }
  const root = decodeNbtRoot(input)
  if (isCompound(root.Regions)) return parseLitematic(root, name)
  if (isCompound(root.Palette) || isCompound(root.Schematic)) return parseSpongeSchematic(root, name)
  if (Array.isArray(root.palette) || Array.isArray(root.palettes)) return parseVanillaStructure(root, name)
  throw new Error('无法识别蓝图格式：需要原版/Create .nbt、Sponge .schem、Litematica .litematic 或规范化 JSON')
}

function decodeNbtRoot(input: Uint8Array): Compound {
  let data = input
  if (data[0] === 0x1f && data[1] === 0x8b) {
    data = gunzipSync(data)
  } else if (looksLikeZlib(data)) {
    try {
      data = unzlibSync(data)
    } catch {
      // It may be uncompressed NBT whose first two bytes happen to resemble zlib.
    }
  }
  const globals = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
  globals.Buffer ??= Buffer
  const decoded = decode(Buffer.from(data))
  if (!isCompound(decoded.value)) throw new Error('NBT 根标签不是 Compound')
  return decoded.value
}

function looksLikeZlib(data: Uint8Array): boolean {
  if (data.length < 2) return false
  const cmf = data[0]!
  const flag = data[1]!
  return (cmf & 0x0f) === 8 && ((cmf << 8) + flag) % 31 === 0
}

function parseVanillaStructure(root: Compound, name: string): StructureBlueprint {
  const size = readListVec3(root.size, 'size')
  assertVolume(size)
  const palettes = tagList(root.palettes)
  const paletteTags = tagList(root.palette).length
    ? tagList(root.palette)
    : tagList(palettes[0])
  if (!paletteTags.length) throw new Error('结构 NBT 没有 palette/palettes')
  const palette = paletteTags.map(readPaletteState)
  const warnings: string[] = []
  if (palettes.length > 1) warnings.push(`结构包含 ${palettes.length} 套随机调色板，当前显示第一套`)

  const blocks: BlueprintBlock[] = []
  let blockEntityCount = 0
  for (const raw of tagList(root.blocks)) {
    const block = requireCompound(raw, 'blocks[]')
    const position = readListVec3(block.pos, 'blocks[].pos')
    const stateIndex = tagNumber(block.state)
    const state = palette[stateIndex]
    if (!state) {
      warnings.push(`跳过无效 palette 索引 ${stateIndex}`)
      continue
    }
    const blockEntity = isCompound(block.nbt) ? block.nbt : undefined
    if (blockEntity) blockEntityCount++
    if (!isAir(state.id)) {
      blocks.push({ position, state, blockEntity })
      assertBlockCount(blocks.length)
    }
  }
  return {
    name,
    format: 'vanilla_nbt',
    dataVersion: optionalNumber(root.DataVersion),
    size,
    blocks,
    paletteSize: palette.length,
    blockEntityCount,
    entityCount: tagList(root.entities).length,
    warnings,
  }
}

function parseSpongeSchematic(root: Compound, name: string): StructureBlueprint {
  const schematic = isCompound(root.Schematic) ? root.Schematic : root
  const blocksRoot = isCompound(schematic.Blocks) ? schematic.Blocks : schematic
  const size: Vec3 = [
    tagNumber(schematic.Width),
    tagNumber(schematic.Height),
    tagNumber(schematic.Length),
  ]
  assertVolume(size)
  const paletteCompound = requireCompound(blocksRoot.Palette, 'Palette')
  const palette: BlueprintState[] = []
  for (const [stateText, rawIndex] of Object.entries(paletteCompound)) {
    palette[tagNumber(rawIndex)] = parseStateText(stateText)
  }
  const encoded = byteArray(blocksRoot.Data ?? schematic.BlockData)
  const indices = decodeVarInts(encoded, size[0] * size[1] * size[2])
  const blocks: BlueprintBlock[] = []
  const warnings: string[] = []
  for (let index = 0; index < indices.length; index++) {
    const state = palette[indices[index]!]
    if (!state) {
      warnings.push(`跳过无效 palette 索引 ${indices[index]}`)
      continue
    }
    if (isAir(state.id)) continue
    const x = index % size[0]
    const z = Math.floor(index / size[0]) % size[2]
    const y = Math.floor(index / (size[0] * size[2]))
    blocks.push({ position: [x, y, z], state })
    assertBlockCount(blocks.length)
  }
  return {
    name,
    format: 'sponge_schem',
    dataVersion: optionalNumber(schematic.DataVersion),
    size,
    blocks,
    paletteSize: palette.filter(Boolean).length,
    blockEntityCount: tagList(blocksRoot.BlockEntities).length,
    entityCount: tagList(schematic.Entities).length,
    warnings,
  }
}

function parseLitematic(root: Compound, name: string): StructureBlueprint {
  const regions = requireCompound(root.Regions, 'Regions')
  const warnings: string[] = []
  const rawBlocks: BlueprintBlock[] = []
  const occupied = new Map<string, BlueprintBlock>()
  let blockEntityCount = 0
  let entityCount = 0
  let paletteSize = 0
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (const [regionName, rawRegion] of Object.entries(regions)) {
    const region = requireCompound(rawRegion, `Regions.${regionName}`)
    const position = readCompoundVec3(region.Position, `Regions.${regionName}.Position`)
    const signedSize = readCompoundVec3(region.Size, `Regions.${regionName}.Size`)
    const size = signedSize.map((value) => Math.abs(value)) as Vec3
    assertVolume(size)
    for (let axis = 0; axis < 3; axis++) {
      const end = position[axis]! + Math.sign(signedSize[axis] || 1) * (size[axis]! - 1)
      min[axis] = Math.min(min[axis]!, position[axis]!, end)
      max[axis] = Math.max(max[axis]!, position[axis]!, end)
    }

    const palette = tagList(region.BlockStatePalette).map(readPaletteState)
    paletteSize = Math.max(paletteSize, palette.length)
    const packed = longArray(region.BlockStates)
    const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, palette.length))))
    const volume = size[0] * size[1] * size[2]
    for (let index = 0; index < volume; index++) {
      const paletteIndex = readPackedIndex(packed, index, bits)
      const state = palette[paletteIndex]
      if (!state || isAir(state.id)) continue
      const x = index % size[0]
      const z = Math.floor(index / size[0]) % size[2]
      const y = Math.floor(index / (size[0] * size[2]))
      const block: BlueprintBlock = {
        position: [
          position[0] + x * Math.sign(signedSize[0] || 1),
          position[1] + y * Math.sign(signedSize[1] || 1),
          position[2] + z * Math.sign(signedSize[2] || 1),
        ],
        state,
      }
      occupied.set(block.position.join(','), block)
      assertBlockCount(occupied.size)
    }
    blockEntityCount += tagList(region.TileEntities).length
    entityCount += tagList(region.Entities).length
  }

  if (!Number.isFinite(min[0])) throw new Error('Litematic 没有可用 Region')
  occupied.forEach((block) => {
    rawBlocks.push({
      ...block,
      position: [
        block.position[0] - min[0],
        block.position[1] - min[1],
        block.position[2] - min[2],
      ],
    })
  })
  const size: Vec3 = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1]
  if (Object.keys(regions).length > 1) warnings.push(`已合并 ${Object.keys(regions).length} 个 Litematica Region`)
  return {
    name,
    format: 'litematic',
    dataVersion: optionalNumber(root.MinecraftDataVersion),
    size,
    blocks: rawBlocks,
    paletteSize,
    blockEntityCount,
    entityCount,
    warnings,
  }
}

function parseNormalizedJson(text: string, name: string): StructureBlueprint {
  const root = JSON.parse(text) as Compound
  const size = readListVec3(root.size, 'size')
  assertVolume(size)
  const blocks = tagList(root.blocks).map((raw, index) => {
    const block = requireCompound(raw, `blocks[${index}]`)
    const stateRaw = requireCompound(block.state, `blocks[${index}].state`)
    const id = String(stateRaw.id ?? 'minecraft:air')
    const properties = isCompound(stateRaw.properties)
      ? Object.fromEntries(Object.entries(stateRaw.properties).map(([key, value]) => [key, String(value)]))
      : {}
    return { position: readListVec3(block.position ?? block.pos, `blocks[${index}].position`), state: { id, properties } }
  }).filter((block) => !isAir(block.state.id))
  assertBlockCount(blocks.length)
  return {
    name,
    format: 'normalized_json',
    size,
    blocks,
    paletteSize: new Set(blocks.map((block) => stateKey(block.state))).size,
    blockEntityCount: 0,
    entityCount: 0,
    warnings: [],
  }
}

function readPaletteState(raw: unknown): BlueprintState {
  const compound = requireCompound(raw, 'palette[]')
  const id = typeof compound.Name === 'string' ? compound.Name : 'minecraft:air'
  const properties = isCompound(compound.Properties)
    ? Object.fromEntries(Object.entries(compound.Properties).map(([key, value]) => [key, String(value)]))
    : {}
  return { id, properties }
}

function parseStateText(input: string): BlueprintState {
  const match = /^([^\[]+)(?:\[(.*)])?$/.exec(input)
  const id = match?.[1]?.trim() || 'minecraft:air'
  const properties: Record<string, string> = {}
  for (const pair of match?.[2]?.split(',') ?? []) {
    const separator = pair.indexOf('=')
    if (separator > 0) properties[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim()
  }
  return { id, properties }
}

function decodeVarInts(bytes: Uint8Array, expected: number): number[] {
  const output: number[] = []
  let value = 0
  let shift = 0
  for (const signed of bytes) {
    const byte = signed & 0xff
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      output.push(value >>> 0)
      value = 0
      shift = 0
      if (output.length === expected) break
    } else {
      shift += 7
      if (shift > 28) throw new Error('Sponge schematic 包含无效 VarInt')
    }
  }
  if (output.length < expected) throw new Error(`Sponge schematic 方块数据不完整：${output.length}/${expected}`)
  return output
}

function readPackedIndex(data: BigInt64Array, index: number, bits: number): number {
  const start = BigInt(index * bits)
  const firstIndex = Number(start >> 6n)
  const offset = Number(start & 63n)
  const first = BigInt.asUintN(64, data[firstIndex] ?? 0n)
  let value = first >> BigInt(offset)
  if (offset + bits > 64) {
    const second = BigInt.asUintN(64, data[firstIndex + 1] ?? 0n)
    value |= second << BigInt(64 - offset)
  }
  return Number(value & ((1n << BigInt(bits)) - 1n))
}

function readListVec3(raw: unknown, field: string): Vec3 {
  const list = tagList(raw)
  if (list.length < 3) throw new Error(`${field} 不是三维坐标`)
  return [tagNumber(list[0]), tagNumber(list[1]), tagNumber(list[2])]
}

function readCompoundVec3(raw: unknown, field: string): Vec3 {
  const value = requireCompound(raw, field)
  return [tagNumber(value.x), tagNumber(value.y), tagNumber(value.z)]
}

function tagNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'bigint') return Number(raw)
  if (isCompound(raw) && typeof raw.value === 'number') return raw.value
  throw new Error(`NBT 数值类型无效：${String(raw)}`)
}

function optionalNumber(raw: unknown): number | undefined {
  try { return raw == null ? undefined : tagNumber(raw) } catch { return undefined }
}

function tagList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function byteArray(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw
  throw new Error('蓝图缺少字节数组方块数据')
}

function longArray(raw: unknown): BigInt64Array {
  if (raw instanceof BigInt64Array) return raw
  throw new Error('Litematic 缺少 BlockStates LongArray')
}

function requireCompound(raw: unknown, field: string): Compound {
  if (!isCompound(raw)) throw new Error(`${field} 不是 Compound`)
  return raw
}

function isCompound(raw: unknown): raw is Compound {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    && !ArrayBuffer.isView(raw) && !(raw instanceof Map)
}

function assertVolume(size: Vec3) {
  if (size.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error(`蓝图尺寸无效：${size.join('×')}`)
  const volume = size[0] * size[1] * size[2]
  if (volume > MAX_VOLUME) throw new Error(`蓝图体积 ${volume.toLocaleString()} 超过前端安全上限 ${MAX_VOLUME.toLocaleString()}`)
}

function assertBlockCount(count: number) {
  if (count > MAX_VISIBLE_BLOCKS) {
    throw new Error(`可见方块数超过前端安全上限 ${MAX_VISIBLE_BLOCKS.toLocaleString()}，请先分割蓝图或使用服务端生成预览`)
  }
}

function isAir(id: string): boolean {
  return id === 'minecraft:air' || id === 'minecraft:cave_air' || id === 'minecraft:void_air' || id === 'minecraft:structure_void'
}

export function stateKey(state: BlueprintState): string {
  const properties = Object.entries(state.properties).sort(([left], [right]) => left.localeCompare(right))
  return `${state.id}[${properties.map(([key, value]) => `${key}=${value}`).join(',')}]`
}
