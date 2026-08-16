import { API_BASE_URL, apiRequest } from "./api";

export type CommunityPostKind = "tutorial" | "issue" | "news" | "discussion";
export type CommunityPostSeverity = "client" | "harmless" | "minor" | "harmful" | "severe" | "fatal";
export const communityProjectTypes = ["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack", "addon"] as const;
export type CommunityProjectType = (typeof communityProjectTypes)[number];

export type CommunityPostReference = {
  publicId?: string;
  type?: string;
  kind?: string;
  identifier: string;
  name?: string;
  siteId?: string;
  names?: Record<string, string>;
  iconUrl?: string;
  versionId?: string;
  revisionId?: string;
  iconPath?: string;
  unresolved?: boolean;
};

export type CommunityPost = {
  id: string;
  kind: CommunityPostKind;
  category: string;
  title: string;
  sourceLocale: string;
  bodyMarkdown: string;
  minecraftVersions: string[];
  modVersionMin?: string;
  modVersionMax?: string;
  severity?: CommunityPostSeverity;
  hasFix?: boolean;
  issueUrl?: string;
  coverUrl?: string;
  coverFileId?: string;
  resolutionStatus?: "open" | "answered" | "self_solved";
  acceptedCommentId?: string;
  resolvedAt?: string;
  bounty?: {
    currency: string;
    currencyName: string;
    currencyIcon: string;
    translations: Record<string, unknown>;
    amount: number;
    status: "held" | "awarded" | "refunded";
    taxAmount?: number;
    netAmount?: number;
  };
  authorId: string;
  authorName: string;
  reviewStatus: "pending" | "approved" | "rejected";
  projects: CommunityPostReference[];
  resources: CommunityPostReference[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canResolve: boolean;
};

type CommunityPostResponse = Omit<CommunityPost, "minecraftVersions" | "projects" | "resources"> & {
  minecraftVersions: string[] | null;
  projects: CommunityPostReference[] | null;
  resources: CommunityPostReference[] | null;
};

function normalizeCommunityPost(post: CommunityPostResponse): CommunityPost {
  return {
    ...post,
    minecraftVersions: post.minecraftVersions ?? [],
    projects: post.projects ?? [],
    resources: post.resources ?? [],
  };
}

export type CommunityPostDraft = Pick<CommunityPost, "kind" | "category" | "title" | "bodyMarkdown" | "minecraftVersions" | "modVersionMin" | "modVersionMax" | "severity" | "hasFix" | "issueUrl" | "projects" | "resources"> & {
  sourceLocale?: string;
  coverFileId?: string;
  bountyCurrency?: string;
  bountyAmount?: number;
};

export function communityPostCollection(kind: CommunityPostKind) {
  switch (kind) {
    case "tutorial": return "tutorials";
    case "issue": return "issues";
    case "news": return "news";
    case "discussion": return "discussions";
  }
}

export async function loadCommunityPosts(kind: CommunityPostKind, options: { query?: string; category?: string; versions?: string[]; versionMode?: "any" | "all"; projects?: string[]; sort?: "latest" | "updated" | "oldest"; modId?: string; resourceId?: string; limit?: number; offset?: number } = {}, token = "", signal?: AbortSignal) {
  const parameters = new URLSearchParams({ kind, limit: String(options.limit ?? 24), offset: String(options.offset ?? 0) });
  if (options.query) parameters.set("q", options.query);
  if (options.category) parameters.set("category", options.category);
  if (options.versions?.length) parameters.set("version", options.versions.join(","));
  if (options.versionMode === "all") parameters.set("versionMode", "all");
  if (options.projects?.length) parameters.set("project", options.projects.join(","));
  if (options.sort) parameters.set("sort", options.sort);
  if (options.modId) parameters.set("modId", options.modId);
  if (options.resourceId) parameters.set("resourceId", options.resourceId);
  const result = await apiRequest<{ items: CommunityPostResponse[] | null; total: number; limit: number; offset: number; categories?: string[] }>(`/api/v1/community/posts?${parameters}`, { cache: "no-store", signal }, token || undefined);
  return { ...result, items: (result.items ?? []).map(normalizeCommunityPost) };
}

export function loadCommunityPostCategories(kind: CommunityPostKind, signal?: AbortSignal) {
  return apiRequest<{ kind: CommunityPostKind; items: string[] }>(`/api/v1/community/post-categories?kind=${encodeURIComponent(kind)}`, { cache: "no-store", signal });
}

export async function loadCommunityPost(id: string, token = "") {
  const post = await apiRequest<CommunityPostResponse>(`/api/v1/community/posts/${encodeURIComponent(id)}`, { cache: "no-store" }, token || undefined);
  return normalizeCommunityPost(post);
}

export function saveCommunityPost(draft: CommunityPostDraft, token: string, id = "") {
  return apiRequest<{ id: string; reviewStatus: CommunityPost["reviewStatus"]; revisionId: string; changeRequestId: string }>(id ? `/api/v1/community/posts/${encodeURIComponent(id)}` : "/api/v1/community/posts", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(draft),
  }, token);
}

export function requestCommunityPostTranslation(id: string, targetLocale: string, token: string) {
  return apiRequest<{ cached?: boolean; taskId?: string; status?: string; translation?: { title: string; bodyMarkdown: string } }>(`/api/v1/community/posts/${encodeURIComponent(id)}/translations`, {
    method: "POST",
    body: JSON.stringify({ targetLocale }),
  }, token);
}

export function loadCommunityPostTranslation(taskId: string, token: string, signal?: AbortSignal) {
  return apiRequest<{ status: string; error?: string; translation?: { title: string; bodyMarkdown: string } }>(`/api/v1/community/translations/${encodeURIComponent(taskId)}`, { cache: "no-store", signal }, token);
}

export function acceptCommunityPostAnswer(id: string, commentId: string, token: string) {
  return apiRequest<{ resolutionStatus: "answered"; acceptedCommentId: string; taxAmount: number; netAmount: number }>(
    `/api/v1/community/posts/${encodeURIComponent(id)}/answers/${encodeURIComponent(commentId)}`,
    { method: "POST" },
    token,
  );
}

export function selfSolveCommunityPost(id: string, token: string) {
  return apiRequest<{ resolutionStatus: "self_solved" }>(
    `/api/v1/community/posts/${encodeURIComponent(id)}/self-solved`,
    { method: "POST" },
    token,
  );
}

export function communityPostCoverURL(value?: string) {
  if (!value) return "";
  if (value.startsWith("/")) return API_BASE_URL + value;
  return value;
}
