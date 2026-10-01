import { API_BASE_URL, apiRequest, backendFetch, isBearerAccessToken } from "./api";

export type FavoriteCollection = {
  id: string;
  name: string;
  isDefault: boolean;
  isPublic: boolean;
  itemCount: number;
};

export type FavoriteCollectionItem = {
  entityType: string;
  entityKey: string;
  metadata: {
    primaryName?: string;
    secondaryName?: string;
    iconUrl?: string;
    slug?: string;
    title?: string;
    publicId?: string;
  };
};

export type ModpackExportResultType = "exported" | "auto_dependency" | "skipped" | "failed";

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
  collectionId: string;
  collectionName: string;
  minecraftVersion: string;
  loader: "neoforge" | "fabric" | "forge";
  loaderVersion: string;
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

export type FavoriteModpackExportDetail = {
  task: FavoriteModpackExportTask;
  items: FavoriteModpackExportItem[];
  downloadAvailable: boolean;
};

export async function loadFavoriteCollections(token: string) {
  return (await apiRequest<{ items: FavoriteCollection[] }>("/api/v1/users/me/favorite-collections", {}, token)).items;
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

export async function loadFavoriteItems(token: string, id: string) {
  return (await apiRequest<{ items: FavoriteCollectionItem[] }>(`/api/v1/users/me/favorite-collections/${id}/items`, {}, token)).items;
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
  minecraftVersion: string,
  loader: string,
  exportCompatibleOnly: boolean,
) {
  return apiRequest<{ taskId: string; status: string; preview: FavoriteModpackExportPreview }>(
    `/api/v1/users/me/favorite-collections/${collectionId}/modpack-exports`,
    {
      method: "POST",
      body: JSON.stringify({ minecraftVersion, loader, exportCompatibleOnly, confirmCompatibleOnly: exportCompatibleOnly }),
    },
    token,
  );
}

export async function loadFavoriteModpackExports(token: string) {
  return (await apiRequest<{ items: FavoriteModpackExportTask[] }>("/api/v1/users/me/modpack-exports", {}, token)).items;
}

export function loadFavoriteModpackExport(token: string, taskId: string) {
  return apiRequest<FavoriteModpackExportDetail>(`/api/v1/users/me/modpack-exports/${taskId}`, {}, token);
}

export function favoriteModpackExportDownloadURL(taskId: string) {
  return `${API_BASE_URL}/api/v1/users/me/modpack-exports/${taskId}/download`;
}

export async function downloadFavoriteModpackExport(token: string, taskId: string, fallbackName: string) {
  const response = await backendFetch(favoriteModpackExportDownloadURL(taskId), {
    credentials: "include",
    headers: isBearerAccessToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error("整合包下载失败或下载链接已过期");
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

export async function loadPublicFavoriteCollections(userId: string, token?: string) {
  return (await apiRequest<{ items: FavoriteCollection[] }>(`/api/v1/users/${userId}/favorite-collections`, {}, token)).items;
}

export async function loadPublicFavoriteItems(userId: string, collectionId: string, token?: string) {
  return (await apiRequest<{ items: FavoriteCollectionItem[] }>(
    `/api/v1/users/${userId}/favorite-collections/${collectionId}/items`,
    {},
    token,
  )).items;
}

export async function loadFavoriteMembership(token: string, entityType: string, entityKey: string) {
  const query = new URLSearchParams({ entityType, entityPublicId: entityKey });
  return (await apiRequest<{ collectionIds: string[] }>(`/api/v1/users/me/favorites?${query}`, {}, token)).collectionIds;
}

export async function saveFavoriteMembership(token: string, entityType: string, entityKey: string, collectionIds: string[]) {
  return apiRequest<{ collectionIds: string[] }>("/api/v1/users/me/favorites", {
    method: "PUT",
    body: JSON.stringify({ entityType, entityPublicId: entityKey, collectionIds }),
  }, token);
}

export function favoriteItemHref(item: FavoriteCollectionItem) {
  const key = item.metadata.publicId || item.metadata.slug || item.entityKey;
  if (item.entityType === "mod") return `/mods/${key}`;
  if (item.entityType === "modpack") return `/modpacks/${key}`;
  if (item.entityType === "blueprint") return `/blueprints/${key}`;
  if (item.entityType === "skin") return `/skins/${key}`;
  return `/${key}`;
}
