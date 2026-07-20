import { apiRequest } from "./api";
import { computeFileSHA256, putFileToOSS, type OSSDirectUploadTicket, type OSSFileRecord } from "./oss-upload";

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
  ossFileId: number;
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
  onProgress?: (loaded: number, total: number) => void,
) {
  const sha256 = await computeFileSHA256(file);
  const basePath = projectFilesPath(projectType, projectId);
  const ticket = await apiRequest<OSSDirectUploadTicket>(`${basePath}/uploads/presign`, {
    method: "POST",
    body: JSON.stringify({
      originalName: file.name,
      contentType: file.type || "application/java-archive",
      sizeBytes: file.size,
      sha256,
      category: "project/download",
      source: "project_download",
      projectUniqueId: projectId,
    }),
  }, token);
  if (ticket.uploadRequired === false && ticket.file) return ticket.file;
  await putFileToOSS(ticket, file, onProgress);
  return apiRequest<OSSFileRecord>(`${basePath}/uploads/complete`, {
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
  }, token);
}
