import { apiRequest } from "./api";
import {
  apiRecord as record,
  apiStringRecord as stringRecord,
  apiText as text,
  normalizeCatalogResourceVersions as normalizeResourceVersions,
} from "./api-normalizers";
import type { CatalogResourceRef, EditResult, LocalizedContentFields, LocalizationVersion, ReviewStatus } from "./editor-types";
import { parseLocalizedContentVersions, parsePublishedReviewStatus } from "./localization-boundary.mts";

export type CatalogEditorLocalization = LocalizationVersion<LocalizedContentFields>;

export type CatalogTagEditorDocument = {
  publicId: string;
  registry: string;
  canonicalId: string;
  defaultLocale: string;
  publishedRevisionId?: string;
  reviewStatus: ReviewStatus;
  localizations: CatalogEditorLocalization[];
  members: CatalogResourceRef[];
};

export type CatalogRecipeTypeEditorDocument = {
  publicId: string;
  canonicalId: string;
  defaultLocale: string;
  publishedRevisionId?: string;
  reviewStatus: ReviewStatus;
  localizations: CatalogEditorLocalization[];
  catalysts: CatalogResourceRef[];
  definition: Record<string, unknown>;
  templateCount: number;
  recipeCount: number;
};

export type CatalogLocalizationPayload = {
  locale: string;
  name: string;
  summary: string;
  contentMarkdown: string;
};

export type CatalogTagMutation = {
  baseRevisionId?: string;
  reason: string;
  defaultLocale: string;
  localizations: CatalogLocalizationPayload[];
  registry: string;
  canonicalId: string;
  memberResourcePublicIds: string[];
};

export type CatalogRecipeTypeMutation = {
  baseRevisionId?: string;
  reason: string;
  defaultLocale: string;
  localizations: CatalogLocalizationPayload[];
  canonicalId: string;
  definition: Record<string, unknown>;
  catalystResourcePublicIds: string[];
};

type RawEditResult = Partial<EditResult> & {
  objectPublicId?: string;
  revisionId?: string;
  changeRequestId?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  activityEventId?: string;
};

const tagsPath = "/api/v1/tags";
const recipeTypesPath = "/api/v1/recipe-types";

export async function loadCatalogTagForEditing(publicId: string, token: string, locale = "") {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  const value = await apiRequest<unknown>(`${tagsPath}/${encodeURIComponent(publicId)}${query}`, {}, token);
  return normalizeTagDocument(value);
}

export async function createCatalogTag(payload: CatalogTagMutation, token: string) {
  const value = await apiRequest<RawEditResult>(tagsPath, { method: "POST", body: JSON.stringify(payload) }, token);
  return normalizeEditResult(value);
}

export async function updateCatalogTag(publicId: string, payload: CatalogTagMutation, token: string) {
  const value = await apiRequest<RawEditResult>(`${tagsPath}/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify(payload) }, token);
  return normalizeEditResult(value);
}

export async function archiveCatalogTag(publicId: string, baseRevisionId: string | undefined, reason: string, token: string) {
  const value = await apiRequest<RawEditResult>(`${tagsPath}/${encodeURIComponent(publicId)}`, {
    method: "DELETE",
    body: JSON.stringify({ baseRevisionId, reason }),
  }, token);
  return normalizeEditResult(value);
}

export async function loadCatalogRecipeTypeForEditing(publicId: string, token: string, locale = "") {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  const value = await apiRequest<unknown>(`${recipeTypesPath}/${encodeURIComponent(publicId)}${query}`, {}, token);
  return normalizeRecipeTypeDocument(value);
}

export async function createCatalogRecipeType(payload: CatalogRecipeTypeMutation, token: string) {
  const value = await apiRequest<RawEditResult>(recipeTypesPath, { method: "POST", body: JSON.stringify(payload) }, token);
  return normalizeEditResult(value);
}

export async function updateCatalogRecipeType(publicId: string, payload: CatalogRecipeTypeMutation, token: string) {
  const value = await apiRequest<RawEditResult>(`${recipeTypesPath}/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify(payload) }, token);
  return normalizeEditResult(value);
}

export async function archiveCatalogRecipeType(publicId: string, baseRevisionId: string | undefined, reason: string, token: string) {
  const value = await apiRequest<RawEditResult>(`${recipeTypesPath}/${encodeURIComponent(publicId)}`, {
    method: "DELETE",
    body: JSON.stringify({ baseRevisionId, reason }),
  }, token);
  return normalizeEditResult(value);
}

function normalizeTagDocument(value: unknown): CatalogTagEditorDocument {
  const source = record(value);
  return {
    publicId: text(source.publicId),
    registry: text(source.registry),
    canonicalId: text(source.canonicalId),
    defaultLocale: text(source.defaultLocale) || "en-US",
    publishedRevisionId: text(source.publishedRevisionId) || undefined,
    reviewStatus: parsePublishedReviewStatus(source.reviewStatus),
    localizations: parseLocalizedContentVersions(source.localizations),
    members: normalizeResources(source.members),
  };
}

function normalizeRecipeTypeDocument(value: unknown): CatalogRecipeTypeEditorDocument {
  const source = record(value);
  return {
    publicId: text(source.publicId),
    canonicalId: text(source.canonicalId),
    defaultLocale: text(source.defaultLocale) || "en-US",
    publishedRevisionId: text(source.publishedRevisionId) || undefined,
    reviewStatus: parsePublishedReviewStatus(source.reviewStatus),
    localizations: parseLocalizedContentVersions(source.localizations),
    catalysts: normalizeResources(source.catalysts),
    definition: record(source.definition),
    templateCount: number(source.templateCount),
    recipeCount: number(source.recipeCount),
  };
}

function normalizeResources(value: unknown): CatalogResourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = record(entry);
    const registry = text(source.registry) || "minecraft:item";
    const kind = text(source.kind) || kindFromRegistry(registry);
    return {
      publicId: text(source.publicId),
      id: text(source.id),
      registry,
      kind,
      names: Object.keys(stringRecord(source.names)).length
        ? stringRecord(source.names)
        : text(source.name)
      ? { [text(source.locale) || text(source.defaultLocale) || "en-US"]: text(source.name) }
          : {},
      iconUrl: text(source.iconUrl) || undefined,
      detailUrl: text(source.detailUrl) || undefined,
      source: record(source.source) as CatalogResourceRef["source"],
      versions: normalizeResourceVersions(source.versions),
    };
  }).filter((entry) => entry.publicId && entry.id);
}

function normalizeEditResult(value: RawEditResult): EditResult {
  return {
    objectPublicId: value.objectPublicId || "",
    revisionId: text(value.revisionId) || undefined,
    changeRequestId: text(value.changeRequestId),
    reviewStatus: parsePublishedReviewStatus(value.reviewStatus),
    activityEventId: text(value.activityEventId),
  };
}

function kindFromRegistry(value: string) {
  const lowered = value.toLowerCase();
  if (lowered.includes("fluid") || lowered.includes("chemical") || lowered.includes("gas")) return "fluid";
  if (lowered.includes("block")) return "block";
  return "item";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
