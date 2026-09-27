import { apiRequest, API_BASE_URL } from "./api";
import type { CatalogResourceVersion } from "./editor-types";
import { parseModContentCapabilities, type ModContentCapabilities } from "./mod-content-capabilities.mts";

export type ModContentLocalization = { locale: string; name: string; summary: string; contentMarkdown: string };
type ModContentLocalizedNames = Record<string, string>;
export type ModContentEntryFieldType = "number" | "range" | "text" | "boolean" | "list" | "reference" | "reference-list" | "json";
export type ModContentEntryFieldFormat = "integer" | "float" | "health" | "armor" | "range" | "text" | "boolean" | "text-list" | "resource" | "entity" | "tag" | "enchantment" | "item" | "json";
export type ModContentEntryField = {
  code: string;
  type: ModContentEntryFieldType;
  format?: ModContentEntryFieldFormat;
  names: ModContentLocalizedNames;
  paths: string[][];
  referenceKind?: string;
  referenceRegistry?: string;
  editable?: boolean;
};
type ModContentEntryGroup = {
  code: string;
  names: ModContentLocalizedNames;
  descriptions?: ModContentLocalizedNames;
  fields: ModContentEntryField[];
};
export type ModContentEntryType = {
  code: string;
  kindCodes?: string[];
  names: ModContentLocalizedNames;
  groups: ModContentEntryGroup[];
  enabled?: boolean;
};
export type ModContentTemplateDefinition = Record<string, unknown> & {
  resourceKinds?: string[];
  entryTypes?: ModContentEntryType[];
};

export type ModContentVersion = {
  publicId: string;
  label: string;
  minecraftVersions: string[];
  loaders: string[];
  modVersion: string;
  status: "active" | "pending" | "superseded" | "archived";
  publishedRevisionId?: string;
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
  definition: ModContentTemplateDefinition;
  status: string;
  publishedRevisionId?: string;
  localizations: ModContentLocalization[];
};

export type ModContentSectionResource = {
  versionPublicId: string;
  resourcePublicId: string;
  sectionPublicId: string;
  kindCode: string;
  canonicalId?: string;
  ordinal: number;
  similarGroupId?: string;
  revisionId?: string;
  iconPath?: string;
  iconFileId?: string;
  names?: Record<string, string>;
  hasDetailDescription: boolean;
  definition: Record<string, unknown>;
};

export type ModContentLayoutSummary = {
  versionPublicId: string;
  resourcePublicId: string;
  sectionPublicId: string;
  label: string;
  ordinal: number;
  similarGroupId?: string;
  advancement?: {
    parentResourcePublicId: string;
    groupId: string;
    x: number;
    y: number;
    frame?: string;
  };
};

export type ModContentSection = {
  publicId: string;
  versionPublicId: string;
  templatePublicId: string;
  templateCode: string;
  templateBuiltin: boolean;
  templateI18nKey: string;
  parentPublicId: string;
  systemKey?: string;
  defaultLocale: string;
  displayMode: "compact" | "large";
  ordinal: number;
  status: string;
  publishedRevisionId?: string;
  localizations: ModContentLocalization[];
  resourceCount: number;
  definition?: ModContentTemplateDefinition;
};

export type ModContentMutationResult = { publicId: string; revisionId: string; changeRequestId: string; reviewStatus: "pending" | "approved"; activityEventId: string };
type ModContentResourceVersionDetail = {
  versionPublicId: string;
  sectionPublicId?: string;
  entryTypeCode: string;
  definitionSchemaVersion: number;
  defaultLocale: string;
  definition: Record<string, unknown>;
  schemaDefinition?: ModContentTemplateDefinition;
  iconSmallFilePublicId?: string;
  iconFilePublicId?: string;
  renderFilePublicId?: string;
  status: string;
  publishedRevisionId?: string;
  localizations: Array<ModContentLocalization & { provenance?: string }>;
};
export type ModContentResource = { entityId: string; publicId: string; kindCode: string; canonicalId: string; details: ModContentResourceVersionDetail[]; versions: CatalogResourceVersion[]; capabilities: ModContentCapabilities };
export type ModContentSimilarResource = Pick<ModContentSectionResource,
  "versionPublicId" | "resourcePublicId" | "kindCode" | "canonicalId" | "revisionId" | "iconPath" | "iconFileId" | "names"
>;
export type ModContentSectionResourcePage = {
  section: ModContentSection;
  versionLabel: string;
  categories: ModContentSection[];
  items: ModContentSectionResource[];
  total: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
  capabilities: ModContentCapabilities;
};
export type ModContentLayoutSummaryPage = Omit<ModContentSectionResourcePage, "items"> & {
  items: ModContentLayoutSummary[];
};
export type ModContentLayoutPatchPayload = {
  versionPublicId: string;
  rootSectionPublicId: string;
  displayMode: "compact" | "large";
  categories?: Array<Pick<ModContentSection, "publicId" | "parentPublicId" | "defaultLocale" | "ordinal" | "localizations">>;
  resources: Array<Pick<ModContentLayoutSummary, "resourcePublicId" | "sectionPublicId" | "ordinal"> & {
    similarGroupId?: string;
    advancement?: ModContentLayoutSummary["advancement"];
  }>;
  reason: string;
  baseRevisionId?: string;
};

const modPath = (siteId: string) => `/api/v1/mods/${encodeURIComponent(siteId)}`;

export function loadModContentVersions(siteId: string, token = "") { return apiRequest<{ items: ModContentVersion[] }>(`${modPath(siteId)}/content-versions`, {}, token).then((value) => value.items); }
export function createModContentVersion(siteId: string, payload: Omit<ModContentVersion, "publicId" | "status" | "publishedRevisionId" | "createdAt" | "updatedAt"> & { reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-versions`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentVersion(siteId: string, versionId: string, payload: { label: string; minecraftVersions: string[]; loaders: string[]; modVersion: string; reason: string; baseRevisionId?: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-versions/${encodeURIComponent(versionId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }

export function loadModContentTemplates(siteId: string, token = "") { return apiRequest<{ items: ModContentTemplate[] }>(`${modPath(siteId)}/content-templates`, {}, token).then((value) => value.items); }
export function createModContentTemplate(siteId: string, payload: { code: string; defaultLocale: string; defaultDisplayMode: "compact" | "large"; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-templates`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentTemplate(siteId: string, templateId: string, payload: { code: string; defaultLocale: string; defaultDisplayMode: "compact" | "large"; definition: Record<string, unknown>; localizations: ModContentLocalization[]; reason: string; baseRevisionId?: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-templates/${encodeURIComponent(templateId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }

export function loadModContentSections(siteId: string, token = "") { return apiRequest<{ items: ModContentSection[] }>(`${modPath(siteId)}/content-sections`, {}, token).then((value) => value.items); }
export function loadModContentSectionResources(siteId: string, sectionId: string, options: { locale?: string; query?: string; limit?: number; cursor?: string } = {}, token = "") {
  const parameters = new URLSearchParams();
  if (options.locale) parameters.set("locale", options.locale);
  if (options.query?.trim()) parameters.set("q", options.query.trim());
  if (options.cursor) parameters.set("cursor", options.cursor);
  parameters.set("limit", String(options.limit ?? 120));
  return apiRequest<ModContentSectionResourcePage>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}/resources?${parameters}`, {}, token)
    .then((value) => ({ ...value, capabilities: parseModContentCapabilities(value.capabilities) }));
}

export function loadModContentAdvancementGraph(siteId: string, sectionId: string, options: { locale?: string; query?: string; limit?: number; cursor?: string } = {}, token = "") {
  return loadModContentResourceStreamPage(siteId, sectionId, "resource-graph", options, token);
}

export function loadModContentLayoutSnapshot(siteId: string, sectionId: string, options: { locale?: string; limit?: number; cursor?: string } = {}, token: string) {
  return loadModContentResourceStreamPage(siteId, sectionId, "layout", options, token);
}

function loadModContentResourceStreamPage(siteId: string, sectionId: string, endpoint: "resource-graph" | "layout", options: { locale?: string; query?: string; limit?: number; cursor?: string }, token: string) {
  const parameters = new URLSearchParams();
  if (options.locale) parameters.set("locale", options.locale);
  if (options.query?.trim()) parameters.set("q", options.query.trim());
  if (options.cursor) parameters.set("cursor", options.cursor);
  parameters.set("limit", String(options.limit ?? 500));
  return apiRequest<ModContentLayoutSummaryPage>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}/${endpoint}?${parameters}`, {}, token)
    .then((value) => ({ ...value, capabilities: parseModContentCapabilities(value.capabilities) }));
}
type ModContentSectionPayload = Omit<ModContentSection, "publicId" | "templateCode" | "templateBuiltin" | "templateI18nKey" | "status" | "publishedRevisionId" | "resourceCount"> & {
  resources: Array<Pick<ModContentSectionResource, "versionPublicId" | "resourcePublicId" | "ordinal">>;
};
export function createModContentSection(siteId: string, payload: ModContentSectionPayload & { reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function archiveModContentSection(siteId: string, sectionId: string, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}`, { method: "DELETE" }, token); }
export function patchModContentLayout(siteId: string, sectionId: string, payload: ModContentLayoutPatchPayload, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-sections/${encodeURIComponent(sectionId)}/layout`, { method: "PATCH", body: JSON.stringify(payload) }, token); }
export function loadModContentResource(siteId: string, resourceId: string, token = "") {
  return apiRequest<ModContentResource>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}`, {}, token)
    .then((value) => ({ ...value, capabilities: parseModContentCapabilities(value.capabilities) }));
}
export function loadModContentSimilarResources(siteId: string, resourceId: string, versionId: string, locale: string, token = "") {
  const parameters = new URLSearchParams({ version: versionId, locale });
  return apiRequest<{ groupId: string; items: ModContentSimilarResource[] }>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}/similar?${parameters}`, {}, token);
}
export function createModContentResource(siteId: string, payload: { resourcePublicId?: string; kindCode: string; canonicalId: string; versionPublicId: string; sectionPublicId?: string; entryTypeCode: string; defaultLocale: string; definition: Record<string, unknown>; iconSmallFilePublicId?: string; iconFilePublicId?: string; renderFilePublicId?: string; localizations: ModContentLocalization[]; reason: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources`, { method: "POST", body: JSON.stringify(payload) }, token); }
export function updateModContentResource(siteId: string, resourceId: string, payload: { resourcePublicId: string; kindCode: string; canonicalId: string; versionPublicId: string; sectionPublicId?: string; entryTypeCode: string; defaultLocale: string; definition: Record<string, unknown>; iconSmallFilePublicId?: string; iconFilePublicId?: string; renderFilePublicId?: string; localizations: ModContentLocalization[]; reason: string; baseRevisionId?: string }, token: string) { return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}`, { method: "PUT", body: JSON.stringify(payload) }, token); }
export function archiveModContentResource(siteId: string, resourceId: string, versionId: string, token: string) {
  const parameters = new URLSearchParams({ version: versionId });
  return apiRequest<ModContentMutationResult>(`${modPath(siteId)}/content-resources/${encodeURIComponent(resourceId)}?${parameters}`, { method: "DELETE" }, token);
}

export function modContentResourceAssetURL(resourceId: string, versionId: string, kind: "icon" | "icon-small" | "render") {
  const parameters = new URLSearchParams();
  if (versionId) parameters.set("version", versionId);
  const query = parameters.size ? `?${parameters}` : "";
  return `${API_BASE_URL}/api/v1/catalog/resources/${encodeURIComponent(resourceId)}/${kind}${query}`;
}
