import { apiRequest } from "./api";
import type { LocalizationVersion, ReviewStatus, TranslationProvenance } from "./editor-types";
import type {
  CatalogEditResult,
  RecipeMutation,
  RecipeLocalizedFields,
  RecipeRecord,
  RecipeSourceVersionOption,
  RecipeTemplateMutation,
  RecipeTemplateRecord,
  RecipeTypeOption,
} from "./recipe-editor-types";

type RawMutationResult = Partial<CatalogEditResult> & {
  publicId?: string;
  status?: string;
};

export async function loadRecipeTypeOptions(token = "", signal?: AbortSignal) {
  const items: RecipeTypeOption[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const value = await apiRequest<unknown>(
      `/api/v1/recipe-types?limit=60&offset=${offset}`,
      { signal },
      token || undefined,
    );
    const rows = arrayFromEnvelope(value, "items");
    const envelope = objectValue(value);
    total = optionalNumber(envelope.total) ?? rows.length;
    for (const row of rows) {
      const item = normalizeRecipeTypeOption(row);
      if (!item || seen.has(item.publicId)) continue;
      seen.add(item.publicId);
      items.push(item);
    }
    if (!rows.length) break;
    offset += rows.length;
  }
  return items;
}

export async function loadRecipeSourceVersions(token = "", signal?: AbortSignal): Promise<RecipeSourceVersionOption[]> {
  const value = await apiRequest<unknown>(
    "/api/v1/catalog/recipe-source-versions?limit=1000",
    { signal },
    token || undefined,
  );
  return arrayFromEnvelope(value, "items").map(normalizeRecipeSourceVersion).filter((item): item is RecipeSourceVersionOption => Boolean(item));
}

export async function loadRecipeTemplates(recipeTypePublicId: string, token = "", signal?: AbortSignal) {
  const value = await apiRequest<unknown>(
    `/api/v1/recipe-types/${encodeURIComponent(recipeTypePublicId)}/templates`,
    { signal },
    token || undefined,
  );
  const rows = arrayFromEnvelope(value, "items", "templates");
  return rows
    .map((row) => normalizeRecipeTemplate(row, recipeTypePublicId, false))
    .filter((item): item is RecipeTemplateRecord => Boolean(item));
}

export async function loadRecipeTemplate(publicId: string, token = "", signal?: AbortSignal) {
  const value = await apiRequest<unknown>(
    `/api/v1/recipe-templates/${encodeURIComponent(publicId)}`,
    { signal },
    token || undefined,
  );
  const row = objectValue(value);
  const recipeTypePublicId = stringValue(row.recipeTypePublicId);
  const template = normalizeRecipeTemplate(value, recipeTypePublicId, true);
  return template;
}

export async function loadRecipe(publicId: string, token = "", signal?: AbortSignal): Promise<RecipeRecord | undefined> {
  const value = await apiRequest<unknown>(
    `/api/v1/catalog/recipes/${encodeURIComponent(publicId)}`,
    { signal },
    token || undefined,
  );
  const row = objectValue(value);
  const recipeTypePublicId = stringValue(row.recipeTypePublicId);
  const templatePublicId = stringValue(row.templatePublicId);
  if (!recipeTypePublicId) return undefined;
  const bindingRows = objectValue(row.bindings);
  return {
    publicId: stringValue(row.publicId) || publicId,
    recipeTypePublicId,
    templatePublicId,
    sourceVersionPublicId: stringValue(row.sourceVersionPublicId) || undefined,
    sourceVersion: normalizeRecipeSourceVersion(row.sourceVersion),
    canonicalSourceId: stringValue(row.canonicalSourceId),
    definition: objectValue(row.definition),
    bindings: Object.fromEntries(Object.entries(bindingRows).map(([slotKey, value]) => {
      const binding = objectValue(value);
      return [slotKey, {
        definition: objectValue(binding.definition),
        candidates: arrayValue(binding.candidates).map((candidate) => {
          const item = objectValue(candidate);
          const canonicalId = stringValue(item.canonicalId) || stringValue(item.id) || stringValue(item.rawResourceId) || stringValue(item.resourcePublicId);
          const publicId = stringValue(item.resourcePublicId) || stringValue(item.publicId);
          const unresolved = item.unresolved === true || Boolean(stringValue(item.rawResourceId));
          const probability = optionalNumber(item.probability);
          return {
            resource: {
              publicId,
              id: canonicalId,
              registry: canonicalId.includes(":") ? canonicalId.slice(0, canonicalId.indexOf(":")) : "",
              kind: stringValue(item.kindCode) || stringValue(item.kind),
              names: stringValue(item.name) ? { [stringValue(row.defaultLocale) || "en-US"]: stringValue(item.name) } : {},
              iconUrl: stringValue(item.iconUrl) || undefined,
              unresolved,
              rawIdentifier: unresolved ? canonicalId : undefined,
            },
            amount: numberValue(item.amount, 1),
            probability,
            byproduct: item.byproduct === true,
            definition: objectValue(item.definition),
          };
        }),
      }];
    })),
    defaultLocale: stringValue(row.defaultLocale) || undefined,
    localizations: normalizeLocalizations(row.localizations),
    publishedRevisionId: stringValue(row.publishedRevisionId) || undefined,
    reviewStatus: optionalReviewStatus(row.reviewStatus),
  };
}

function normalizeRecipeSourceVersion(value: unknown): RecipeSourceVersionOption | undefined {
  const row = objectValue(value);
  const publicId = stringValue(row.publicId);
  if (!publicId) return undefined;
  return {
    publicId,
    modPublicId: stringValue(row.modPublicId),
    modSiteId: stringValue(row.modSiteId),
    modName: stringValue(row.modName),
    label: stringValue(row.label),
    minecraftVersions: arrayValue(row.minecraftVersions).map(stringValue).filter(Boolean),
    loaders: arrayValue(row.loaders).map(stringValue).filter(Boolean),
    modVersion: stringValue(row.modVersion),
  };
}

export async function saveRecipeTemplate(
  recipeTypePublicId: string,
  publicId: string | undefined,
  payload: RecipeTemplateMutation,
  token: string,
) {
  const path = publicId
    ? `/api/v1/recipe-templates/${encodeURIComponent(publicId)}`
    : `/api/v1/recipe-types/${encodeURIComponent(recipeTypePublicId)}/templates`;
  const result = await apiRequest<RawMutationResult>(path, {
    method: publicId ? "PUT" : "POST",
    body: JSON.stringify(payload),
  }, token);
  return normalizeMutationResult(result, publicId);
}

export async function deleteRecipeTemplate(publicId: string, baseRevisionId: string | undefined, reason: string, token: string) {
  const result = await apiRequest<RawMutationResult>(
    `/api/v1/recipe-templates/${encodeURIComponent(publicId)}`,
    { method: "DELETE", body: JSON.stringify({ baseRevisionId, reason }) },
    token,
  );
  return normalizeMutationResult(result, publicId);
}

export async function saveRecipe(
  recipeTypePublicId: string,
  publicId: string | undefined,
  payload: RecipeMutation,
  token: string,
) {
  const path = publicId
    ? `/api/v1/catalog/recipes/${encodeURIComponent(publicId)}`
    : `/api/v1/recipe-types/${encodeURIComponent(recipeTypePublicId)}/recipes`;
  const result = await apiRequest<RawMutationResult>(path, {
    method: publicId ? "PUT" : "POST",
    body: JSON.stringify(payload),
  }, token);
  return normalizeMutationResult(result, publicId);
}

export async function deleteRecipe(publicId: string, baseRevisionId: string | undefined, reason: string, token: string) {
  const result = await apiRequest<RawMutationResult>(
    `/api/v1/catalog/recipes/${encodeURIComponent(publicId)}`,
    { method: "DELETE", body: JSON.stringify({ baseRevisionId, reason }) },
    token,
  );
  return normalizeMutationResult(result, publicId);
}

function normalizeMutationResult(value: RawMutationResult, fallbackPublicId = ""): CatalogEditResult {
  return {
    objectPublicId: stringValue(value.objectPublicId) || stringValue(value.publicId) || fallbackPublicId,
    operation: stringValue(value.operation),
    revisionId: stringValue(value.revisionId) || undefined,
    changeRequestId: stringValue(value.changeRequestId),
    reviewStatus: value.reviewStatus === "pending" || value.status === "pending" ? "pending" : value.reviewStatus === "rejected" ? "rejected" : "approved",
    activityEventId: stringValue(value.activityEventId),
  };
}

function normalizeRecipeTypeOption(value: unknown): RecipeTypeOption | undefined {
  const row = objectValue(value);
  const publicId = stringValue(row.publicId) || stringValue(row.entityPublicId);
  const canonicalId = stringValue(row.canonicalId) || stringValue(row.recipeTypeId) || stringValue(row.id);
  if (!publicId || !canonicalId) return undefined;
  return {
    publicId,
    canonicalId,
    name: stringValue(row.name) || localizedName(row.names) || canonicalId,
    templateCount: optionalNumber(row.templateCount),
  };
}

function normalizeRecipeTemplate(value: unknown, recipeTypePublicId: string, detailLoaded: boolean): RecipeTemplateRecord | undefined {
  const row = objectValue(value);
  const canvasRow = objectValue(row.canvas);
  const definition = objectValue(row.definition);
  const width = numberValue(canvasRow.width, 176);
  const height = numberValue(canvasRow.height, 86);
  const templateKey = stringValue(row.templateKey) || stringValue(row.key);
  if (!templateKey) return undefined;
  return {
    publicId: stringValue(row.publicId) || undefined,
    detailLoaded,
    recipeTypePublicId: stringValue(row.recipeTypePublicId) || recipeTypePublicId,
    templateKey,
    backgroundFileId: stringValue(row.backgroundFileId) || undefined,
    backgroundUrl: stringValue(row.backgroundUrl) || stringValue(row.backgroundAccessUrl) || stringValue(definition.backgroundUrl) || undefined,
    canvas: {
      width,
      height,
      imageScale: numberValue(canvasRow.imageScale, 1),
      definition: objectValue(canvasRow.definition),
    },
    definition,
    slots: arrayValue(row.slots).map((slot, ordinal) => {
      const item = objectValue(slot);
      const rect = objectValue(item.rect);
      const role = stringValue(item.role);
      return {
        slotKey: stringValue(item.slotKey),
        role: role === "output" || role === "catalyst" ? role : "input",
        outputIndex: optionalNumber(item.outputIndex),
        ordinal: numberValue(item.ordinal, ordinal),
        rect: {
          x: numberValue(rect.x),
          y: numberValue(rect.y),
          width: numberValue(rect.width, 18),
          height: numberValue(rect.height, 18),
        },
        definition: objectValue(item.definition),
      };
    }),
    slotCount: optionalNumber(row.slotCount) ?? arrayValue(row.slots).length,
    defaultLocale: stringValue(row.defaultLocale) || undefined,
    localizations: normalizeLocalizations(row.localizations),
    publishedRevisionId: stringValue(row.publishedRevisionId) || undefined,
    reviewStatus: optionalReviewStatus(row.reviewStatus),
  };
}

function arrayFromEnvelope(value: unknown, ...keys: string[]) {
  if (Array.isArray(value)) return value;
  const row = objectValue(value);
  for (const key of keys) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = numberValue(value, Number.NaN);
  return Number.isFinite(number) ? number : undefined;
}

function localizedName(value: unknown) {
  const names = objectValue(value);
  for (const candidate of [names["zh-CN"], names["zh-TW"], names["en-US"], names.en, ...Object.values(names)]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function normalizeLocalizations(value: unknown): LocalizationVersion<RecipeLocalizedFields>[] {
  return arrayValue(value).map((localization) => {
    const item = objectValue(localization);
    const provenance = stringValue(item.provenance);
    const reviewStatus = stringValue(item.reviewStatus);
    return {
      locale: stringValue(item.locale),
      fields: {
        name: stringValue(item.name),
        summary: stringValue(item.summary),
        contentMarkdown: stringValue(item.contentMarkdown),
      },
      revisionId: stringValue(item.publishedRevisionId) || undefined,
      provenance: normalizeProvenance(provenance),
      reviewStatus: normalizeReviewStatus(reviewStatus),
      generatedFromLocale: stringValue(item.sourceLocale) || undefined,
      editable: item.editable !== false,
    };
  });
}

function normalizeProvenance(value: string): TranslationProvenance {
  return value === "ai" || value === "human_corrected" || value === "original" || value === "import" ? value : "human";
}

function normalizeReviewStatus(value: string): ReviewStatus {
  return value === "pending" || value === "rejected" || value === "draft" ? value : "approved";
}

function optionalReviewStatus(value: unknown): ReviewStatus | undefined {
  const status = stringValue(value);
  return status ? normalizeReviewStatus(status) : undefined;
}
