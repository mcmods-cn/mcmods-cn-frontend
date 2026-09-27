import { apiRequest } from "./api";

export type UserDraftSummary = {
  id: string;
  draftKey: string;
  projectKey: string;
  projectTitle: string;
  kind: string;
  title: string;
  editUrl: string;
  targetUrl: string;
  status: "draft" | "reviewing" | "approved" | "rejected";
  statusAt: string;
  submittedAt?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UserDraftDetail<T extends object> = UserDraftSummary & {
  payload: T;
};

export type UserDraftList = {
  items: UserDraftSummary[];
  category: UserDraftCategory;
  nextCursor: string;
  retentionSeconds: number;
};

export type UserDraftCategory = "active" | "completed";

export function loadUserDrafts(token: string, category: UserDraftCategory, cursor = "") {
  const query = new URLSearchParams({ category, limit: "30" });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<UserDraftList>(`/api/v1/users/me/drafts?${query}`, { cache: "no-store" }, token);
}

export function loadUserDraft<T extends object>(id: string, token: string) {
  return apiRequest<UserDraftDetail<T>>(`/api/v1/users/me/drafts/${encodeURIComponent(id)}`, { cache: "no-store" }, token);
}

export function saveUserDraft<T extends object>(request: {
  draftKey: string;
  projectKey: string;
  kind: string;
  title: string;
  editUrl: string;
  payload: T;
}, token: string, keepalive = false) {
  return apiRequest<UserDraftSummary>("/api/v1/users/me/drafts", {
    method: "POST",
    body: JSON.stringify(request),
    keepalive,
  }, token);
}

export function completeUserDraft<T extends object>(request: {
  draftKey: string;
  projectKey: string;
  projectTitle: string;
  kind: string;
  title: string;
  editUrl: string;
  targetUrl: string;
  changeRequestId?: string;
  reviewTargetType?: "server";
  reviewTargetPublicId?: string;
  payload: T;
}, token: string) {
  return apiRequest<{ completed: boolean }>("/api/v1/users/me/drafts/complete", {
    method: "POST",
    body: JSON.stringify(request),
  }, token);
}

export function deleteUserDraft(id: string, token: string) {
  return apiRequest<{ deleted: boolean }>(`/api/v1/users/me/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

export function draftResumeURL(draft: UserDraftSummary) {
  const separator = draft.editUrl.includes("?") ? "&" : "?";
  return `${draft.editUrl}${separator}draft=${encodeURIComponent(draft.id)}`;
}
