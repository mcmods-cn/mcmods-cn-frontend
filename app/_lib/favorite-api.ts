import { apiRequest } from "./api";

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
