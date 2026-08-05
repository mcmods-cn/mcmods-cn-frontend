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

export function loadContentHistory(endpoint: string, token = "", signal?: AbortSignal) {
  return apiRequest<{ items: ContentHistoryItem[] }>(endpoint, { cache: "no-store", signal }, token || undefined);
}
