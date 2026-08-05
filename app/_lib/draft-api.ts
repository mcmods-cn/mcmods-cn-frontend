import { apiRequest } from "./api";

export type UserDraftSummary = {
  id: string;
  draftKey: string;
  kind: string;
  title: string;
  editUrl: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UserDraftDetail<T extends object> = UserDraftSummary & {
  payload: T;
};

export type UserDraftList = {
  items: UserDraftSummary[];
  retentionSeconds: number;
};

export function loadUserDrafts(token: string) {
  return apiRequest<UserDraftList>("/api/v1/users/me/drafts", { cache: "no-store" }, token);
}

export function loadUserDraft<T extends object>(id: string, token: string) {
  return apiRequest<UserDraftDetail<T>>(`/api/v1/users/me/drafts/${encodeURIComponent(id)}`, { cache: "no-store" }, token);
}

export function saveUserDraft<T extends object>(request: {
  draftKey: string;
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

export function deleteUserDraft(id: string, token: string) {
  return apiRequest<{ deleted: boolean }>(`/api/v1/users/me/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

export function deleteUserDraftByKey(draftKey: string, token: string) {
  const query = new URLSearchParams({ draftKey });
  return apiRequest<{ deleted: boolean }>(`/api/v1/users/me/drafts?${query}`, { method: "DELETE" }, token);
}

export function draftResumeURL(draft: UserDraftSummary) {
  const separator = draft.editUrl.includes("?") ? "&" : "?";
  return `${draft.editUrl}${separator}draft=${encodeURIComponent(draft.id)}`;
}
