import { API_BASE_URL, apiRequest } from "./api";
import type { CatalogSortDirection, CatalogSortField } from "./catalog-sort";

export type SkinKind = "skin" | "cape";
export type SkinModel = "default" | "slim";
export type SkinVisibility = "public" | "unlisted" | "private";
type SkinReviewStatus = "pending" | "approved" | "rejected";

type SkinOwner = {
  id: string;
  username: string;
};

export type SkinTexture = {
  publicId: string;
  kind: SkinKind;
  model: SkinModel;
  name: string;
  description: string;
  tags: string[];
  visibility: SkinVisibility;
  reviewStatus: SkinReviewStatus;
  textureHash: string;
  textureUrl?: string;
  owner?: SkinOwner | null;
  downloads: number;
  createdAt: string;
  updatedAt?: string;
  canEdit: boolean;
  canUse: boolean;
  inWardrobe: boolean;
};

export type SkinListResponse = {
  items: SkinTexture[];
  total: number;
  limit: number;
  offset: number;
};

export type SkinServiceInfo = {
  enabled?: boolean;
  name?: string;
  yggdrasilApiRoot?: string;
  profileLimit?: number;
  textureUploadEnabled?: boolean;
  registrationEnabled?: boolean;
  launcher?: {
    enabled?: boolean;
    accountUuid?: string;
  };
};

export type PlayerProfile = {
  publicId: string;
  uuid: string;
  name: string;
  bio: string;
  visibility: SkinVisibility;
  isDefault: boolean;
  skin?: SkinTexture | null;
  cape?: SkinTexture | null;
  owner?: SkinOwner | null;
  createdAt: string;
  updatedAt: string;
};

export type LauncherSession = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  expiresAt?: string;
  ip?: string;
  userAgent?: string;
  deviceName?: string;
};

export type SkinQuery = {
  q?: string;
  kind?: "" | SkinKind;
  model?: "" | SkinModel;
  sort?: CatalogSortField;
  order?: CatalogSortDirection;
  limit?: number;
  offset?: number;
};

export type CreateSkinInput = {
  fileId: string;
  name: string;
  description: string;
  kind: SkinKind;
  model: SkinModel;
  visibility: SkinVisibility;
  tags: string[];
  defaultLocale: string;
  localizations: Array<{ locale: string; name: string; summary: string; contentMarkdown: string }>;
};

export type SavePlayerProfileInput = {
  name: string;
  bio?: string;
  visibility?: SkinVisibility;
  isDefault?: boolean;
};

type ItemsResponse<T> = { items: T[] } | T[];

export function loadSkinService(token?: string) {
  return apiRequest<SkinServiceInfo>("/api/v1/skin-service", {}, token);
}

export function loadSkins(query: SkinQuery, token?: string) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.model) params.set("model", query.model);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  params.set("limit", String(query.limit ?? 36));
  params.set("offset", String(query.offset ?? 0));
  return apiRequest<SkinListResponse>(`/api/v1/skins?${params}`, {}, token);
}

export function loadSkin(publicId: string, token?: string) {
  return apiRequest<SkinTexture>(`/api/v1/skins/${encodeURIComponent(publicId)}`, {}, token);
}

export function createSkin(input: CreateSkinInput, token: string) {
  return apiRequest<SkinTexture>("/api/v1/skins", {
    method: "POST",
    body: JSON.stringify(input),
  }, token);
}

export function updateSkin(publicId: string, input: Partial<Omit<CreateSkinInput, "fileId">> & { reason?: string }, token: string) {
  return apiRequest<SkinTexture | { updated: boolean; reviewRequired: boolean; revisionId: string; changeRequestId?: string }>(`/api/v1/skins/${encodeURIComponent(publicId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }, token);
}

export function deleteSkin(publicId: string, token: string) {
  return apiRequest<{ deleted?: boolean }>(`/api/v1/skins/${encodeURIComponent(publicId)}`, { method: "DELETE" }, token);
}

export async function loadWardrobe(token: string) {
  const response = await apiRequest<ItemsResponse<SkinTexture>>("/api/v1/users/me/skin-wardrobe", {}, token);
  return normalizeItems(response);
}

export function addToWardrobe(publicId: string, token: string) {
  return apiRequest<SkinTexture | { added: boolean }>(`/api/v1/users/me/skin-wardrobe/${encodeURIComponent(publicId)}`, { method: "PUT" }, token);
}

export function removeFromWardrobe(publicId: string, token: string) {
  return apiRequest<{ removed?: boolean }>(`/api/v1/users/me/skin-wardrobe/${encodeURIComponent(publicId)}`, { method: "DELETE" }, token);
}

export async function loadMyPlayerProfiles(token: string) {
  const response = await apiRequest<ItemsResponse<PlayerProfile>>("/api/v1/users/me/player-profiles", {}, token);
  return normalizeItems(response);
}

export async function loadPublicPlayerProfiles(userId: string, token?: string) {
  const response = await apiRequest<ItemsResponse<PlayerProfile>>(`/api/v1/users/${userId}/player-profiles`, {}, token);
  return normalizeItems(response);
}

export function loadPlayerProfile(publicId: string, token?: string) {
  return apiRequest<PlayerProfile>(`/api/v1/player-profiles/${encodeURIComponent(publicId)}`, {}, token);
}

export function createPlayerProfile(input: SavePlayerProfileInput, token: string) {
  return apiRequest<PlayerProfile>("/api/v1/users/me/player-profiles", {
    method: "POST",
    body: JSON.stringify(input),
  }, token);
}

export function updatePlayerProfile(publicId: string, input: Partial<SavePlayerProfileInput>, token: string) {
  return apiRequest<PlayerProfile>(`/api/v1/users/me/player-profiles/${encodeURIComponent(publicId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }, token);
}

export function deletePlayerProfile(publicId: string, token: string) {
  return apiRequest<{ deleted?: boolean }>(`/api/v1/users/me/player-profiles/${encodeURIComponent(publicId)}`, { method: "DELETE" }, token);
}

export function updatePlayerTextures(
  publicId: string,
  input: { skinPublicId?: string | null; capePublicId?: string | null },
  token: string,
) {
  return apiRequest<PlayerProfile>(`/api/v1/users/me/player-profiles/${encodeURIComponent(publicId)}/textures`, {
    method: "PUT",
    body: JSON.stringify(input),
  }, token);
}

export function saveLauncherCredential(password: string, token: string) {
  return apiRequest<{ enabled?: boolean; accountUuid?: string }>("/api/v1/users/me/launcher-credential", {
    method: "PUT",
    body: JSON.stringify({ password }),
  }, token);
}

export function deleteLauncherCredential(token: string) {
  return apiRequest<{ enabled?: boolean }>("/api/v1/users/me/launcher-credential", { method: "DELETE" }, token);
}

export async function loadLauncherSessions(token: string) {
  const response = await apiRequest<ItemsResponse<LauncherSession>>("/api/v1/users/me/launcher-sessions", {}, token);
  return normalizeItems(response);
}

export function deleteLauncherSession(id: string, token: string) {
  return apiRequest<{ deleted?: boolean }>(`/api/v1/users/me/launcher-sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

export function skinTextureURL(texture?: Pick<SkinTexture, "textureHash" | "textureUrl"> | null) {
  if (!texture) return "";
  if (texture.textureUrl) return absoluteAPIURL(texture.textureUrl);
  return texture.textureHash
    ? `${API_BASE_URL}/api/yggdrasil/textures/${encodeURIComponent(texture.textureHash)}`
    : "";
}

export function launcherServiceURL(service?: SkinServiceInfo | null) {
  const configured = service?.yggdrasilApiRoot;
  const value = configured ? absoluteAPIURL(configured) : `${API_BASE_URL}/api/yggdrasil`;
  return value.endsWith("/") ? value : `${value}/`;
}

function absoluteAPIURL(value: string) {
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return `${API_BASE_URL}${value.startsWith("/") ? value : `/${value}`}`;
  }
}

function normalizeItems<T>(response: ItemsResponse<T>) {
  return Array.isArray(response) ? response : response.items ?? [];
}
