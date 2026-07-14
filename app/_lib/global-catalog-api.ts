import { apiRequest } from "./api";
import { minecraftLocale, modExportAssetURL } from "./mod-export-api";

export type GlobalResource = {
  entityId: string;
  publicId: string;
  id: string;
  registry: string;
  names: Record<string, string>;
  revisionId: string;
  modSiteId: string;
  iconPath: string;
};

export type GlobalTag = {
  entityId: string;
  publicId: string;
  registry: string;
  tagId: string;
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
  publishedRevisionId?: number;
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
  names: Record<string, string>;
  recipeCount: number;
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
  const secondary = primary.startsWith("zh_") ? "en_us" : "zh_cn";
  return { primary, secondary };
}

export function localizedCatalogName(names: Record<string, string> | undefined, locale: string, fallback: string) {
  const { primary, secondary } = contentLocales(locale);
  return names?.[primary] || names?.[secondary] || names?.en_us || names?.zh_cn || fallback;
}

export function catalogAssetURL(revisionId: string, assetPath: string) {
  return revisionId && assetPath ? modExportAssetURL(revisionId, assetPath) : "";
}

export function catalogQueryLocales(locale: string) {
  const { primary, secondary } = contentLocales(locale);
  return { locale: primary, secondaryLocale: secondary };
}

export function loadGlobalTags(query: URLSearchParams, token = "") {
  return apiRequest<PageResult<GlobalTag>>(`/api/v1/mod-tags?${query}`, {}, token);
}

export function loadGlobalTagDetail(query: URLSearchParams, token = "") {
  return apiRequest<GlobalTagDetail>(`/api/v1/mod-tags/detail?${query}`, {}, token);
}

export function loadGlobalRecipeTypes(query: URLSearchParams, token = "") {
  return apiRequest<PageResult<GlobalRecipeType>>(`/api/v1/recipe-types?${query}`, {}, token);
}

export function loadGlobalRecipeTypeDetail(query: URLSearchParams, token = "") {
  return apiRequest<GlobalRecipeTypeDetail>(`/api/v1/recipe-types/detail?${query}`, {}, token);
}
