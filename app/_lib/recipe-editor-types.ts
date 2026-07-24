import type { CatalogResourceRef, ContentLanguageTag, EditResult, LocalizationVersion, ReviewStatus } from "./editor-types";

export type RecipeSlotRole = "input" | "output" | "catalyst";

export type RecipeSlotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecipeTemplateSlot = {
  slotKey: string;
  role: RecipeSlotRole;
  outputIndex?: number;
  ordinal: number;
  rect: RecipeSlotRect;
  definition?: Record<string, unknown>;
};

export type RecipeTemplateCanvas = {
  width: number;
  height: number;
  imageScale: number;
  definition?: Record<string, unknown>;
};

export type RecipeTemplateRecord = {
  publicId?: string;
  detailLoaded?: boolean;
  recipeTypePublicId: string;
  templateKey: string;
  backgroundFileId?: number;
  backgroundUrl?: string;
  canvas: RecipeTemplateCanvas;
  definition?: Record<string, unknown>;
  slots: RecipeTemplateSlot[];
  slotCount?: number;
  defaultLocale?: ContentLanguageTag;
  localizations?: LocalizationVersion<RecipeLocalizedFields>[];
  publishedRevisionId?: number;
  reviewStatus?: ReviewStatus;
};

export type RecipeLocalizedFields = {
  name: string;
  summary: string;
  contentMarkdown: string;
};

export type RecipeTypeOption = {
  publicId: string;
  canonicalId: string;
  name: string;
  templateCount?: number;
};

export type RecipeSourceVersionOption = {
  publicId: string;
  modPublicId: string;
  modSiteId: string;
  modName: string;
  label: string;
  minecraftVersions: string[];
  loaders: string[];
  modVersion: string;
};

export type RecipeCandidate = {
  resource: CatalogResourceRef;
  amount: number;
  probability?: number;
  byproduct?: boolean;
  definition?: Record<string, unknown>;
};

export type RecipeBinding = {
  candidates: RecipeCandidate[];
  definition?: Record<string, unknown>;
};

export type RecipeRecord = {
  publicId?: string;
  recipeTypePublicId: string;
  templatePublicId: string;
  sourceVersionPublicId?: string;
  sourceVersion?: RecipeSourceVersionOption;
  canonicalSourceId: string;
  definition?: Record<string, unknown>;
  bindings: Record<string, RecipeBinding>;
  defaultLocale?: ContentLanguageTag;
  localizations?: LocalizationVersion<RecipeLocalizedFields>[];
  publishedRevisionId?: number;
  reviewStatus?: ReviewStatus;
};

export type RecipeSummary = {
  publicId: string;
  canonicalSourceId: string;
  identitySource: string;
  templatePublicId?: string;
  publishedRevisionId?: number;
  definition: Record<string, unknown>;
  bindingCount: number;
  source: "canonical" | "import";
  sourceVersionPublicId?: string;
  sourceVersion?: RecipeSourceVersionOption;
  importRevisionId?: string;
  locale?: string;
  name?: string;
  names: Record<string, string>;
};

export type RecipeSummaryPage = {
  items: RecipeSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type RecipeTemplateMutation = {
  baseRevisionId?: number;
  reason: string;
  defaultLocale: string;
  localizations: Array<RecipeLocalizedFields & { locale: string }>;
  templateKey: string;
  backgroundFileId?: number;
  canvas: RecipeTemplateCanvas;
  definition: Record<string, unknown>;
  slots: RecipeTemplateSlot[];
};

export type RecipeMutation = {
  baseRevisionId?: number;
  reason: string;
  defaultLocale: string;
  localizations: Array<RecipeLocalizedFields & { locale: string }>;
  recipeTypePublicId: string;
  templatePublicId: string;
  sourceVersionPublicId?: string;
  canonicalSourceId: string;
  definition: Record<string, unknown>;
  bindings: Record<string, {
    candidates: Array<{
      resourcePublicId: string;
      amount: number;
      probability?: number;
      byproduct?: boolean;
      definition?: Record<string, unknown>;
    }>;
    definition?: Record<string, unknown>;
  }>;
};

export type CatalogEditResult = EditResult & {
  operation?: string;
};
