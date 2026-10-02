import { API_BASE_URL, apiRequest, backendFetch, isBearerAccessToken } from "./api";

export type ContentMetricActor = {
  id: string;
  name: string;
  avatarUrl?: string;
  occurredAt: string;
  count?: number;
  url: string;
};

type ContentMetricDeveloper = {
  id: string;
  kind: "author" | "team";
  name: string;
  avatarUrl?: string;
  role?: string;
  url: string;
};

type ContentMetricEditor = {
  id: string;
  name: string;
  avatarUrl?: string;
  role: "developer" | "editor";
  url: string;
};

export type ContentMetricReference = {
  id: string;
  kind: "tutorial" | "issue" | "news" | "discussion";
  title: string;
  url: string;
  publishedAt: string;
};

export type ContentMetrics = {
  id: string;
  type: string;
  createdAt: string;
  lastEditedAt?: string;
  editCount: number;
  directViews: number;
  childViews: number;
  totalViews: number;
  heatScore?: number;
  recentEditors: ContentMetricActor[];
  editors: ContentMetricEditor[];
  developers: ContentMetricDeveloper[];
  tutorials: ContentMetricReference[];
  issues: ContentMetricReference[];
  news: ContentMetricReference[];
  discussions: ContentMetricReference[];
  statisticsAsOf: string;
  includesChildren: boolean;
};

export function getContentMetrics(publicId: string, locale: string, token?: string) {
  return apiRequest<ContentMetrics>(`/api/v1/content-metrics/${encodeURIComponent(publicId)}?locale=${encodeURIComponent(locale)}`, {}, token);
}

export async function recordContentMetricView(publicId: string, pageKey: string, token?: string) {
  const headers = new Headers();
  if (isBearerAccessToken(token)) headers.set("Authorization", `Bearer ${token}`);
  const response = await backendFetch(`${API_BASE_URL}/api/v1/content-metrics/${encodeURIComponent(publicId)}/view?pageKey=${encodeURIComponent(pageKey)}`, {
    method: "POST",
    credentials: "include",
    headers,
  });
  if (!response.ok) throw new Error("failed to record content view");
}
