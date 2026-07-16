import type { AssetSource, BinarySource } from './types'

export type AssetUrlResolver = (normalizedPath: string) => string

/**
 * AssetSource backed by the Go API. The caller supplies the revision asset index,
 * so loader-side existence checks stay synchronous while contents are fetched lazily.
 */
export class IndexedHttpAssetSource implements AssetSource, BinarySource {
  private readonly paths: Set<string>
  private readonly jsonCache = new Map<string, Promise<unknown>>()
  private readonly textCache = new Map<string, Promise<string>>()
  private readonly bytesCache = new Map<string, Promise<Uint8Array>>()

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

  async json<T>(path: string): Promise<T> {
    const normalized = normalizePath(path)
    let pending = this.jsonCache.get(normalized)
    if (!pending) {
      pending = this.get(normalized).then((response) => response.json())
      this.jsonCache.set(normalized, pending)
      pending.catch(() => this.jsonCache.delete(normalized))
    }
    return pending as Promise<T>
  }

  async text(path: string): Promise<string> {
    const normalized = normalizePath(path)
    let pending = this.textCache.get(normalized)
    if (!pending) {
      pending = this.get(normalized).then((response) => response.text())
      this.textCache.set(normalized, pending)
      pending.catch(() => this.textCache.delete(normalized))
    }
    return pending
  }

  async bytes(path: string): Promise<Uint8Array> {
    const normalized = normalizePath(path)
    let pending = this.bytesCache.get(normalized)
    if (!pending) {
      pending = this.get(normalized).then(async (response) => new Uint8Array(await response.arrayBuffer()))
      this.bytesCache.set(normalized, pending)
      pending.catch(() => this.bytesCache.delete(normalized))
    }
    return pending
  }

  url(path: string): string | undefined {
    const normalized = normalizePath(path)
    return this.paths.has(normalized) ? this.resolveUrl(normalized) : undefined
  }

  private async get(path: string): Promise<Response> {
    const normalized = normalizePath(path)
    if (!this.paths.has(normalized)) throw new Error(`版本资源索引中不存在：${normalized}`)
    // Avoid binding the native Window.fetch receiver to this AssetSource.
    const fetcher = this.fetcher
    const response = await fetcher(this.resolveUrl(normalized), {
      credentials: 'include',
      headers: { Accept: contentType(normalized) },
    })
    if (!response.ok) throw new Error(`读取资源失败：${normalized} (${response.status})`)
    return response
  }
}

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.obj') || path.endsWith('.mtl')) return 'text/plain'
  return 'application/octet-stream'
}
