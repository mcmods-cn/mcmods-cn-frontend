import { apiRequest } from "./api";

export type ChangelogTargetType = "mod" | "modpack" | "plugin" | "map" | "resource_pack" | "shader_pack" | "datapack" | "addon" | "minecraft_server";

type ChangelogLocalization = { locale: string; bodyMarkdown: string };
export type ChangelogCategory = { id: string; defaultLocale: string; names: Record<string, string>; name: string };
export type ChangelogTarget = { type: ChangelogTargetType; id: string; name: string; url: string; canEdit: boolean };
export type ChangelogItem = {
  id: string;
  eventAt: string;
  minecraftVersions: string[];
  projectVersion: string;
  defaultLocale: string;
  category?: ChangelogCategory;
  bodyMarkdown: string;
  locale: string;
  availableLocales: string[];
  localizations?: ChangelogLocalization[];
  reviewStatus: "pending" | "approved" | "rejected";
  pendingChange: boolean;
  canEdit: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ChangelogSummary = {
  id: string;
  eventAt: string;
  minecraftVersions: string[];
  projectVersion: string;
  defaultLocale: string;
  category?: Pick<ChangelogCategory, "id" | "defaultLocale" | "name">;
  bodyExcerpt: string;
  bodyTruncated: boolean;
  locale: string;
  availableLocales: string[];
  reviewStatus: "pending" | "approved" | "rejected";
  pendingChange: boolean;
  canEdit: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ChangelogCollection = {
  target: ChangelogTarget;
  categories: ChangelogCategory[];
  categoriesHasMore?: boolean;
  categoriesNextCursor?: string;
  items: ChangelogSummary[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type ChangelogCategoryPage = {
  target: ChangelogTarget;
  categories: ChangelogCategory[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type ChangelogDraft = {
  eventAt: string;
  minecraftVersions: string[];
  projectVersion: string;
  defaultLocale: string;
  categoryId?: string;
  newCategory?: { defaultLocale: string; localizations: Array<{ locale: string; name: string }> };
  localizations: ChangelogLocalization[];
  reason?: string;
};

export function loadProjectChangelogs(targetType: ChangelogTargetType, targetId: string, locale: string, token = "", signal?: AbortSignal, cursor = "", limit = 20) {
  const query = new URLSearchParams({ targetType, targetId, locale, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<ChangelogCollection>(`/api/v1/changelogs?${query}`, { cache: "no-store", signal }, token || undefined);
}

export function loadProjectChangelogCategories(targetType: ChangelogTargetType, targetId: string, locale: string, token = "", signal?: AbortSignal, cursor = "") {
  const query = new URLSearchParams({ targetType, targetId, locale });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<ChangelogCategoryPage>(`/api/v1/changelogs/categories?${query}`, { cache: "no-store", signal }, token || undefined);
}

export function loadProjectChangelog(id: string, token = "", signal?: AbortSignal) {
  return apiRequest<{ target: ChangelogTarget; item: ChangelogItem }>(`/api/v1/changelogs/${encodeURIComponent(id)}`, { cache: "no-store", signal }, token || undefined);
}

export function saveProjectChangelog(draft: ChangelogDraft, token: string, target?: { type: ChangelogTargetType; id: string }, id = "") {
  if (id) return apiRequest<{ id: string; reviewStatus: "pending" | "approved"; changeRequestId: string }>(`/api/v1/changelogs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(draft) }, token);
  if (!target) throw new Error("changelog target is required");
  const query = new URLSearchParams({ targetType: target.type, targetId: target.id });
  return apiRequest<{ id: string; reviewStatus: "pending" | "approved"; changeRequestId: string }>(`/api/v1/changelogs?${query}`, { method: "POST", body: JSON.stringify(draft) }, token);
}
