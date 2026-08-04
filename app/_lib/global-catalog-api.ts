import { API_BASE_URL, apiRequest } from "./api";
import { localizedCatalogResourceName } from "./content-language";
import { minecraftLocale, modExportAssetURL } from "./mod-export-api";
import type { CatalogResourceVersion } from "./editor-types";

export type GlobalResource = {
  entityId: string;
  publicId: string;
  id: string;
  registry: string;
  names: Record<string, string>;
  revisionId: string;
  modSiteId: string;
  iconPath: string;
  iconUrl?: string;
  versions: CatalogResourceVersion[];
  detailUrl?: string;
};

export type GlobalTag = {
  entityId: string;
  publicId: string;
  registry: string;
  tagId: string;
  name?: string;
  memberCount: number;
  previews: GlobalResource[];
};

export type GlobalTagDetail = {
  entityId: string;
  publicId: string;
  registry: string;
  tagId: string;
  contentMarkdown: string;
  contentLocale: string;
  publishedRevisionId?: string;
  memberCount: number;
  members: GlobalResource[];
  limit: number;
  offset: number;
};

export type RecipeCatalyst = {
  entityId?: string;
  publicId?: string;
  item?: string;
  resource_location?: string;
  count?: number;
  names?: Record<string, string>;
  revisionId: string;
  iconPath: string;
};

export type GlobalRecipeType = {
  entityId: string;
  publicId: string;
  recipeTypeId: string;
  name?: string;
  contentLocale?: string;
  names: Record<string, string>;
  recipeCount: number;
  templateCount?: number;
  catalysts: RecipeCatalyst[];
  revisionId: string;
};

export type GlobalRecipe = {
  entityId: string;
  publicId: string;
  recipeKey: string;
  recipeId: string;
  recipeIdSource: "minecraft_recipe" | "jei_category" | "generated_index";
  recipeIdCanonical: boolean;
  semanticFingerprint: string;
  revisionId: string;
  modSiteId: string;
  note: string;
  layout: Record<string, unknown>;
};

export type GlobalRecipeTypeDetail = GlobalRecipeType & {
  contentMarkdown: string;
  contentLocale: string;
  backgroundPath: string;
  width: number;
  height: number;
  imageScale: number;
  backgroundContainsIngredients: boolean;
  recipes: GlobalRecipe[];
  total: number;
  limit: number;
  offset: number;
};

export type PageResult<T> = { items: T[]; total: number; limit: number; offset: number };

export function contentLocales(locale: string) {
  const primary = minecraftLocale(locale);
  const secondary = primary === "zh_cn" ? "zh_tw" : primary === "zh_tw" ? "zh_cn" : "en_us";
  return { primary, secondary };
}

export function localizedCatalogName(names: Record<string, string> | undefined, locale: string, fallback: string) {
  return localizedCatalogResourceName({ id: fallback, names: names ?? {} }, locale, "", "en-US") || fallback;
}

export function catalogAssetURL(revisionId: string, assetPath: string) {
  return revisionId && assetPath ? modExportAssetURL(revisionId, assetPath) : "";
}

export function catalogQueryLocales(locale: string) {
  const { primary, secondary } = contentLocales(locale);
  return { locale: primary, secondaryLocale: secondary };
}

export function loadGlobalTags(query: URLSearchParams, token = "") {
  return apiRequest<{
    items: Array<{ entityId?: string; publicId: string; registry: string; canonicalId: string; memberCount: number; name?: string; previews?: Array<Record<string, unknown>> }>;
    total?: number;
    limit: number;
    offset: number;
  }>(`/api/v1/tags?${query}`, {}, token).then((page): PageResult<GlobalTag> => ({
    ...page,
    total: page.total ?? page.offset + page.items.length,
    items: page.items.map((tag) => ({
      entityId: tag.entityId || "",
      publicId: tag.publicId,
      registry: tag.registry,
      tagId: tag.canonicalId,
      name: tag.name,
      memberCount: tag.memberCount,
      previews: (tag.previews ?? []).map(normalizeGlobalResource).filter((item) => item.publicId && item.id),
    })),
  }));
}

export function catalogDirectAssetURL(value = "") {
  if (!value) return "";
  return value.startsWith("/") ? `${API_BASE_URL}${value}` : value;
}

function normalizeGlobalResource(value: Record<string, unknown>): GlobalResource {
  return {
    entityId: text(value.entityId),
    publicId: text(value.publicId),
    id: text(value.id ?? value.canonicalId),
    registry: text(value.registry ?? value.kindCode),
    names: stringRecord(value.names),
    revisionId: text(value.revisionId),
    modSiteId: text(value.modSiteId),
    iconPath: text(value.iconPath),
    iconUrl: text(value.iconUrl) || undefined,
    versions: normalizeResourceVersions(value.versions),
    detailUrl: text(value.detailUrl) || undefined,
  };
}

function normalizeResourceVersions(value: unknown): CatalogResourceVersion[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = record(entry);
    return {
      publicId: text(source.publicId),
      label: text(source.label),
      minecraftVersions: stringArray(source.minecraftVersions),
      loaders: stringArray(source.loaders),
      modVersion: text(source.modVersion),
      sourceKind: source.sourceKind === "manual" ? "manual" as const : "import" as const,
      hasDetail: source.hasDetail === true,
      revisionId: text(source.revisionId),
      registry: text(source.registry),
      iconPath: text(source.iconPath),
      modSiteId: text(source.modSiteId),
      names: stringRecord(source.names),
      name: text(source.name) || undefined,
      iconUrl: text(source.iconUrl) || undefined,
      detailUrl: text(source.detailUrl) || undefined,
    };
  }).filter((entry) => entry.publicId);
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function loadGlobalTagDetail(query: URLSearchParams, token = "") {
  return apiRequest<{
    entityId?: string;
    publicId?: string;
    registry?: string;
    tagId?: string;
    contentMarkdown?: string;
    contentLocale?: string;
    publishedRevisionId?: string;
    memberCount?: number;
    members?: Array<Record<string, unknown>>;
    limit?: number;
    offset?: number;
  }>(`/api/v1/mod-tags/detail?${query}`, {}, token).then((detail): GlobalTagDetail => ({
    entityId: detail.entityId || "",
    publicId: detail.publicId || "",
    registry: detail.registry || "",
    tagId: detail.tagId || "",
    contentMarkdown: detail.contentMarkdown || "",
    contentLocale: detail.contentLocale || "",
    publishedRevisionId: detail.publishedRevisionId,
    memberCount: detail.memberCount ?? 0,
    members: (detail.members ?? []).map(normalizeGlobalResource).filter((member) => member.id),
    limit: detail.limit ?? 0,
    offset: detail.offset ?? 0,
  }));
}

export function loadGlobalRecipeTypes(query: URLSearchParams, token = "") {
  return apiRequest<PageResult<GlobalRecipeType>>(`/api/v1/recipe-types?${query}`, {}, token);
}

export function loadGlobalRecipeTypeDetail(query: URLSearchParams, token = "") {
  return apiRequest<GlobalRecipeTypeDetail>(`/api/v1/recipe-types/detail?${query}`, {}, token);
}

export function loadGlobalRecipe(publicId: string, locale: string, token = "", signal?: AbortSignal) {
  const query = new URLSearchParams(catalogQueryLocales(locale));
  return apiRequest<GlobalRecipe>(
    `/api/v1/catalog/recipes/${encodeURIComponent(publicId)}/render?${query}`,
    { cache: "no-store", signal },
    token || undefined,
  );
}
