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

export type ModExportAsset = {
  path: string;
  kind: string;
  contentType: string;
  sha256: string;
  byteLength: number;
  media: boolean;
};

export type ModExportRegistryEntry = {
  entityId: string;
  publicId: string;
  id: string;
  registry: string;
  namespace: string;
  path: string;
  translationKey: string;
  iconPath: string;
  previewPath: string;
  names: Record<string, string>;
  data: Record<string, unknown>;
};

export type ModExportEntryDetail = {
  entityId: string;
  publicId: string;
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

export type ModExportTagDetail = {
  entityId: string;
  publicId: string;
  id: string;
  registry: string;
  memberCount: number;
  members: Array<{
    entityId: string;
    publicId: string;
    id: string;
    registry: string;
    names: Record<string, string>;
    iconPath: string;
  }>;
};

export type ModExportStructure = {
  id: string;
  structureId: string;
  assetPath: string;
  sourceFormat: string;
  summary: Record<string, unknown>;
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

export async function uploadModExportPackage(file: File, siteId: string, token: string, options: ModExportImportOptions, onProgress?: (progress: ModExportUploadProgress) => void) {
  onProgress?.({ phase: "hashing", percent: 0 });
  const sha256 = await computeFileSHA256(file);
  onProgress?.({ phase: "preparing", percent: 0 });
  const root = `/api/v1/mods/${encodeURIComponent(siteId)}/export-imports`;
  const ticket = await apiRequest<OSSDirectUploadTicket>(`${root}/uploads/presign`, {
    method: "POST",
    body: JSON.stringify({
      originalName: file.name,
      contentType: file.type || "application/zip",
      sizeBytes: file.size,
      sha256,
      category: "import-staging",
      source: "mcmods_exporter",
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
  if (!record?.id) throw new Error("mod export upload did not return a file record");
  const job = await apiRequest<ModExportJob>(root, { method: "POST", body: JSON.stringify({ ossFileId: record.id, ...options }) }, token);
  onProgress?.({ phase: "importing", percent: 100 });
  return job;
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

export function modExportStructureURL(revisionId: string, structureId: string) {
  return `${API_BASE_URL}/api/v1/export-revisions/${encodeURIComponent(revisionId)}/structures/${encodeURIComponent(structureId)}/template`;
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
