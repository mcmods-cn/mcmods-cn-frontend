import { API_BASE_URL, apiRequest, backendFetch, isBearerAccessToken } from "./api";

export type RatingTargetType =
  | "mod"
  | "modpack"
  | "plugin"
  | "addon"
  | "shader_pack"
  | "resource_pack"
  | "datapack"
  | "map"
  | "minecraft_server";

export type RatingDimensionSummary = {
  code: string;
  average: number;
  count: number;
};

export type RatingItem = {
  id: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  overallScore: number;
  scores: Record<string, number>;
  message: string;
  createdAt: string;
  updatedAt: string;
};

export type RatingSummary = {
  targetType: RatingTargetType;
  targetId: string;
  overallAverage: number;
  ratingCount: number;
  dimensions: RatingDimensionSummary[];
  heatScore: number;
  heatComponents: {
    longTerm: number;
    trend: number;
    effectiveView: number;
    promotion: number;
    quality: number;
    newProject: number;
  };
  engagement: {
    views: number;
    downloads: number;
    favorites: number;
    comments: number;
  };
  canRate: boolean;
  canViewReviews: boolean;
  myRating?: RatingItem;
};

export type RatingList = {
  items: RatingItem[];
  total: number;
  limit: number;
  offset: number;
};

export type RatingPayload = {
  overallScore: number;
  scores: Record<string, number>;
  message: string;
};

function ratingPath(targetType: RatingTargetType, targetId: string) {
  return `/api/v1/ratings/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`;
}

export function getRatingSummary(targetType: RatingTargetType, targetId: string, token?: string) {
  return apiRequest<RatingSummary>(ratingPath(targetType, targetId), {}, token);
}

export function getRatingReviews(targetType: RatingTargetType, targetId: string, token?: string, offset = 0) {
  return apiRequest<RatingList>(`${ratingPath(targetType, targetId)}/reviews?limit=20&offset=${offset}`, {}, token);
}

export function saveRating(targetType: RatingTargetType, targetId: string, payload: RatingPayload, token?: string) {
  return apiRequest<RatingItem>(ratingPath(targetType, targetId), {
    method: "PUT",
    body: JSON.stringify(payload),
  }, token);
}

export async function deleteRating(targetType: RatingTargetType, targetId: string, token?: string) {
  const headers = new Headers();
  if (isBearerAccessToken(token)) headers.set("Authorization", `Bearer ${token}`);
  const response = await backendFetch(`${API_BASE_URL}${ratingPath(targetType, targetId)}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });
  if (!response.ok) throw new Error("failed to delete rating");
}
