'use client'

import { useEffect, useRef, useState } from 'react'
import {
  StructureRenderer,
  type AssetSource,
  type BlueprintBlock,
  type RendererProgress,
  type StructureRendererLoadResult,
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
  onSelectBlock?: (block: BlueprintBlock | null) => void
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
  onSelectBlock,
}: StructureCanvasProps) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState<RendererProgress>()
  const [error, setError] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setError('')
    setProgress({ finishedStates: 0, totalStates: 0, currentState: t('mods.exportImport.renderer.reading') })
    const renderer = new StructureRenderer(host, assetSource, {
      autoRotate,
      showGrid,
      onProgress: (value) => { if (!cancelled) setProgress(value) },
      onLoaded: (value) => {
        if (!cancelled) {
          setProgress(undefined)
          onLoaded?.(value)
        }
      },
      onSelectBlock: (block) => { if (!cancelled) onSelectBlock?.(block) },
      onError: (reason) => { if (!cancelled) setError(reason.message) },
    })
    source.load()
      .then((bytes) => renderer.load(bytes, source.name))
      .catch((reason: unknown) => {
        if (!cancelled && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => {
      cancelled = true
      renderer.dispose()
    }
  }, [assetSource, source, source.key, source.name, autoRotate, showGrid, onLoaded, onSelectBlock, t])

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
