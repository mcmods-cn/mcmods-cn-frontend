import { apiRequest } from "./api";

export type FavoriteCollection = {
  id: string;
  name: string;
  isDefault: boolean;
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

export async function createFavoriteCollection(token: string, name: string) {
  return apiRequest<FavoriteCollection>("/api/v1/users/me/favorite-collections", { method: "POST", body: JSON.stringify({ name }) }, token);
}

export async function deleteFavoriteCollection(token: string, id: string) {
  await apiRequest<void>(`/api/v1/users/me/favorite-collections/${id}`, { method: "DELETE" }, token);
}

export async function loadFavoriteItems(token: string, id: string) {
  return (await apiRequest<{ items: FavoriteCollectionItem[] }>(`/api/v1/users/me/favorite-collections/${id}/items`, {}, token)).items;
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
