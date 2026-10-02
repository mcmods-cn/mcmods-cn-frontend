import type { AssetSource, BinarySource } from './types'
import { AbortableSharedCache } from './structureLoadControl.mts'

export type AssetUrlResolver = (normalizedPath: string) => string

/**
 * AssetSource backed by the Go API. The caller supplies the revision asset index,
 * so loader-side existence checks stay synchronous while contents are fetched lazily.
 */
export class IndexedHttpAssetSource implements AssetSource, BinarySource {
  private readonly paths: Set<string>
  private readonly jsonCache = new AbortableSharedCache<unknown>()
  private readonly textCache = new AbortableSharedCache<string>()
  private readonly bytesCache = new AbortableSharedCache<Uint8Array>()

  constructor(
    paths: Iterable<string>,
    private readonly resolveUrl: AssetUrlResolver,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.paths = new Set(Array.from(paths, normalizePath))
  }

  has(path: string): boolean {
    return this.paths.has(normalizePath(path))
  }

  async json<T>(path: string, signal?: AbortSignal): Promise<T> {
    const normalized = normalizePath(path)
    return this.jsonCache.get(
      normalized,
      signal,
      (requestSignal) => this.get(normalized, requestSignal).then((response) => response.json()),
    ) as Promise<T>
  }

  async text(path: string, signal?: AbortSignal): Promise<string> {
    const normalized = normalizePath(path)
    return this.textCache.get(
      normalized,
      signal,
      (requestSignal) => this.get(normalized, requestSignal).then((response) => response.text()),
    )
  }

  async bytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    const normalized = normalizePath(path)
    return this.bytesCache.get(
      normalized,
      signal,
      (requestSignal) => this.get(normalized, requestSignal).then(async (response) => new Uint8Array(await response.arrayBuffer())),
    )
  }

  url(path: string): string | undefined {
    const normalized = normalizePath(path)
    return this.paths.has(normalized) ? this.resolveUrl(normalized) : undefined
  }

  private async get(path: string, signal: AbortSignal): Promise<Response> {
    const normalized = normalizePath(path)
    if (!this.paths.has(normalized)) throw new Error(`版本资源索引中不存在：${normalized}`)
    // Avoid binding the native Window.fetch receiver to this AssetSource.
    const fetcher = this.fetcher
    const response = await fetcher(this.resolveUrl(normalized), {
      credentials: 'include',
      headers: { Accept: contentType(normalized) },
      signal,
    })
    if (!response.ok) throw new Error(`读取资源失败：${normalized} (${response.status})`)
    return response
  }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.obj') || path.endsWith('.mtl')) return 'text/plain'
  return 'application/octet-stream'
}
