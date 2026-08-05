import { apiRequest } from "./api";
import {
  abortMultipartUpload,
  completeOSSUpload,
  computeFileSHA256,
  putFileToOSS,
  type OSSDirectUploadTicket,
  type OSSFileRecord,
  type OSSUploadMetrics,
} from "./oss-upload";

export type ProjectFileSource = "internal" | "modrinth" | "curseforge";
export type ProjectReleaseChannel = "release" | "beta" | "alpha";

export type ProjectFile = {
  id: string;
  source: ProjectFileSource;
  displayName: string;
  fileName: string;
  versionName: string;
  releaseChannel: ProjectReleaseChannel;
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
  sizeBytes: number;
  downloadCount: number;
  downloadCountSource: string;
  sha1?: string;
  sha256?: string;
  sha512?: string;
  scanStatus?: string;
  downloadPath: string;
};

export type ProjectFilesResponse = {
  items: ProjectFile[];
  versions: string[];
  loaders: string[];
  providers: Record<ProjectFileSource, boolean>;
  warnings: Record<string, string>;
  canUpload: boolean;
  uploadPermission: string;
  totals: { files: number; internalDownloads: number };
};

export type CreateProjectFileInput = {
  ossFileId: string;
  displayName: string;
  versionName: string;
  releaseChannel: ProjectReleaseChannel;
  gameVersions: string[];
  loaders: string[];
};

export type ProjectDownloadTicket = {
  url: string;
  filename: string;
  expiresAt?: string;
};

export function projectFilesPath(projectType: string, projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/files`;
}

export async function uploadProjectFileToOSS(
  file: File,
  token: string,
  projectType: string,
  projectId: string,
  onProgress?: (loaded: number, total: number, metrics: OSSUploadMetrics) => void,
) {
  const sha256 = await computeFileSHA256(file);
  const basePath = projectFilesPath(projectType, projectId);
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const fallbackContentType = extension === ".jar"
    ? "application/java-archive"
    : extension === ".mrpack" || extension === ".zip"
      ? "application/zip"
      : "application/octet-stream";
  const ticket = await apiRequest<OSSDirectUploadTicket>(`${basePath}/uploads/presign`, {
    method: "POST",
    body: JSON.stringify({
      originalName: file.name,
      contentType: file.type || fallbackContentType,
      sizeBytes: file.size,
      sha256,
      category: "project/download",
      source: "project_download",
      projectUniqueId: projectId,
      projectType,
      preferMultipart: true,
    }),
  }, token);
  if (ticket.uploadRequired === false && ticket.file) return ticket.file;
  try {
    await putFileToOSS(ticket, file, onProgress);
  } catch (error) {
    await abortMultipartUpload(`${basePath}/uploads/complete`, ticket, token);
    throw error;
  }
  return completeOSSUpload<OSSFileRecord>(`${basePath}/uploads/complete`, ticket, token);
}
