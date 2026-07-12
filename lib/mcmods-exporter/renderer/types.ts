export interface AssetSource {
  /** Whether this revision contains the normalized ZIP-relative asset path. */
  has(path: string): boolean
  /** Read and parse a UTF-8 JSON resource. */
  json<T>(path: string): Promise<T>
  /** Read a UTF-8 text resource such as OBJ or MTL. */
  text(path: string): Promise<string>
  /** Return a browser-loadable URL for PNG/texture bytes, or undefined when absent. */
  url(path: string): string | undefined
}

export interface BinarySource {
  bytes(path: string): Promise<Uint8Array>
}

export interface RendererProgress {
  finishedStates: number
  totalStates: number
  currentState: string
}
