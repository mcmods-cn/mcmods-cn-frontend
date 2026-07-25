import { apiRequest } from "./api";

export type OSSFileRecord = {
  id: number;
  bucket: string;
  endpoint: string;
  region: string;
  objectKey: string;
  category: string;
  source: string;
  originalName: string;
  sourceOriginalName?: string;
  contentType: string;
  sizeBytes: number;
  sourceSizeBytes?: number;
  converted?: boolean;
  sha256: string;
  status: string;
  scanStatus: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  accessUrl?: string;
  blueprintId?: string;
  blueprint?: { id: string; status: string; jobId?: number };
};

export type OSSDirectUploadTicket = {
  method?: string;
  url?: string;
  accessUrl?: string;
  headers?: Record<string, string>;
  bucket: string;
  objectKey: string;
  category: string;
  source: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadRequired?: boolean;
  file?: OSSFileRecord;
  blueprintId?: string;
  blueprint?: { id: string; status: string; jobId?: number };
  multipart?: {
    uploadId: string;
    partSize: number;
    parts: Array<{
      partNumber: number;
      sizeBytes: number;
      method: string;
      url: string;
      headers?: Record<string, string>;
    }>;
  };
};

export type OSSUploadMetrics = {
  loadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number;
  retryCount: number;
  stalled: boolean;
  multipart: boolean;
};

export async function uploadUserFileToOSS(
  file: File,
  token: string,
  source = "playground",
  onProgress?: (loaded: number, total: number, metrics: OSSUploadMetrics) => void,
) {
  const sha256 = await computeFileSHA256(file);
  const ticket = await apiRequest<OSSDirectUploadTicket>(
    "/api/v1/users/me/oss/uploads/presign",
    {
      method: "POST",
      body: JSON.stringify({
        originalName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        sha256,
        category: source,
        source,
        preferMultipart: true,
      }),
    },
    token,
  );

  if (ticket.uploadRequired === false) {
    return normalizeUploadResult(ticket.file, ticket);
  }

  try {
    await putFileToOSS(ticket, file, onProgress);
  } catch (error) {
    await abortMultipartUpload("/api/v1/users/me/oss/uploads/complete", ticket, token);
    throw error;
  }
  const record = await completeOSSUpload("/api/v1/users/me/oss/uploads/complete", ticket, token);
  return normalizeUploadResult(record, ticket);
}

export async function computeFileSHA256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function markdownForUploadedFile(file: File, url: string) {
  const escapedName = file.name.replaceAll("]", "\\]");
  if (file.type.startsWith("image/")) {
    return `![${escapedName}](${url})`;
  }
  return `[${escapedName}](${url})`;
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export async function putFileToOSS(
  ticket: OSSDirectUploadTicket,
  file: File,
  onProgress?: (loaded: number, total: number, metrics: OSSUploadMetrics) => void,
) {
  if (ticket.multipart) {
    await putMultipartFileToOSS(ticket, file, onProgress);
    return;
  }
  if (!ticket.url) throw new Error("OSS upload ticket has no upload URL");
  const report = createUploadReporter(file.size, false, onProgress);
  await uploadWithRetry(
    ticket.method || "PUT",
    ticket.url,
    ticket.headers,
    file,
    (loaded, retryCount, stalled) => report(loaded, retryCount, stalled),
  );
  report(file.size, 0, false, true);
}

export function ossUploadCompletionPayload(ticket: OSSDirectUploadTicket, multipartAction = "complete") {
  return {
    objectKey: ticket.objectKey,
    originalName: ticket.originalName,
    contentType: ticket.contentType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
    category: ticket.category,
    source: ticket.source,
    multipartUploadId: ticket.multipart?.uploadId || "",
    multipartAction: ticket.multipart ? multipartAction : "",
  };
}

export async function completeOSSUpload<T = OSSFileRecord>(endpoint: string, ticket: OSSDirectUploadTicket, token: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await apiRequest<T>(endpoint, {
        method: "POST",
        body: JSON.stringify(ossUploadCompletionPayload(ticket)),
      }, token);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await uploadRetryDelay(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function abortMultipartUpload(endpoint: string, ticket: OSSDirectUploadTicket, token: string) {
  if (!ticket.multipart?.uploadId) return;
  try {
    await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(ossUploadCompletionPayload(ticket, "abort")),
    }, token);
  } catch {
    // An OSS lifecycle rule remains the final cleanup safety net when the
    // browser loses connectivity before the abort request can reach the API.
  }
}

async function putMultipartFileToOSS(
  ticket: OSSDirectUploadTicket,
  file: File,
  onProgress?: (loaded: number, total: number, metrics: OSSUploadMetrics) => void,
) {
  const multipart = ticket.multipart;
  if (!multipart || multipart.parts.length === 0 || multipart.partSize <= 0) {
    throw new Error("OSS multipart upload ticket is incomplete");
  }
  const report = createUploadReporter(file.size, true, onProgress);
  const loadedByPart = new Array<number>(multipart.parts.length).fill(0);
  const controller = new AbortController();
  let nextPart = 0;
  let highestRetry = 0;

  const reportAggregate = (retryCount: number, stalled: boolean, final = false) => {
    highestRetry = Math.max(highestRetry, retryCount);
    report(loadedByPart.reduce((sum, value) => sum + value, 0), highestRetry, stalled, final);
  };
  const worker = async () => {
    for (;;) {
      const index = nextPart;
      nextPart += 1;
      if (index >= multipart.parts.length) return;
      const part = multipart.parts[index];
      const start = (part.partNumber - 1) * multipart.partSize;
      const body = file.slice(start, start + part.sizeBytes);
      await uploadWithRetry(
        part.method || "PUT",
        part.url,
        part.headers,
        body,
        (loaded, retryCount, stalled) => {
          loadedByPart[index] = Math.min(part.sizeBytes, loaded);
          reportAggregate(retryCount, stalled);
        },
        controller.signal,
      );
      loadedByPart[index] = part.sizeBytes;
      reportAggregate(0, false);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(4, multipart.parts.length) }, () => worker()));
  } catch (error) {
    controller.abort();
    throw error;
  }
  report(file.size, highestRetry, false, true);
}

async function uploadWithRetry(
  method: string,
  url: string,
  rawHeaders: Record<string, string> | undefined,
  body: Blob,
  onProgress: (loaded: number, retryCount: number, stalled: boolean) => void,
  signal?: AbortSignal,
) {
  const maximumRetries = 3;
  for (let retryCount = 0; retryCount <= maximumRetries; retryCount += 1) {
    if (signal?.aborted) throw new DOMException("OSS upload aborted", "AbortError");
    try {
      await uploadBlobWithXHR(method, url, rawHeaders, body, (loaded, stalled) => onProgress(loaded, retryCount, stalled), signal);
      return;
    } catch (error) {
      if (signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
      if (retryCount >= maximumRetries) throw error;
      onProgress(0, retryCount + 1, false);
      await uploadRetryDelay(500 * 2 ** retryCount, signal);
    }
  }
}

async function uploadBlobWithXHR(
  method: string,
  url: string,
  rawHeaders: Record<string, string> | undefined,
  body: Blob,
  onProgress: (loaded: number, stalled: boolean) => void,
  signal?: AbortSignal,
) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders ?? {})) {
    if (!["host", "content-length"].includes(key.toLowerCase())) headers.set(key, value);
  }
  if (!headers.has("Content-Type") && body.type) headers.set("Content-Type", body.type);
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let stalled = false;
    let settled = false;
    let stallTimer = 0;
    const clear = () => {
      window.clearTimeout(stallTimer);
      signal?.removeEventListener("abort", abort);
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clear();
      action();
    };
    const armStallTimer = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        stalled = true;
        onProgress(0, true);
        request.abort();
      }, 30_000);
    };
    const abort = () => request.abort();
    request.open(method, url, true);
    headers.forEach((value, key) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      armStallTimer();
      onProgress(event.loaded, false);
    };
    request.onerror = () => finish(() => reject(new Error("OSS upload network error")));
    request.onabort = () => finish(() => reject(stalled ? new Error("OSS upload stalled for 30 seconds") : new DOMException("OSS upload aborted", "AbortError")));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(body.size, false);
        finish(resolve);
        return;
      }
      finish(() => reject(new Error(request.responseText || `OSS upload failed: HTTP ${request.status}`)));
    };
    signal?.addEventListener("abort", abort, { once: true });
    armStallTimer();
    request.send(body);
  });
}

function createUploadReporter(
  totalBytes: number,
  multipart: boolean,
  onProgress?: (loaded: number, total: number, metrics: OSSUploadMetrics) => void,
) {
  const startedAt = performance.now();
  let maximumLoaded = 0;
  let lastEmittedAt = 0;
  return (loadedBytes: number, retryCount: number, stalled: boolean, final = false) => {
    maximumLoaded = Math.max(maximumLoaded, Math.min(totalBytes, loadedBytes));
    const now = performance.now();
    if (!final && !stalled && now - lastEmittedAt < 100) return;
    lastEmittedAt = now;
    const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
    const bytesPerSecond = maximumLoaded / elapsedSeconds;
    const etaSeconds = bytesPerSecond > 0 ? Math.max(0, (totalBytes - maximumLoaded) / bytesPerSecond) : 0;
    onProgress?.(maximumLoaded, totalBytes, {
      loadedBytes: maximumLoaded, totalBytes, bytesPerSecond, etaSeconds,
      retryCount, stalled, multipart,
    });
  };
}

function uploadRetryDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("OSS upload aborted", "AbortError"));
      return;
    }
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("OSS upload aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function normalizeUploadResult(record: OSSFileRecord | undefined, ticket: OSSDirectUploadTicket) {
  const file = record ?? ({
    id: 0,
    bucket: ticket.bucket,
    endpoint: "",
    region: "",
    objectKey: ticket.objectKey,
    category: ticket.category,
    source: ticket.source,
    originalName: ticket.originalName,
    sourceOriginalName: ticket.originalName,
    contentType: ticket.contentType,
    sizeBytes: ticket.sizeBytes,
    sourceSizeBytes: ticket.sizeBytes,
    converted: false,
    sha256: ticket.sha256,
    status: "active",
    scanStatus: "pending",
    createdAt: "",
    updatedAt: "",
  } satisfies OSSFileRecord);
  return {
    ...file,
    // The completion endpoint may replace a source PNG/JPEG with a WebP
    // object. Prefer its final URL; the presign ticket still points at the
    // consumed source object in that case.
    accessUrl: record?.accessUrl || record?.url || ticket.accessUrl,
    blueprintId: record?.blueprintId || ticket.blueprintId || record?.blueprint?.id || ticket.blueprint?.id,
    blueprint: record?.blueprint || ticket.blueprint,
  };
}
