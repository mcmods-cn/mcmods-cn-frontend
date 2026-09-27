import { IncrementalSHA256 } from "./oss-sha256-worker.mjs";

export const OSS_HASH_CHUNK_BYTES = 4 * 1024 * 1024;
export const OSS_HASH_MAX_CONCURRENCY = 1;
export const OSS_HASH_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

const minimumHashChunkBytes = 64 * 1024;
const maximumHashChunkBytes = 8 * 1024 * 1024;

export type OSSFileHashOptions = {
  chunkSizeBytes?: number;
  onProgress?: (hashedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
};

type HashWorkerResponse =
  | { type: "ack" }
  | { type: "done"; sha256: string }
  | { type: "error"; message: string };

type HashPermitWaiter = {
  onAbort?: () => void;
  reject: (reason: unknown) => void;
  resolve: (release: () => void) => void;
  signal?: AbortSignal;
};

let activeHashes = 0;
const hashWaiters: HashPermitWaiter[] = [];

export async function computeFileSHA256(file: Blob, options: OSSFileHashOptions = {}) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > OSS_HASH_MAX_FILE_BYTES) {
    throw new Error(`file exceeds browser hashing size limit (${OSS_HASH_MAX_FILE_BYTES} bytes)`);
  }
  const release = await acquireHashPermit(options.signal);
  try {
    throwIfHashAborted(options.signal);
    const chunkSize = normalizedHashChunkSize(options.chunkSizeBytes);
    if (typeof Worker !== "undefined") return await computeFileSHA256InWorker(file, chunkSize, options);
    return await computeFileSHA256WithoutWorker(file, chunkSize, options);
  } finally {
    release();
  }
}

async function computeFileSHA256InWorker(file: Blob, chunkSize: number, options: OSSFileHashOptions) {
  const worker = new Worker(new URL("./oss-sha256-worker.mjs", import.meta.url), { name: "oss-sha256", type: "module" });
  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      throwIfHashAborted(options.signal);
      const end = Math.min(file.size, offset + chunkSize);
      const buffer = await file.slice(offset, end).arrayBuffer();
      throwIfHashAborted(options.signal);
      const response = waitForHashWorker(worker, options.signal);
      worker.postMessage({ type: "chunk", buffer }, [buffer]);
      if ((await response).type !== "ack") throw new Error("file hashing worker returned an invalid chunk response");
      options.onProgress?.(end, file.size);
      throwIfHashAborted(options.signal);
    }
    const response = waitForHashWorker(worker, options.signal);
    worker.postMessage({ type: "finish" });
    const finished = await response;
    if (finished.type !== "done" || !/^[a-f0-9]{64}$/.test(finished.sha256)) {
      throw new Error("file hashing worker returned an invalid digest");
    }
    return finished.sha256;
  } finally {
    worker.terminate();
  }
}

async function computeFileSHA256WithoutWorker(file: Blob, chunkSize: number, options: OSSFileHashOptions) {
  const hasher = new IncrementalSHA256();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    throwIfHashAborted(options.signal);
    const end = Math.min(file.size, offset + chunkSize);
    const buffer = await file.slice(offset, end).arrayBuffer();
    throwIfHashAborted(options.signal);
    hasher.update(new Uint8Array(buffer));
    options.onProgress?.(end, file.size);
    throwIfHashAborted(options.signal);
    await yieldHashTask(options.signal);
  }
  throwIfHashAborted(options.signal);
  return hasher.digestHex();
}

function waitForHashWorker(worker: Worker, signal?: AbortSignal) {
  return new Promise<HashWorkerResponse>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent<HashWorkerResponse>) => {
      cleanup();
      if (event.data?.type === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve(event.data);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "file hashing worker failed"));
    };
    const onAbort = () => {
      cleanup();
      reject(hashAbortReason(signal));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function normalizedHashChunkSize(value = OSS_HASH_CHUNK_BYTES) {
  if (!Number.isFinite(value)) return OSS_HASH_CHUNK_BYTES;
  return Math.min(maximumHashChunkBytes, Math.max(minimumHashChunkBytes, Math.floor(value)));
}

function acquireHashPermit(signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(hashAbortReason(signal));
  if (activeHashes < OSS_HASH_MAX_CONCURRENCY) {
    activeHashes += 1;
    return Promise.resolve(releaseHashPermit);
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter: HashPermitWaiter = { reject, resolve, signal };
    waiter.onAbort = () => {
      const index = hashWaiters.indexOf(waiter);
      if (index >= 0) hashWaiters.splice(index, 1);
      reject(hashAbortReason(signal));
    };
    hashWaiters.push(waiter);
    signal?.addEventListener("abort", waiter.onAbort, { once: true });
  });
}

function releaseHashPermit() {
  for (;;) {
    const waiter = hashWaiters.shift();
    if (!waiter) {
      activeHashes -= 1;
      return;
    }
    if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
    if (waiter.signal?.aborted) {
      waiter.reject(hashAbortReason(waiter.signal));
      continue;
    }
    waiter.resolve(releaseHashPermit);
    return;
  }
}

function yieldHashTask(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(hashAbortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 0);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfHashAborted(signal?: AbortSignal): asserts signal is AbortSignal | undefined {
  if (signal?.aborted) throw hashAbortReason(signal);
}

function hashAbortReason(signal?: AbortSignal) {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("File hashing aborted", "AbortError");
}
