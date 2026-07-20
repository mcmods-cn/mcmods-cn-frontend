export type ContentLanguageTag = string;

export type TranslationProvenance = "original" | "import" | "human" | "ai" | "human_corrected";

export type ReviewStatus = "draft" | "pending" | "approved" | "rejected";

export type LocalizationVersion<TFields = Record<string, string>> = {
  locale: ContentLanguageTag;
  fields: TFields;
  revisionId?: number;
  provenance: TranslationProvenance;
  reviewStatus: ReviewStatus;
  generatedFromLocale?: ContentLanguageTag;
  editable: boolean;
  updatedAt?: string;
};

export type ContentResolutionReason =
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

export type TranslationCost = "free_system" | "user_daily_tokens" | "none";

export type TranslationTaskStatus = "queued" | "running" | "retrying" | "completed" | "ready" | "failed";

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
  revisionId?: number;
  changeRequestId: number;
  reviewStatus: Exclude<ReviewStatus, "draft">;
  activityEventId: number;
};

export type EditorOperation = "create" | "update" | "delete" | "translate";

export type EditCommand<TPayload> = {
  objectType: string;
  objectPublicId?: string;
  operation: EditorOperation;
  baseRevisionId?: number;
  locale?: ContentLanguageTag;
  changeReason?: string;
  source?: "manual" | "import" | "ai";
  payload: TPayload;
};

export type EditorCapabilities = {
  canCreate: boolean;
  canEditInvariant: boolean;
  canEditLocalized: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canReview?: boolean;
  editableLocales?: ContentLanguageTag[];
};

export type CatalogResourceSource = {
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
  taskId?: number;
  status?: TranslationTaskStatus;
  countsTowardDailyTokenQuota?: boolean;
  resolution?: ContentResolution;
  editResult?: EditResult;
};

export type ResolvedContentTranslationState = {
  status: TranslationTaskStatus | "not_required" | "request_required" | "unavailable" | "no_source";
  taskId?: number;
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
  taskId: number;
  status: TranslationTaskStatus;
  error?: string;
  targetLocale?: ContentLanguageTag;
  translation?: Record<string, string>;
  inputTokens?: number;
  outputTokens?: number;
};
