import { apiRequest } from "./api";
import { projectFollowPagePath } from "./project-follow-pagination";

export type ProjectFollowStatus = {
  followed: boolean;
  notificationsEnabled: boolean;
  target?: { id: string; type: string; name: string; url: string; updatedAt: string; unavailable?: boolean };
};

export type FollowedProject = {
  id: string;
  type: string;
  url: string;
  name: string;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  unavailable?: boolean;
};

export type FollowedProjectPage = {
  items: FollowedProject[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
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

export function setProjectFollowNotifications(token: string, publicId: string, notificationsEnabled: boolean) {
  return apiRequest<ProjectFollowStatus>(`/api/v1/projects/${encodeURIComponent(publicId)}/follow`, {
    method: "PATCH",
    body: JSON.stringify({ notificationsEnabled }),
  }, token);
}

export function loadFollowedProjects(token: string, query = "", type = "", cursor = "", signal?: AbortSignal) {
  return apiRequest<FollowedProjectPage>(projectFollowPagePath(query, type, cursor), { cache: "no-store", signal }, token);
}
