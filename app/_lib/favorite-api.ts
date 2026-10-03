import { API_BASE_URL, ApiError, apiRequest, backendFetch, isBearerAccessToken } from "./api";

export type FavoriteCollection = {
  id: string;
  name: string;
  isDefault: boolean;
  isPublic: boolean;
};

export type FavoriteCollectionItem = {
  entityType: string;
  entityPublicId: string;
  metadata: {
    primaryName?: string;
    secondaryName?: string;
    iconUrl?: string;
    slug?: string;
    title?: string;
    publicId?: string;
  };
};

export type FavoritePage<T> = {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type ModpackExportResultType = "exported" | "auto_dependency" | "skipped" | "failed";

export type FavoriteModpackExportRebuildSource = "current_collection" | "original_snapshot";

export type FavoriteModpackExportItem = {
  sourceProjectId?: string;
  sourceProjectType: string;
  sourceProjectName: string;
  resultType: ModpackExportResultType;
  reasonCode?: string;
  reasonDetail?: string;
  modrinthProjectId?: string;
  modrinthVersionId?: string;
  selectedVersionName?: string;
  selectedFileName?: string;
  minecraftVersion?: string;
  loader?: string;
  releaseType?: string;
  environmentClient?: string;
  environmentServer?: string;
  fileSize?: number;
  sha1?: string;
  sha512?: string;
  downloadUrl?: string;
  dependencyOf?: string[];
};

export type FavoriteModpackExportPreview = {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  collectionId: string;
  collectionName: string;
  minecraftVersion: string;
  loader: "neoforge" | "fabric" | "forge";
  loaderVersion: string;
  allowCompatibleOnly: boolean;
  reportVersion: number;
  rebuildSource: FavoriteModpackExportRebuildSource;
  collectionItemCount: number;
  exportedModCount: number;
  autoDependencyCount: number;
  skippedItemCount: number;
  failedItemCount: number;
  items: FavoriteModpackExportItem[];
};

export type FavoriteModpackExportTask = {
  id: string;
  collectionId: string;
  packName: string;
  packVersion: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion: string;
  allowCompatibleOnly: boolean;
  reportVersion: number;
  status: "pending" | "processing" | "ready" | "failed" | "expired" | "cancelled";
  collectionItemCount: number;
  exportedModCount: number;
  autoDependencyCount: number;
  skippedItemCount: number;
  failedItemCount: number;
  finalFileCount: number;
  fileSize: number;
  resultSha256?: string;
  errorCode?: string;
  createdAt: string;
  finishedAt?: string;
  expiresAt?: string;
};

export type FavoriteModpackExportStatus = FavoriteModpackExportTask["status"] | "all";

export type FavoriteModpackExportPage = {
  items: FavoriteModpackExportTask[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type FavoriteModpackExportDetail = {
  task: FavoriteModpackExportTask;
  items: FavoriteModpackExportItem[];
  downloadAvailable: boolean;
};

export function loadFavoriteCollections(token: string, cursor = "") {
  const query = favoritePageQuery(cursor);
  return apiRequest<FavoritePage<FavoriteCollection>>(`/api/v1/users/me/favorite-collections?${query}`, {}, token);
}

export async function createFavoriteCollection(token: string, name: string, isPublic = false) {
  return apiRequest<FavoriteCollection>("/api/v1/users/me/favorite-collections", { method: "POST", body: JSON.stringify({ name, isPublic }) }, token);
}

export async function updateFavoriteCollection(token: string, id: string, update: { name?: string; isPublic?: boolean }) {
  return apiRequest<FavoriteCollection>(`/api/v1/users/me/favorite-collections/${id}`, {
    method: "PUT",
    body: JSON.stringify(update),
  }, token);
}

export async function deleteFavoriteCollection(token: string, id: string) {
  await apiRequest<void>(`/api/v1/users/me/favorite-collections/${id}`, { method: "DELETE" }, token);
}

export function loadFavoriteItems(token: string, id: string, cursor = "") {
  const query = favoritePageQuery(cursor);
  return apiRequest<FavoritePage<FavoriteCollectionItem>>(`/api/v1/users/me/favorite-collections/${id}/items?${query}`, {}, token);
}

export function preflightFavoriteModpackExport(token: string, collectionId: string, minecraftVersion: string, loader: string) {
  return apiRequest<FavoriteModpackExportPreview>(`/api/v1/users/me/favorite-collections/${collectionId}/modpack-exports/preflight`, {
    method: "POST",
    body: JSON.stringify({ minecraftVersion, loader }),
  }, token);
}

export function createFavoriteModpackExport(
  token: string,
  collectionId: string,
  preview: FavoriteModpackExportPreview,
  exportCompatibleOnly: boolean,
) {
  return apiRequest<{ taskId: string; status: string; preview: FavoriteModpackExportPreview }>(
    `/api/v1/users/me/favorite-collections/${collectionId}/modpack-exports`,
    {
      method: "POST",
      body: JSON.stringify({
        minecraftVersion: preview.minecraftVersion,
        loader: preview.loader,
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        exportCompatibleOnly,
        confirmCompatibleOnly: exportCompatibleOnly,
      }),
    },
    token,
  );
}

export function loadFavoriteModpackExports(
  token: string,
  options: { status?: FavoriteModpackExportStatus; cursor?: string; limit?: number } = {},
) {
  const query = new URLSearchParams();
  query.set("status", options.status ?? "all");
  query.set("limit", String(options.limit ?? 30));
  if (options.cursor) query.set("cursor", options.cursor);
  return apiRequest<FavoriteModpackExportPage>(`/api/v1/users/me/modpack-exports?${query}`, {}, token);
}

export function loadFavoriteModpackExport(token: string, taskId: string) {
  return apiRequest<FavoriteModpackExportDetail>(`/api/v1/users/me/modpack-exports/${taskId}`, {}, token);
}

export function rebuildFavoriteModpackExportPreview(token: string, taskId: string, source: FavoriteModpackExportRebuildSource) {
  return apiRequest<FavoriteModpackExportPreview>(`/api/v1/users/me/modpack-exports/${taskId}/rebuild-preflight`, {
    method: "POST",
    body: JSON.stringify({ source }),
  }, token);
}

export function favoriteModpackExportDownloadURL(taskId: string) {
  return `${API_BASE_URL}/api/v1/users/me/modpack-exports/${taskId}/download`;
}

export async function downloadFavoriteModpackExport(token: string, taskId: string, fallbackName: string) {
  const response = await backendFetch(favoriteModpackExportDownloadURL(taskId), {
    credentials: "include",
    headers: isBearerAccessToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new ApiError(
      envelope.error ?? "favorite modpack export download failed",
      response.status,
      envelope.code ?? "MODPACK_EXPORT_DOWNLOAD_FAILED",
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fallbackName.endsWith(".mrpack") ? fallbackName : `${fallbackName}.mrpack`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function loadPublicFavoriteCollections(userId: string, token?: string, cursor = "") {
  const query = favoritePageQuery(cursor);
  return apiRequest<FavoritePage<FavoriteCollection>>(`/api/v1/users/${userId}/favorite-collections?${query}`, {}, token);
}

export function loadPublicFavoriteItems(userId: string, collectionId: string, token?: string, cursor = "") {
  const query = favoritePageQuery(cursor);
  return apiRequest<FavoritePage<FavoriteCollectionItem>>(
    `/api/v1/users/${userId}/favorite-collections/${collectionId}/items?${query}`,
    {},
    token,
  );
}

export type FavoriteMembershipSummary = {
  entityPublicIds: string[];
  collectionIdsByEntity: Record<string, string[]>;
};

export function loadFavoriteMembershipSummary(token: string, entityType: string, entityPublicIds: string[], collectionIds: string[] = []) {
  return apiRequest<FavoriteMembershipSummary>("/api/v1/users/me/favorites/summary", {
    method: "POST",
    body: JSON.stringify({ entityType, entityPublicIds, collectionIds }),
  }, token);
}

export function saveFavoriteMembershipChanges(token: string, entityType: string, entityPublicId: string, addCollectionIds: string[], removeCollectionIds: string[]) {
  return apiRequest<{ saved: boolean; selected: boolean }>("/api/v1/users/me/favorites", {
    method: "PATCH",
    body: JSON.stringify({ entityType, entityPublicId, addCollectionIds, removeCollectionIds }),
  }, token);
}

export async function saveFavoriteMembership(token: string, entityType: string, entityPublicId: string, collectionIds: string[]) {
  return apiRequest<{ collectionIds: string[] }>("/api/v1/users/me/favorites", {
    method: "PUT",
    body: JSON.stringify({ entityType, entityPublicId, collectionIds }),
  }, token);
}

export function favoriteItemHref(item: FavoriteCollectionItem) {
  const key = item.metadata.publicId || item.metadata.slug || item.entityPublicId;
  if (item.entityType === "mod") return `/mods/${key}`;
  if (item.entityType === "modpack") return `/modpacks/${key}`;
  if (item.entityType === "blueprint") return `/blueprints/${key}`;
  if (item.entityType === "skin") return `/skins/${key}`;
  return `/${key}`;
}

function favoritePageQuery(cursor: string) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return query;
}
