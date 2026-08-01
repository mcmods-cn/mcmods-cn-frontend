export type ContentLanguageTag = string;

export type TranslationProvenance = "original" | "import" | "human" | "ai" | "human_corrected";

export type ReviewStatus = "draft" | "pending" | "approved" | "rejected";

export type LocalizationVersion<TFields = Record<string, string>> = {
  locale: ContentLanguageTag;
  fields: TFields;
  revisionId?: string;
  provenance: TranslationProvenance;
  reviewStatus: ReviewStatus;
  generatedFromLocale?: ContentLanguageTag;
  editable: boolean;
  updatedAt?: string;
};

type ContentResolutionReason =
  | "exact"
  | "auto_ai"
  | "secondary"
  | "zh_sibling"
  | "chinese_pair"
  | "secondary_chinese_pair"
  | "default"
  | "english"
  | "first_available"
  | "missing";

type TranslationCost = "free_system" | "user_daily_tokens" | "none";

type TranslationTaskStatus = "queued" | "running" | "retrying" | "completed" | "ready" | "failed";

export type ContentResolution = {
  requestedLocale: ContentLanguageTag;
  resolvedLocale: ContentLanguageTag;
  reason: ContentResolutionReason;
  editable: boolean;
  canTranslate: boolean;
  translationCost: TranslationCost;
  translationStatus?: TranslationTaskStatus;
};

export type EditResult = {
  objectPublicId: string;
  revisionId?: string;
  changeRequestId: string;
  reviewStatus: Exclude<ReviewStatus, "draft">;
  activityEventId: string;
};

type CatalogResourceSource = {
  publicId?: string;
  siteId?: string;
  name?: string;
  type?: string;
  version?: string;
};

export type CatalogResourceRef = {
  publicId: string;
  entityId?: string;
  id: string;
  registry: string;
  kind: string;
  names: Record<string, string>;
  resolvedName?: string;
  resolvedLocale?: ContentLanguageTag;
  iconUrl?: string;
  unresolved?: boolean;
  rawIdentifier?: string;
  source?: CatalogResourceSource;
  versions?: CatalogResourceVersion[];
};

export type CatalogResourceVersion = {
  publicId: string;
  label: string;
  minecraftVersions: string[];
  loaders: string[];
  modVersion: string;
  sourceKind: "manual" | "import";
  hasDetail: boolean;
  revisionId: string;
  registry: string;
  iconPath: string;
  previewPath?: string;
  iconFileId?: string;
  renderFileId?: string;
  modSiteId: string;
  names: Record<string, string>;
  name?: string;
  iconUrl?: string;
  detailUrl?: string;
};

export type CatalogResourcePage = {
  items: CatalogResourceRef[];
  total: number;
  limit: number;
  offset: number;
};

export type CatalogResourceQuery = {
  query?: string;
  locale?: ContentLanguageTag;
  kind?: string;
  registry?: string;
  limit?: number;
  offset?: number;
};

export type TranslationRequest = {
  objectType: string;
  objectPublicId: string;
  sourceLocale?: ContentLanguageTag;
  targetLocale: ContentLanguageTag;
};

export type TranslationRequestResult = {
  cached?: boolean;
  taskId?: string;
  status?: TranslationTaskStatus;
  countsTowardDailyTokenQuota?: boolean;
  resolution?: ContentResolution;
  editResult?: EditResult;
};

type ResolvedContentTranslationState = {
  status: TranslationTaskStatus | "not_required" | "request_required" | "unavailable" | "no_source";
  taskId?: string;
  automatic: boolean;
  canRequest: boolean;
  countsTowardDailyTokenQuota: boolean;
};

export type ResolvedContentDocument<TFields = Record<string, string>> = {
  publicId: string;
  entityType: string;
  requestedLocale: ContentLanguageTag;
  resolvedLocale: ContentLanguageTag;
  defaultLocale: ContentLanguageTag;
  resolution: ContentResolutionReason;
  localization?: LocalizationVersion<TFields>;
  available: LocalizationVersion<TFields>[];
  editableLocales: ContentLanguageTag[];
  translation: ResolvedContentTranslationState;
};

export type ContentTranslationTask = {
  taskId: string;
  status: TranslationTaskStatus;
  error?: string;
  targetLocale?: ContentLanguageTag;
  translation?: Record<string, string>;
  inputTokens?: number;
  outputTokens?: number;
};
