import { apiRequest } from "./api";
import type { CatalogResourceRef, CatalogResourceVersion, EditResult, LocalizationVersion, ReviewStatus } from "./editor-types";

export type CatalogLocalizedFields = {
  name: string;
  summary: string;
  contentMarkdown: string;
};

export type CatalogEditorLocalization = LocalizationVersion<CatalogLocalizedFields>;

export type CatalogTagEditorDocument = {
  entityId: string;
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
  entityId: string;
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
  publicId?: string;
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
    entityId: text(source.entityId),
    publicId: text(source.publicId),
    registry: text(source.registry),
    canonicalId: text(source.canonicalId) || text(source.tagId),
    defaultLocale: text(source.defaultLocale) || "en-US",
    publishedRevisionId: text(source.publishedRevisionId) || undefined,
    reviewStatus: normalizeReviewStatus(source.reviewStatus),
    localizations: normalizeLocalizations(source.localizations),
    members: normalizeResources(source.members ?? source.memberResources),
  };
}

function normalizeRecipeTypeDocument(value: unknown): CatalogRecipeTypeEditorDocument {
  const source = record(value);
  return {
    entityId: text(source.entityId),
    publicId: text(source.publicId),
    canonicalId: text(source.canonicalId) || text(source.recipeTypeId),
    defaultLocale: text(source.defaultLocale) || "en-US",
    publishedRevisionId: text(source.publishedRevisionId) || undefined,
    reviewStatus: normalizeReviewStatus(source.reviewStatus),
    localizations: normalizeLocalizations(source.localizations),
    catalysts: normalizeResources(source.catalysts ?? source.catalystResources),
    definition: record(source.definition),
    templateCount: number(source.templateCount),
    recipeCount: number(source.recipeCount),
  };
}

function normalizeLocalizations(value: unknown): CatalogEditorLocalization[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = record(entry);
    const fields = record(source.fields);
    return {
      locale: text(source.locale),
      fields: {
        name: text(fields.name ?? source.name),
        summary: text(fields.summary ?? source.summary),
        contentMarkdown: text(fields.contentMarkdown ?? source.contentMarkdown),
      },
      revisionId: text(source.revisionId ?? source.publishedRevisionId) || undefined,
      provenance: normalizeProvenance(source.provenance),
      reviewStatus: normalizeReviewStatus(source.reviewStatus),
      generatedFromLocale: text(source.generatedFromLocale ?? source.sourceLocale) || undefined,
      editable: source.editable !== false,
      updatedAt: text(source.updatedAt) || undefined,
    };
  }).filter((entry) => entry.locale);
}

function normalizeResources(value: unknown): CatalogResourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = record(entry);
    const registry = text(source.registry ?? source.kindCode) || "minecraft:item";
    const kind = text(source.kind ?? source.kindCode) || kindFromRegistry(registry);
    return {
      publicId: text(source.publicId),
      entityId: text(source.entityId) || undefined,
      id: text(source.id ?? source.canonicalId ?? source.item ?? source.resource_location),
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
    };
  }).filter((entry) => entry.publicId);
}

function normalizeEditResult(value: RawEditResult): EditResult {
  return {
    objectPublicId: value.objectPublicId || value.publicId || "",
    revisionId: text(value.revisionId) || undefined,
    changeRequestId: text(value.changeRequestId),
    reviewStatus: value.reviewStatus === "approved" || value.reviewStatus === "rejected" ? value.reviewStatus : "pending",
    activityEventId: text(value.activityEventId),
  };
}

function normalizeProvenance(value: unknown): CatalogEditorLocalization["provenance"] {
  return value === "original" || value === "import" || value === "ai" || value === "human_corrected" ? value : "human";
}

function normalizeReviewStatus(value: unknown): CatalogEditorLocalization["reviewStatus"] {
  return value === "pending" || value === "rejected" || value === "draft" ? value : "approved";
}

function kindFromRegistry(value: string) {
  const lowered = value.toLowerCase();
  if (lowered.includes("fluid") || lowered.includes("chemical") || lowered.includes("gas")) return "fluid";
  if (lowered.includes("block")) return "block";
  return "item";
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
