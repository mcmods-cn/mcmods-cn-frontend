import { API_BASE_URL, apiRequest } from "./api";
import {
  apiStringRecord as stringRecord,
  apiText as text,
  normalizeCatalogResourceVersions as normalizeResourceVersions,
} from "./api-normalizers";
import { localizedCatalogResourceName } from "./content-language";
import type { CatalogResourceVersion } from "./editor-types";
import { minecraftLocale, modExportAssetURL } from "./mod-export-api";

export type GlobalResource = {
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
  publicId: string;
  registry: string;
  canonicalId: string;
  name?: string;
  memberCount: number;
  previews: GlobalResource[];
};

export type RecipeCatalyst = {
  publicId?: string;
  id: string;
  kind: string;
  registry: string;
  names?: Record<string, string>;
  revisionId: string;
  iconPath: string;
  iconUrl?: string;
};

export type GlobalRecipeType = {
  publicId: string;
  canonicalId: string;
  names: Record<string, string>;
  recipeCount: number;
  templateCount?: number;
  catalysts: RecipeCatalyst[];
};

export type GlobalRecipe = {
  publicId: string;
  recipeTypePublicId: string;
  recipeId: string;
  recipeIdSource: "minecraft_recipe" | "jei_category" | "generated_index";
  recipeIdCanonical: boolean;
  semanticFingerprint: string;
  revisionId: string;
  modSiteId: string;
  note: string;
  layout: Record<string, unknown>;
};

export type GlobalRecipeTypeCatalog = GlobalRecipeType & {
  contentMarkdown: string;
  contentLocale: string;
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
    items: Array<{ publicId: string; registry: string; canonicalId: string; memberCount: number; name?: string; previews?: Array<Record<string, unknown>> }>;
    total?: number;
    limit: number;
    offset: number;
  }>(`/api/v1/tags?${query}`, {}, token).then((page): PageResult<GlobalTag> => ({
    ...page,
    total: page.total ?? page.offset + page.items.length,
    items: page.items.map((tag) => ({
      publicId: tag.publicId,
      registry: tag.registry,
      canonicalId: tag.canonicalId,
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
    publicId: text(value.publicId),
    id: text(value.id),
    registry: text(value.registry),
    names: stringRecord(value.names),
    revisionId: text(value.revisionId),
    modSiteId: text(value.modSiteId),
    iconPath: text(value.iconPath),
    iconUrl: text(value.iconUrl) || undefined,
    versions: normalizeResourceVersions(value.versions),
    detailUrl: text(value.detailUrl) || undefined,
  };
}

export function loadGlobalRecipeTypes(query: URLSearchParams, token = "") {
  return apiRequest<PageResult<GlobalRecipeType>>(`/api/v1/recipe-types?${query}`, {}, token);
}

export function loadGlobalRecipeTypeCatalog(publicId: string, query: URLSearchParams, token = "") {
  return apiRequest<GlobalRecipeTypeCatalog>(`/api/v1/recipe-types/${encodeURIComponent(publicId)}/catalog?${query}`, {}, token);
}

export function loadGlobalRecipe(publicId: string, locale: string, token = "", signal?: AbortSignal) {
  const query = new URLSearchParams(catalogQueryLocales(locale));
  return apiRequest<GlobalRecipe>(
    `/api/v1/catalog/recipes/${encodeURIComponent(publicId)}/render?${query}`,
    { cache: "no-store", signal },
    token || undefined,
  );
}
