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

export type ChangelogCollection = { target: ChangelogTarget; categories: ChangelogCategory[]; items: ChangelogItem[] };

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

export function loadProjectChangelogs(targetType: ChangelogTargetType, targetId: string, locale: string, token = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ targetType, targetId, locale });
  return apiRequest<ChangelogCollection>(`/api/v1/changelogs?${query}`, { cache: "no-store", signal }, token || undefined);
}

export function loadProjectChangelog(id: string, token = "") {
  return apiRequest<{ target: ChangelogTarget; item: ChangelogItem }>(`/api/v1/changelogs/${encodeURIComponent(id)}`, { cache: "no-store" }, token || undefined);
}

export function saveProjectChangelog(draft: ChangelogDraft, token: string, target?: { type: ChangelogTargetType; id: string }, id = "") {
  if (id) return apiRequest<{ id: string; reviewStatus: "pending" | "approved"; changeRequestId: string }>(`/api/v1/changelogs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(draft) }, token);
  if (!target) throw new Error("changelog target is required");
  const query = new URLSearchParams({ targetType: target.type, targetId: target.id });
  return apiRequest<{ id: string; reviewStatus: "pending" | "approved"; changeRequestId: string }>(`/api/v1/changelogs?${query}`, { method: "POST", body: JSON.stringify(draft) }, token);
}
