import { API_BASE_URL, apiRequest } from "./api";

export type LogShareEntry = {
  index: number;
  name: string;
  contentType: string;
  byteSize: number;
  lineCount: number;
  checksum: string;
};

export type LogShareChunk = {
  text: string;
  characterOffset: number;
  hasMore: boolean;
  nextCursor: string;
};

export type LogShare = {
  publicCode: string;
  sourceType: "file" | "paste";
  title: string;
  originalName: string;
  status: string;
  redactionVersion: number;
  redactionCounts: Record<string, number>;
  createdAt: string;
  expiresAt: string;
  downloadable: boolean;
  entries: LogShareEntry[];
};

export type CreatedLogShare = {
  publicCode: string;
  url: string;
  status: string;
  expiresAt: string;
  redactionVersion: number;
  redactionCounts: Record<string, number>;
  entryCount: number;
  fileId?: string;
  error?: string;
};

export type LogShareHistoryItem = {
  publicCode: string;
  sourceType: string;
  title: string;
  originalName: string;
  status: string;
  redactionVersion: number;
  createdAt: string;
  expiresAt: string;
};

export function createPastedLogShare(title: string, content: string, retentionDays: number, token = "") {
  return apiRequest<CreatedLogShare>("/api/v1/log-shares/paste", {
    method: "POST",
    body: JSON.stringify({ title, content, retentionDays }),
  }, token || undefined);
}

export function createFileLogShares(fileIds: string[], retentionDays: number, token: string) {
  return apiRequest<{ items: CreatedLogShare[] }>("/api/v1/log-shares/files", {
    method: "POST",
    body: JSON.stringify({ fileIds, retentionDays }),
  }, token);
}

export function loadPublicLogShare(code: string, signal?: AbortSignal) {
  return apiRequest<LogShare>(`/api/v1/log-shares/s/${encodeURIComponent(code)}`, { cache: "no-store", signal });
}

export function loadPublicLogShareEntry(code: string, entryIndex: number, options: { cursor?: string; signal?: AbortSignal } = {}) {
  const parameters = new URLSearchParams();
  if (options.cursor) parameters.set("cursor", options.cursor);
  const query = parameters.size ? `?${parameters}` : "";
  return apiRequest<LogShareChunk>(`/api/v1/log-shares/s/${encodeURIComponent(code)}/entries/${entryIndex}/content${query}`, {
    cache: "no-store",
    signal: options.signal,
  });
}

export async function loadMyLogShares(token: string, options: { query?: string; sourceType?: string; status?: string; direction?: "asc" | "desc"; limit?: number; offset?: number } = {}) {
  const parameters = new URLSearchParams({ limit: String(options.limit ?? 30), offset: String(options.offset ?? 0), direction: options.direction ?? "desc" });
  if (options.query?.trim()) parameters.set("q", options.query.trim());
  if (options.sourceType?.trim()) parameters.set("sourceType", options.sourceType.trim());
  if (options.status?.trim()) parameters.set("status", options.status.trim());
  const value = await apiRequest<{ items: Array<Record<string, unknown>>; total: number; limit: number; offset: number }>(`/api/v1/log-shares/me?${parameters}`, { cache: "no-store" }, token);
  return { ...value, items: value.items.map((item): LogShareHistoryItem => ({
    publicCode: text(item.public_code),
    sourceType: text(item.source_type),
    title: text(item.title),
    originalName: text(item.original_name),
    status: text(item.status),
    redactionVersion: number(item.redaction_version),
    createdAt: text(item.created_at),
    expiresAt: text(item.expires_at),
  })) };
}

export function deleteLogShare(code: string, token: string) {
  return apiRequest<{ deleted: boolean }>(`/api/v1/log-shares/${encodeURIComponent(code)}`, { method: "DELETE" }, token);
}

export function logShareURL(code: string) {
  return `/log/s/${encodeURIComponent(code)}`;
}

export function logShareDownloadURL(code: string) {
  return `${API_BASE_URL}/api/v1/log-shares/s/${encodeURIComponent(code)}/download`;
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
