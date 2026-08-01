import { API_BASE_URL, apiRequest } from "./api";
import {
  abortMultipartUpload,
  completeOSSUpload,
  computeFileSHA256,
  OSSDirectUploadTicket,
  OSSFileRecord,
  putFileToOSS,
} from "./oss-upload";
import type { CatalogResourceVersion } from "./editor-types";

export type ModExportJob = {
  id: string;
  modSiteId: string;
  packageId: string;
  targetVersionPublicId: string;
  overwriteExistingImportData: boolean;
  status: "queued" | "validating" | "importing" | "ready" | "partial" | "failed" | "cancelled";
  progress: number;
  currentStage: string;
  errorCode: string;
  errorDetail: Record<string, unknown>;
  deduplicated: boolean;
  reviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ModExportRevision = {
  id: string;
  revisionNo: number;
  status: string;
  minecraftVersion: string;
  loader: string;
  exporterVersion: string;
  sourceKind: string;
  namespace: string;
  targetVersionPublicId: string;
  isActive: boolean;
  registryCounts: Record<string, number>;
  documentCounts: Record<string, number>;
  assetCount: number;
  structureCount: number;
  advancementCount: number;
  keyMappingCount: number;
  recipeCount: number;
  tagCount: number;
  createdAt: string;
};

export type ModExportEntryDetail = {
  entityId: string;
  publicId: string;
  data: Record<string, unknown>;
  entryTypeCode: string;
  definitionSchemaVersion: number;
  name: string;
  summary: string;
  contentMarkdown: string;
  contentLocale: string;
  contentProvenance: string;
  modelAvailable: boolean;
  modelAssetPaths: string[];
  blockEntityModel?: {
    blockId: string;
    blockEntityTypeId: string;
    modelSource: string;
    modelAvailable: boolean;
    variants: Array<{
      variantId: string;
      objPath: string;
      meshPath: string;
      vertexCount: number;
      quadCount: number;
      coordinateSpace: string;
      uvSpace: string;
      uvOrigin: string;
      uvComplete: boolean;
      textures: Array<{ appearance?: string; path: string; uv_transform_required?: boolean }>;
      mesh: {
        schema_version?: string;
        coordinate_space?: string;
        uv_space?: string;
        uv_origin?: string;
        vertex_count?: number;
        quad_count?: number;
        faces?: Array<{ vertices: Array<{ position: number[]; uv: number[]; normal: number[] }> }>;
      };
    }>;
  };
  recipes: Record<string, unknown>[];
  uses: Record<string, unknown>[];
  versions: CatalogResourceVersion[];
};

export type ModExportUploadProgress = {
  phase: "hashing" | "preparing" | "uploading" | "confirming" | "importing";
  percent: number;
  loadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  retryCount?: number;
  stalled?: boolean;
  multipart?: boolean;
};

export type CatalogImportSource = "iconrenderer" | "letmeseesee" | "irr";

export type ModExportImportOptions = {
  targetVersionPublicId: string;
  overwriteExistingImportData: boolean;
};

export type ModExportUploadControl = {
  signal?: AbortSignal;
  resumeTicket?: OSSDirectUploadTicket;
  completedPartNumbers?: Iterable<number>;
  onTicket?: (ticket: OSSDirectUploadTicket) => void | Promise<void>;
  onPartComplete?: (partNumber: number) => void;
};

export async function uploadModExportPackage(
  file: File,
  siteId: string,
  token: string,
  options: ModExportImportOptions,
  onProgress?: (progress: ModExportUploadProgress) => void,
  control: ModExportUploadControl = {},
) {
  const root = `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports`;
  let ticket = control.resumeTicket;
  if (ticket && (ticket.sizeBytes !== file.size || ticket.originalName !== file.name)) {
    throw new Error("The persisted upload file no longer matches its OSS upload ticket.");
  }
  if (ticket) {
    ticket = await resumeModExportUploadTicket(siteId, ticket, token, control.signal);
    await control.onTicket?.(ticket);
  }
  if (!ticket) {
    onProgress?.({ phase: "hashing", percent: 0 });
    const sha256 = await computeFileSHA256(file);
    if (control.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    onProgress?.({ phase: "preparing", percent: 0 });
    ticket = await apiRequest<OSSDirectUploadTicket>(`${root}/uploads/presign`, {
      method: "POST",
      body: JSON.stringify({
        originalName: file.name,
        contentType: file.type || "application/zip",
        sizeBytes: file.size,
        sha256,
        category: "import-staging",
        source: "mcmods_exporter",
        preferMultipart: true,
        expiresMinutes: 60,
      }),
      signal: control.signal,
    }, token);
    await control.onTicket?.(ticket);
  }
  let record = ticket.file;
  if (ticket.uploadRequired !== false) {
    onProgress?.({ phase: "uploading", percent: 0 });
    await putFileToOSS(ticket, file, (loaded, total, metrics) => onProgress?.({
      phase: "uploading",
      percent: total > 0 ? Math.round(loaded / total * 100) : 0,
      ...metrics,
    }), {
      signal: control.signal,
      completedPartNumbers: control.completedPartNumbers,
      onPartComplete: control.onPartComplete,
    });
    if (control.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    onProgress?.({ phase: "confirming", percent: 100 });
    record = await completeOSSUpload<OSSFileRecord>(`${root}/uploads/complete`, ticket, token);
  }
  if (!record?.id) throw new Error("mod export upload did not return a file record");
  const job = await apiRequest<ModExportJob>(
    root,
    { method: "POST", body: JSON.stringify({ ossFileId: record.id, ...options }), signal: control.signal },
    token,
  );
  onProgress?.({ phase: "importing", percent: 100 });
  return job;
}

export function getModExportJob(siteId: string, jobId: string, token: string, signal?: AbortSignal) {
  return apiRequest<ModExportJob>(
    `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/${encodeURIComponent(jobId)}`,
    { signal },
    token,
  );
}

export function getActiveModExportJob(
  siteId: string,
  targetVersionId: string,
  token: string,
  signal?: AbortSignal,
) {
  return apiRequest<{ job: ModExportJob | null }>(
    `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/active?targetVersionId=${encodeURIComponent(targetVersionId)}`,
    { signal },
    token,
  ).then((response) => response.job);
}

export function cancelModExportJob(siteId: string, jobId: string, token: string) {
  return apiRequest<{ status: "cancelled" }>(
    `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/${encodeURIComponent(jobId)}/cancel`,
    { method: "POST" },
    token,
  );
}

export function cancelModExportUpload(siteId: string, ticket: OSSDirectUploadTicket, token: string) {
  return abortMultipartUpload(
    `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/uploads/complete`,
    ticket,
    token,
  );
}

function resumeModExportUploadTicket(
  siteId: string,
  ticket: OSSDirectUploadTicket,
  token: string,
  signal?: AbortSignal,
) {
  return apiRequest<OSSDirectUploadTicket>(
    `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/uploads/resume`,
    {
      method: "POST",
      body: JSON.stringify({
        objectKey: ticket.objectKey,
        originalName: ticket.originalName,
        contentType: ticket.contentType,
        sizeBytes: ticket.sizeBytes,
        sha256: ticket.sha256,
        multipartUploadId: ticket.multipart?.uploadId || "",
      }),
      signal,
    },
    token,
  );
}

export async function uploadEmbeddedIconCatalog(file: File, siteId: string, token: string, source: CatalogImportSource, options: ModExportImportOptions, onProgress?: (progress: ModExportUploadProgress) => void) {
  onProgress?.({ phase: "hashing", percent: 0 });
  const sha256 = await computeFileSHA256(file);
  onProgress?.({ phase: "preparing", percent: 0 });
  const root = `/api/v1/mods/${encodeURIComponent(siteId)}/catalog-imports`;
  const ticket = await apiRequest<OSSDirectUploadTicket>(`${root}/uploads/presign`, {
    method: "POST",
    body: JSON.stringify({
      originalName: file.name,
      contentType: file.type || "application/json",
      sizeBytes: file.size,
      sha256,
      category: "catalog-import-staging",
      source,
      preferMultipart: true,
    }),
  }, token);
  let record = ticket.file;
  if (ticket.uploadRequired !== false) {
    onProgress?.({ phase: "uploading", percent: 0 });
    try {
      await putFileToOSS(ticket, file, (loaded, total, metrics) => onProgress?.({
        phase: "uploading",
        percent: total > 0 ? Math.round(loaded / total * 100) : 0,
        ...metrics,
      }));
    } catch (error) {
      await abortMultipartUpload(`${root}/uploads/complete`, ticket, token);
      throw error;
    }
    onProgress?.({ phase: "confirming", percent: 100 });
    record = await completeOSSUpload<OSSFileRecord>(`${root}/uploads/complete`, ticket, token);
  }
  if (!record?.id) throw new Error("catalog import upload did not return a file record");
  const job = await apiRequest<ModExportJob>(root, {
    method: "POST",
    body: JSON.stringify({ ossFileId: record.id, source, ...options }),
  }, token);
  onProgress?.({ phase: "importing", percent: 100 });
  return job;
}

export async function waitForModExportJob(siteId: string, jobId: string, token: string, onProgress: (job: ModExportJob) => void, signal?: AbortSignal) {
  const path = `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/${encodeURIComponent(jobId)}`;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Polling aborted", "AbortError");
    const job = await apiRequest<ModExportJob>(path, { signal }, token);
    onProgress(job);
    if (["ready", "partial", "failed", "cancelled"].includes(job.status)) return job;
    await abortableDelay(1200, signal);
  }
}

export async function waitForCatalogImportJob(siteId: string, jobId: string, token: string, onProgress: (job: ModExportJob) => void, signal?: AbortSignal) {
  const path = `/api/v1/mods/${encodeURIComponent(siteId)}/catalog-imports/${encodeURIComponent(jobId)}`;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Polling aborted", "AbortError");
    const job = await apiRequest<ModExportJob>(path, { signal }, token);
    onProgress(job);
    if (["ready", "partial", "failed", "cancelled"].includes(job.status)) return job;
    await abortableDelay(1200, signal);
  }
}

export function retryModExportJob(siteId: string, jobId: string, token: string) {
  return apiRequest<ModExportJob>(`/api/v1/mods/${encodeURIComponent(siteId)}/export-imports/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
  }, token);
}

export function retryCatalogImportJob(siteId: string, jobId: string, token: string) {
  return apiRequest<ModExportJob>(`/api/v1/mods/${encodeURIComponent(siteId)}/catalog-imports/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
  }, token);
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Polling aborted", "AbortError"));
    }, { once: true });
  });
}

export function modExportAssetURL(revisionId: string, path: string, rendererProxy = false) {
  const proxy = rendererProxy ? "&proxy=renderer" : "";
  return `${API_BASE_URL}/api/v1/export-revisions/${encodeURIComponent(revisionId)}/assets/content?path=${encodeURIComponent(path)}${proxy}`;
}

export function minecraftLocale(locale: string) {
  const normalized = locale.replace("-", "_").toLowerCase();
  const aliases: Record<string, string> = {
    de: "de_de",
    en: "en_us",
    es: "es_es",
    fr: "fr_fr",
    ja: "ja_jp",
    ru: "ru_ru",
    zh: "zh_cn",
    zh_cn: "zh_cn",
    zh_tw: "zh_tw",
  };
  return aliases[normalized] ?? normalized;
}

export function getModExportEntryDetail(revisionId: string, registry: string, entityId: string, objectId: string, locale: string, token: string) {
  const search = new URLSearchParams({ registry, objectId, locale });
  if (entityId) search.set("entityId", entityId);
  return apiRequest<ModExportEntryDetail>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}/entry-detail?${search}`, {}, token);
}
