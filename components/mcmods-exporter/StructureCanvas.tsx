'use client'

import { useEffect, useRef, useState } from 'react'
import {
  StructureRenderer,
  type AssetSource,
  type BlueprintBlock,
  type RendererProgress,
  type StructureRendererLoadResult,
  type OutsideLayerMode,
} from '@/lib/mcmods-exporter/renderer'
import { useI18n } from '@/app/_lib/i18n-provider'

export interface StructureCanvasSource {
  /** Must change whenever name or bytes change. */
  key: string
  name: string
  load: () => Promise<Uint8Array>
}

export interface StructureCanvasProps {
  assetSource: AssetSource
  source: StructureCanvasSource
  className?: string
  autoRotate?: boolean
  showGrid?: boolean
  onLoaded?: (result: StructureRendererLoadResult) => void
  onRenderedCover?: (cover: Blob) => void | Promise<void>
  onSelectBlock?: (block: BlueprintBlock | null) => void
  layerMin?: number
  layerMax?: number
  outsideLayerMode?: OutsideLayerMode
  showContextBelow?: boolean
  showContextAbove?: boolean
  firstPerson?: boolean
  cullInvisibleFaces?: boolean
}

/**
 * Thin Next.js client wrapper. Production pages should dynamically import this
 * component with ssr:false so Three.js and NBT parsers stay out of the server bundle.
 */
export function StructureCanvas({
  assetSource,
  source,
  className,
  autoRotate = false,
  showGrid = true,
  onLoaded,
  onRenderedCover,
  onSelectBlock,
  layerMin = 0,
  layerMax = Number.MAX_SAFE_INTEGER,
  outsideLayerMode = 'visible',
  showContextBelow = true,
  showContextAbove = true,
  firstPerson = false,
  cullInvisibleFaces = true,
}: StructureCanvasProps) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<StructureRenderer | null>(null)
  const layerViewRef = useRef({ min: layerMin, max: layerMax, mode: outsideLayerMode, showContextBelow, showContextAbove })
  const firstPersonRef = useRef(firstPerson)
  const onLoadedRef = useRef(onLoaded)
  const onRenderedCoverRef = useRef(onRenderedCover)
  const onSelectBlockRef = useRef(onSelectBlock)
  const [progress, setProgress] = useState<RendererProgress>()
  const [error, setError] = useState('')

  useEffect(() => {
    onLoadedRef.current = onLoaded
    onRenderedCoverRef.current = onRenderedCover
    onSelectBlockRef.current = onSelectBlock
  }, [onLoaded, onRenderedCover, onSelectBlock])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let teardown: (() => void) | undefined
    const initialize = () => {
      if (cancelled) return
      setError('')
      setProgress({ finishedStates: 0, totalStates: 0, currentState: t('mods.exportImport.renderer.reading') })
      let renderer: StructureRenderer
      try {
        renderer = new StructureRenderer(host, assetSource, {
          autoRotate,
          showGrid,
          cullInvisibleFaces,
          onProgress: (value) => { if (!cancelled) setProgress(value) },
          onLoaded: (value) => {
            if (!cancelled) {
              setProgress(undefined)
              onLoadedRef.current?.(value)
              if (onRenderedCoverRef.current) {
                renderer.captureImage()
                  .then((cover) => { if (!cancelled) return onRenderedCoverRef.current?.(cover) })
                  .catch(() => undefined)
              }
            }
          },
          onSelectBlock: (block) => { if (!cancelled) onSelectBlockRef.current?.(block) },
          onError: (reason) => { if (!cancelled) setError(reason.message) },
        })
      } catch (reason) {
        setProgress(undefined)
        setError(reason instanceof Error ? reason.message : String(reason))
        return
      }
      renderer.setFirstPerson(firstPersonRef.current)
      rendererRef.current = renderer
      source.load()
        .then((bytes) => { if (!cancelled) return renderer.load(bytes, source.name) })
        .then(() => {
          if (cancelled) return
          const layer = layerViewRef.current
          renderer.setLayerView(layer.min, layer.max, layer.mode, layer.showContextBelow, layer.showContextAbove)
        })
        .catch((reason: unknown) => {
          if (!cancelled && !(reason instanceof DOMException && reason.name === 'AbortError')) {
            setError(reason instanceof Error ? reason.message : String(reason))
          }
        })
      teardown = () => {
        rendererRef.current = null
        renderer.dispose()
      }
    }
    // Allocate WebGL only after the mounted host can participate in layout.
    const initializationFrame = requestAnimationFrame(initialize)
    return () => {
      cancelled = true
      cancelAnimationFrame(initializationFrame)
      teardown?.()
    }
  }, [assetSource, source, source.key, source.name, autoRotate, showGrid, cullInvisibleFaces, t])

  useEffect(() => {
    layerViewRef.current = { min: layerMin, max: layerMax, mode: outsideLayerMode, showContextBelow, showContextAbove }
    rendererRef.current?.setLayerView(layerMin, layerMax, outsideLayerMode, showContextBelow, showContextAbove)
  }, [layerMin, layerMax, outsideLayerMode, showContextBelow, showContextAbove])

  useEffect(() => {
    firstPersonRef.current = firstPerson
    rendererRef.current?.setFirstPerson(firstPerson)
  }, [firstPerson])

  const percent = progress?.totalStates
    ? Math.round(progress.finishedStates / progress.totalStates * 100)
    : 0

  return (
    <div className={className} style={{ position: 'relative', minHeight: 480, overflow: 'hidden' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {progress && (
        <div style={overlayStyle} role="status">
          <strong>{progress.totalStates ? t('mods.exportImport.renderer.building', { percent }) : progress.currentState}</strong>
          {progress.totalStates > 0 && <code>{progress.currentState}</code>}
        </div>
      )}
      {error && (
        <div style={overlayStyle} role="alert">
          <strong>{t('mods.exportImport.renderer.failed')}</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

const overlayStyle = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeContent: 'center',
  justifyItems: 'center',
  gap: 10,
  padding: 24,
  background: 'rgba(10, 15, 12, .88)',
  color: '#e7eee9',
  textAlign: 'center',
} as const
