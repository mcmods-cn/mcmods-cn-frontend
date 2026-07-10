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
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  scanStatus: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  accessUrl?: string;
};

type OSSDirectUploadTicket = {
  method?: string;
  url: string;
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
};

export async function uploadUserFileToOSS(file: File, token: string, source = "playground") {
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
      }),
    },
    token,
  );

  if (ticket.uploadRequired === false) {
    return normalizeUploadResult(ticket.file, ticket);
  }

  await putFileToOSS(ticket, file);
  const record = await apiRequest<OSSFileRecord>(
    "/api/v1/users/me/oss/uploads/complete",
    {
      method: "POST",
      body: JSON.stringify({
        objectKey: ticket.objectKey,
        originalName: ticket.originalName,
        contentType: ticket.contentType,
        sizeBytes: ticket.sizeBytes,
        sha256: ticket.sha256,
        category: ticket.category,
        source: ticket.source,
      }),
    },
    token,
  );
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

async function putFileToOSS(ticket: OSSDirectUploadTicket, file: File) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(ticket.headers ?? {})) {
    if (key.toLowerCase() !== "host") headers.set(key, value);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", ticket.contentType || file.type || "application/octet-stream");
  }
  const response = await fetch(ticket.url, {
    method: ticket.method || "PUT",
    headers,
    body: file,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `OSS upload failed: HTTP ${response.status}`);
  }
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
    contentType: ticket.contentType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
    status: "active",
    scanStatus: "pending",
    createdAt: "",
    updatedAt: "",
  } satisfies OSSFileRecord);
  return {
    ...file,
    accessUrl: ticket.accessUrl || record?.accessUrl || record?.url,
  };
}
