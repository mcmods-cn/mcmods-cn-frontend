import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { parseBlueprint, type BlueprintBlock, type StructureBlueprint } from './blueprint'
import { buildStructureScene, disposeStructureGroup } from './structureScene'
import type { AssetSource, RendererProgress } from './types'

export interface StructureRendererLoadResult {
  blueprint: StructureBlueprint
  modeledStateCount: number
  fallbackStateCount: number
  fallbackBlockCount: number
  missingStates: Array<{ state: string; reason: string; blocks: number }>
}

export interface StructureRendererOptions {
  background?: THREE.ColorRepresentation
  maxPixelRatio?: number
  autoRotate?: boolean
  showGrid?: boolean
  onProgress?: (progress: RendererProgress) => void
  onSelectBlock?: (block: BlueprintBlock | null) => void
  onLoaded?: (result: StructureRendererLoadResult) => void
  onError?: (error: Error) => void
}

/**
 * Framework-independent Minecraft structure renderer.
 * Instantiate only in a browser/client component and always call dispose().
 */
export class StructureRenderer {
  readonly canvas: HTMLCanvasElement

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.05, 10_000)
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly observer: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private structureGroup?: THREE.Group
  private grid?: THREE.GridHelper
  private selection?: THREE.Box3Helper
  private blueprint?: StructureBlueprint
  private frame = 0
  private loadGeneration = 0
  private disposed = false
  private pointerStart?: { x: number; y: number }

  constructor(
    private readonly host: HTMLElement,
    private assetSource: AssetSource,
    private readonly options: StructureRendererOptions = {},
  ) {
    this.scene.background = new THREE.Color(options.background ?? '#0d1310')
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.maxPixelRatio ?? 2))
    this.canvas = this.renderer.domElement
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.host.appendChild(this.canvas)

    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x29352d, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(40, 70, 35)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x8cc9ff, 0.8)
    fill.position.set(-35, 25, -20)
    this.scene.add(fill)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.autoRotate = options.autoRotate ?? false
    this.controls.autoRotateSpeed = 0.55

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.animate()
  }

  setAssetSource(source: AssetSource) {
    this.assetSource = source
  }

  async load(input: Uint8Array, name: string): Promise<StructureRendererLoadResult> {
    if (this.disposed) throw new Error('StructureRenderer 已释放')
    const generation = ++this.loadGeneration
    this.clearStructure()
    const blueprint = parseBlueprint(input, name)
    this.blueprint = blueprint
    this.fitCamera()
    this.createGrid(blueprint.size)

    try {
      const built = await buildStructureScene(this.assetSource, blueprint, (finished, total, state) => {
        if (generation !== this.loadGeneration || this.disposed) return
        this.options.onProgress?.({ finishedStates: finished, totalStates: total, currentState: state })
      })
      if (generation !== this.loadGeneration || this.disposed) {
        disposeStructureGroup(built.group)
        throw new DOMException('结构加载已被新任务替换', 'AbortError')
      }
      this.structureGroup = built.group
      this.scene.add(built.group)
      const result: StructureRendererLoadResult = {
        blueprint,
        modeledStateCount: built.modeledStateCount,
        fallbackStateCount: built.fallbackStateCount,
        fallbackBlockCount: built.fallbackBlockCount,
        missingStates: built.missingStates,
      }
      this.options.onLoaded?.(result)
      return result
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      if (error.name !== 'AbortError') this.options.onError?.(error)
      throw error
    }
  }

  setAutoRotate(enabled: boolean) {
    this.controls.autoRotate = enabled
  }

  setGridVisible(visible: boolean) {
    if (this.grid) this.grid.visible = visible
  }

  resetCamera() {
    if (!this.blueprint) return
    const size = this.blueprint.size
    const center = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2)
    const radius = Math.max(2, Math.hypot(size[0], size[1], size[2]) / 2)
    this.controls.target.copy(center)
    this.camera.near = Math.max(0.02, radius / 1000)
    this.camera.far = Math.max(1000, radius * 20)
    this.camera.position.copy(center).add(
      new THREE.Vector3(1.25, 0.9, 1.25).normalize().multiplyScalar(radius * 2.35),
    )
    this.camera.updateProjectionMatrix()
    this.controls.minDistance = Math.max(0.5, radius * 0.05)
    this.controls.maxDistance = radius * 12
    this.controls.update()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.loadGeneration++
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.controls.dispose()
    this.clearStructure()
    this.renderer.dispose()
    this.canvas.remove()
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (!this.structureGroup || !this.pointerStart) return
    const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y)
    this.pointerStart = undefined
    if (moved > 4) return

    const bounds = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.structureGroup, true)
      .find((entry) => entry.object instanceof THREE.InstancedMesh && entry.instanceId !== undefined)
    this.disposeSelection()
    if (!hit || hit.instanceId === undefined) {
      this.options.onSelectBlock?.(null)
      return
    }
    const blocks = hit.object.userData.blueprintBlocks as BlueprintBlock[] | undefined
    const block = blocks?.[hit.instanceId]
    if (!block) return
    this.selection = new THREE.Box3Helper(
      new THREE.Box3(
        new THREE.Vector3(...block.position),
        new THREE.Vector3(block.position[0] + 1, block.position[1] + 1, block.position[2] + 1),
      ),
      0xffd45f,
    )
    this.scene.add(this.selection)
    this.options.onSelectBlock?.(block)
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private fitCamera() {
    this.resetCamera()
  }

  private createGrid(size: [number, number, number]) {
    const gridSize = Math.max(size[0], size[2], 1)
    this.grid = new THREE.GridHelper(gridSize, Math.min(Math.ceil(gridSize), 96), 0x53705a, 0x26352b)
    this.grid.position.set(size[0] / 2, -0.01, size[2] / 2)
    this.grid.visible = this.options.showGrid ?? true
    this.scene.add(this.grid)
  }

  private clearStructure() {
    this.disposeSelection()
    if (this.structureGroup) {
      this.structureGroup.removeFromParent()
      disposeStructureGroup(this.structureGroup)
      this.structureGroup = undefined
    }
    if (this.grid) {
      this.grid.removeFromParent()
      this.grid.geometry.dispose()
      const materials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
      materials.forEach((material) => material.dispose())
      this.grid = undefined
    }
    this.options.onSelectBlock?.(null)
  }

  private disposeSelection() {
    if (!this.selection) return
    this.selection.removeFromParent()
    this.selection.geometry.dispose()
    const materials = Array.isArray(this.selection.material) ? this.selection.material : [this.selection.material]
    materials.forEach((material) => material.dispose())
    this.selection = undefined
  }

  private animate = () => {
    if (this.disposed) return
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.animate)
  }
}
