import type { AssetSource, BinarySource } from './types'

export type AssetUrlResolver = (normalizedPath: string) => string

/**
 * AssetSource backed by the Go API. The caller supplies the revision asset index,
 * so loader-side existence checks stay synchronous while contents are fetched lazily.
 */
export class IndexedHttpAssetSource implements AssetSource, BinarySource {
  private readonly paths: Set<string>

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
    const response = await this.get(path)
    return response.json() as Promise<T>
  }

  async text(path: string): Promise<string> {
    const response = await this.get(path)
    return response.text()
  }

  async bytes(path: string): Promise<Uint8Array> {
    const response = await this.get(path)
    return new Uint8Array(await response.arrayBuffer())
  }

  url(path: string): string | undefined {
    const normalized = normalizePath(path)
    return this.paths.has(normalized) ? this.resolveUrl(normalized) : undefined
  }

  private async get(path: string): Promise<Response> {
    const normalized = normalizePath(path)
    if (!this.paths.has(normalized)) throw new Error(`版本资源索引中不存在：${normalized}`)
    const response = await this.fetcher(this.resolveUrl(normalized), {
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
