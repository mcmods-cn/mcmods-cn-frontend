import { apiRequest } from "./api";

export type ProjectFollowStatus = {
  followed: boolean;
  notificationsEnabled: boolean;
  target?: { id: string; type: string; name: string; url: string; updatedAt: string };
};

export type FollowedProject = {
  id: string;
  type: string;
  url: string;
  name: string;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export function loadProjectFollowStatus(token: string, publicId: string) {
  return apiRequest<ProjectFollowStatus>(`/api/v1/projects/${encodeURIComponent(publicId)}/follow`, {}, token);
}

export function followProject(token: string, publicId: string) {
  return apiRequest<ProjectFollowStatus>(`/api/v1/projects/${encodeURIComponent(publicId)}/follow`, { method: "PUT" }, token);
}

export function unfollowProject(token: string, publicId: string) {
  return apiRequest<void>(`/api/v1/projects/${encodeURIComponent(publicId)}/follow`, { method: "DELETE" }, token);
}

export function loadFollowedProjects(token: string, query = "", type = "", offset = 0) {
  const params = new URLSearchParams({ limit: "100", offset: String(offset) });
  if (query.trim()) params.set("q", query.trim());
  if (type) params.set("type", type);
  return apiRequest<{ items: FollowedProject[]; limit: number; offset: number }>(`/api/v1/users/me/project-follows?${params}`, {}, token);
}
