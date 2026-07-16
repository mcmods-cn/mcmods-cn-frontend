import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { parseBlueprint, type BlueprintBlock, type StructureBlueprint } from './blueprint'
import { buildStructureScene, disposeStructureGroup } from './structureScene'
import type { AssetSource, RendererProgress } from './types'

export interface StructureRendererLoadResult {
  blueprint: StructureBlueprint
  modeledStateCount: number
  fallbackStateCount: number
  fallbackBlockCount: number
  cullableFaceInstances: number
  renderedCullableFaceInstances: number
  culledFaceInstances: number
  drawCallCount: number
  missingStates: Array<{ state: string; reason: string; blocks: number }>
}

export interface StructureRendererOptions {
  background?: THREE.ColorRepresentation
  maxPixelRatio?: number
  autoRotate?: boolean
  showGrid?: boolean
  cullInvisibleFaces?: boolean
  onProgress?: (progress: RendererProgress) => void
  onSelectBlock?: (block: BlueprintBlock | null) => void
  onLoaded?: (result: StructureRendererLoadResult) => void
  onError?: (error: Error) => void
}

export type OutsideLayerMode = 'visible' | 'transparent' | 'hidden'

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
  private readonly firstPersonControls: PointerLockControls
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
  private firstPerson = false
  private previousFrameTime = performance.now()
  private readonly pressedKeys = new Set<string>()

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
    this.firstPersonControls = new PointerLockControls(this.camera, this.canvas)

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('contextmenu', this.preventContextMenu)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
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
      }, { cullInvisibleFaces: this.options.cullInvisibleFaces !== false })
      if (generation !== this.loadGeneration || this.disposed) {
        disposeStructureGroup(built.group)
        throw new DOMException('结构加载已被新任务替换', 'AbortError')
      }
      this.structureGroup = built.group
      this.scene.add(built.group)
      this.setLayerView(0, Math.max(0, blueprint.size[1] - 1), 'visible')
      const result: StructureRendererLoadResult = {
        blueprint,
        modeledStateCount: built.modeledStateCount,
        fallbackStateCount: built.fallbackStateCount,
        fallbackBlockCount: built.fallbackBlockCount,
        cullableFaceInstances: built.cullableFaceInstances,
        renderedCullableFaceInstances: built.renderedCullableFaceInstances,
        culledFaceInstances: built.culledFaceInstances,
        drawCallCount: built.drawCallCount,
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

  setLayerView(minLayer: number, maxLayer: number, outsideMode: OutsideLayerMode = 'transparent', showBelow = true, showAbove = true) {
    if (!this.structureGroup) return
    const lower = Math.min(minLayer, maxLayer)
    const upper = Math.max(minLayer, maxLayer)
    const originals: THREE.InstancedMesh[] = []
    this.structureGroup.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && !object.userData.layerContext) originals.push(object)
    })
    for (const mesh of originals) {
      const blocks = (mesh.userData.allBlueprintBlocks ?? mesh.userData.blueprintBlocks) as BlueprintBlock[] | undefined
      const matrices = mesh.userData.blueprintMatrices as THREE.Matrix4[] | undefined
      if (!blocks || !matrices) continue
      mesh.userData.allBlueprintBlocks = blocks
      let context = mesh.userData.layerContextMesh as THREE.InstancedMesh | undefined
      if (!context) {
        context = new THREE.InstancedMesh(mesh.geometry, transparentMaterial(mesh.material), blocks.length)
        context.name = `${mesh.name}#layer-context`
        context.userData.layerContext = true
        context.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.parent?.add(context)
        mesh.userData.layerContextMesh = context
      }
      const selectedBlocks: BlueprintBlock[] = []
      const contextBlocks: BlueprintBlock[] = []
      let selectedCount = 0
      let contextCount = 0
      blocks.forEach((block, index) => {
        const inRange = block.position[1] >= lower && block.position[1] <= upper
        if (inRange || outsideMode === 'visible') {
          mesh.setMatrixAt(selectedCount++, matrices[index])
          selectedBlocks.push(block)
        } else if (outsideMode === 'transparent' && ((showBelow && block.position[1] === lower - 1) || (showAbove && block.position[1] === upper + 1))) {
          context!.setMatrixAt(contextCount++, matrices[index])
          contextBlocks.push(block)
        }
      })
      mesh.count = selectedCount
      mesh.userData.blueprintBlocks = selectedBlocks
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
      context.count = contextCount
      context.userData.blueprintBlocks = contextBlocks
      context.instanceMatrix.needsUpdate = true
      if (contextCount) {
        context.computeBoundingBox()
        context.computeBoundingSphere()
      }
    }
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

  setFirstPerson(enabled: boolean) {
    this.firstPerson = enabled
    this.controls.enabled = !enabled
    if (!enabled && this.firstPersonControls.isLocked) this.firstPersonControls.unlock()
    this.canvas.style.cursor = enabled ? 'crosshair' : 'grab'
  }

  async captureImage(width = 1210, height = 750, type = 'image/webp', quality = 0.88): Promise<Blob> {
    if (!this.structureGroup) throw new Error('Structure is not ready')
    const target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    })
    target.texture.colorSpace = THREE.SRGBColorSpace
    const previousTarget = this.renderer.getRenderTarget()
    const previousAspect = this.camera.aspect
    const gridVisible = this.grid?.visible
    const selectionVisible = this.selection?.visible
    const pixels = new Uint8Array(width * height * 4)
    try {
      if (this.grid) this.grid.visible = false
      if (this.selection) this.selection.visible = false
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.renderer.setRenderTarget(target)
      this.renderer.render(this.scene, this.camera)
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
    } finally {
      this.renderer.setRenderTarget(previousTarget)
      this.camera.aspect = previousAspect
      this.camera.updateProjectionMatrix()
      if (this.grid && gridVisible !== undefined) this.grid.visible = gridVisible
      if (this.selection && selectionVisible !== undefined) this.selection.visible = selectionVisible
      target.dispose()
    }

    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    const context = output.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    const image = context.createImageData(width, height)
    const rowBytes = width * 4
    for (let sourceY = 0; sourceY < height; sourceY++) {
      const targetY = height - sourceY - 1
      image.data.set(pixels.subarray(sourceY * rowBytes, (sourceY + 1) * rowBytes), targetY * rowBytes)
    }
    context.putImageData(image, 0, 0)
    return canvasToBlob(output, type, quality)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.loadGeneration++
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    if (this.firstPersonControls.isLocked) this.firstPersonControls.unlock()
	this.firstPersonControls.disconnect()
    this.controls.dispose()
    this.clearStructure()
    this.renderer.dispose()
    this.canvas.remove()
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
	if (this.firstPerson) {
		if (event.button !== 0) return
		event.preventDefault()
		if (!this.firstPersonControls.isLocked) {
			this.firstPersonControls.lock()
		} else {
			this.selectBlockAt(0, 0)
		}
		this.pointerStart = undefined
		return
	}
    if (event.button !== 0) {
      this.pointerStart = undefined
      return
    }
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  private readonly preventContextMenu = (event: Event) => event.preventDefault()
  private readonly handleKeyDown = (event: KeyboardEvent) => {
	if (this.firstPerson) this.pressedKeys.add(event.code)
  }
  private readonly handleKeyUp = (event: KeyboardEvent) => this.pressedKeys.delete(event.code)

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.firstPerson) return
    if (event.button !== 0) {
      this.pointerStart = undefined
      return
    }
    if (!this.structureGroup || !this.pointerStart) return
    const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y)
    this.pointerStart = undefined
    if (moved > 4) return

    const bounds = this.canvas.getBoundingClientRect()
    this.selectBlockAt(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
  }

  private selectBlockAt(pointerX: number, pointerY: number) {
    if (!this.structureGroup) return
    this.pointer.set(pointerX, pointerY)
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
	const now = performance.now()
	const delta = Math.min(0.05, Math.max(0, (now - this.previousFrameTime) / 1000))
	this.previousFrameTime = now
	if (this.firstPerson && this.firstPersonControls.isLocked) {
		const speed = (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')) ? 18 : 8
		const forward = Number(this.pressedKeys.has('KeyW')) - Number(this.pressedKeys.has('KeyS'))
		const right = Number(this.pressedKeys.has('KeyD')) - Number(this.pressedKeys.has('KeyA'))
		if (forward) this.firstPersonControls.moveForward(forward * speed * delta)
		if (right) this.firstPersonControls.moveRight(right * speed * delta)
		if (this.pressedKeys.has('Space')) this.camera.position.y += speed * delta
		if (this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight')) this.camera.position.y -= speed * delta
	} else {
		this.controls.update()
	}
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.animate)
  }
}

function transparentMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  const clone = (entry: THREE.Material) => {
    const result = entry.clone()
    result.transparent = true
    result.opacity = 0.16
    result.depthWrite = false
    return result
  }
  return Array.isArray(material) ? material.map(clone) : clone(material)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode rendered structure image'))
    }, type, quality)
  })
}
