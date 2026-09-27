import { apiRequest } from "./api";

export type ContentHistoryItem = {
  id: string;
  version: number;
  status: "pending" | "approved" | "rejected" | "conflicted" | "withdrawn" | "staging" | "ready" | "partial" | "superseded";
  origin: "manual" | "import";
  source: string;
  sourceNamespace?: string;
  reason?: string;
  submittedById?: string;
  submittedByName: string;
  createdAt: string;
  current: boolean;
};

export type ContentHistoryPage = {
  items: ContentHistoryItem[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export function contentHistoryPagePath(endpoint: string, cursor = "", limit = 50) {
  const separator = endpoint.includes("?") ? "&" : "?";
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (cursor) parameters.set("cursor", cursor);
  return `${endpoint}${separator}${parameters}`;
}

export function loadContentHistory(endpoint: string, token = "", cursor = "", signal?: AbortSignal) {
  return apiRequest<ContentHistoryPage>(contentHistoryPagePath(endpoint, cursor), { cache: "no-store", signal }, token || undefined);
}
