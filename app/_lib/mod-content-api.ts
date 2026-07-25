import { apiRequest } from "./api";
import type { CatalogResourceVersion } from "./editor-types";

export type ModContentLocalization = { locale: string; name: string; summary: string; contentMarkdown: string };

export type ModContentVersion = {
  publicId: string;
  label: string;
  minecraftVersions: string[];
  loaders: string[];
  modVersion: string;
  status: "active" | "pending" | "superseded" | "archived";
  publishedRevisionId?: number;
  createdAt: string;
  updatedAt: string;
};

export type ModContentTemplate = {
  publicId: string;
  code: string;
  builtin: boolean;
  i18nKey: string;
  defaultLocale: string;
  defaultDisplayMode: "compact" | "large";
  definition: Record<string, unknown>;
  status: string;
  publishedRevisionId?: number;
  localizations: ModContentLocalization[];
};

export type ModContentSectionResource = {
  versionPublicId: string;
  resourcePublicId: string;
  sectionPublicId: string;
  kindCode: string;
  canonicalId?: string;
  ordinal: number;
  revisionId?: string;
  iconPath?: string;
  iconFileId?: number;
  names?: Record<string, string>;
  definition: Record<string, unknown>;
};

export type ModContentSection = {
  publicId: string;
  versionPublicId: string;
  templatePublicId: string;
  templateCode: string;
  templateBuiltin: boolean;
  templateI18nKey: string;
  parentPublicId: string;
  defaultLocale: string;
  displayMode: "compact" | "large";
  ordinal: number;
  status: string;
  publishedRevisionId?: number;
  localizations: ModContentLocalization[];
  resourceCount: number;
};

export type ModContentMutationResult = { publicId: string; revisionId: number; changeRequestId: number; reviewStatus: "pending" | "approved"; activityEventId: number };
export type ModContentResourceVersionDetail = {
  versionPublicId: string;
  defaultLocale: string;
  definition: Record<string, unknown>;
  status: string;
  publishedRevisionId?: number;
  localizations: Array<ModContentLocalization & { provenance?: string }>;
};
export type ModContentResource = { entityId: string; publicId: string; kindCode: string; canonicalId: string; details: ModContentResourceVersionDetail[]; versions: CatalogResourceVersion[] };
export type ModContentResourceSummary = { publicId: string; kindCode: string; canonicalId: string; details: ModContentResourceVersionDetail[] };
export type ModContentSectionResourcePage = { section: ModContentSection; versionLabel: string; categories: ModContentSection[]; items: ModContentSectionResource[]; total: number; limit: number; offset: number };
export type ModContentLayoutPayload = {
  versionPublicId: string;
  rootSectionPublicId: string;
  categories: Array<Pick<ModContentSection, "publicId" | "parentPublicId" | "defaultLocale" | "ordinal" | "localizations">>;
  resources: Array<Pick<ModContentSectionResource, "resourcePublicId" | "sectionPublicId" | "ordinal">>;
  reason: string;
  baseRevisionId?: number;
};

const modPath = (siteId: string) => `/api/v1/mods/${encodeURIComponent(siteId)}`;

export function loadModContentVersions(siteId: string, token = "") { return apiRequest<{ items: ModContentVersion[] }>(`${modPath(siteId)}/content-versions`, {}, token).then((value) => value.items); }
export function createModContentVersion(siteId: string, payload: Omit<ModContentVersion, "publicId" | "status" | "publishedRevisionId" | "createdAt" | "updatedAt"> & { reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-versions`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentVersion(siteId: string, versionId: string, payload: { label: string; minecraftVersions: string[]; loaders: string[]; modVersion: string; reason: string; baseRevisionId?: number }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-versions/${encodeURIComponent(versionId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function archiveModContentVersion(siteId: string, versionId: string, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-versions/${encodeURIComponent(versionId)}`, { method: "DELETE" }, token); }

export function loadModContentTemplates(siteId: string, token = "") { return apiRequest<{ items: ModContentTemplate[] }>(`${modPath(siteId)}/content-templates`, {}, token).then((value) => value.items); }
export function createModContentTemplate(siteId: string, payload: { code: string; defaultLocale: string; defaultDisplayMode: "compact" | "large"; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-templates`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentTemplate(siteId: string, templateId: string, payload: { code: string; defaultLocale: string; defaultDisplayMode: "compact" | "large"; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string; baseRevisionId?: number }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-templates/${encodeURIComponent(templateId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function archiveModContentTemplate(siteId: string, templateId: string, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-templates/${encodeURIComponent(templateId)}`, { method: "DELETE" }, token); }

export function loadModContentSections(siteId: string, token = "") { return apiRequest<{ items: ModContentSection[] }>(`${modPath(siteId)}/content-sections`, {}, token).then((value) => value.items); }
export function loadModContentSectionResources(siteId: string, sectionId: string, options: { locale?: string; query?: string; limit?: number; offset?: number } = {}, token = "") {
  const parameters = new URLSearchParams();
  if (options.locale) parameters.set("locale", options.locale);
  if (options.query?.trim()) parameters.set("q", options.query.trim());
  parameters.set("limit", String(options.limit ?? 120));
  parameters.set("offset", String(options.offset ?? 0));
  return apiRequest<ModContentSectionResourcePage>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}/resources?${parameters}`, {}, token);
}
type ModContentSectionPayload = Omit<ModContentSection, "publicId" | "templateCode" | "templateBuiltin" | "templateI18nKey" | "status" | "publishedRevisionId" | "resourceCount"> & {
  resources: Array<Pick<ModContentSectionResource, "versionPublicId" | "resourcePublicId" | "ordinal">>;
};
export function createModContentSection(siteId: string, payload: ModContentSectionPayload & { reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentSection(siteId: string, sectionId: string, payload: ModContentSectionPayload & { reason: string; baseRevisionId?: number }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function archiveModContentSection(siteId: string, sectionId: string, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}`, { method: "DELETE" }, token); }
export function updateModContentLayout(siteId: string, sectionId: string, payload: ModContentLayoutPayload, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}/layout`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function loadModContentResource(siteId: string, resourceId: string, token = "") { return apiRequest<ModContentResource>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}`, {}, token); }
export function loadModContentResources(siteId: string, token = "") { return apiRequest<{ items: ModContentResourceSummary[] }>(`${modPath(siteId)}/content-resources`, {}, token).then((value) => value.items); }
export function createModContentResource(siteId: string, payload: { resourcePublicId?: string; kindCode: string; canonicalId: string; versionPublicId: string; sectionPublicId?: string; defaultLocale: string; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentResource(siteId: string, resourceId: string, payload: { resourcePublicId: string; kindCode: string; canonicalId: string; versionPublicId: string; sectionPublicId?: string; defaultLocale: string; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string; baseRevisionId?: number }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function archiveModContentResource(siteId: string, resourceId: string, versionId: string, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(versionId)}`, { method: "DELETE" }, token); }
