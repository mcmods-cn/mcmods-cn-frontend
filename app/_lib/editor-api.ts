import { API_BASE_URL, apiRequest } from "./api";
import { apiRecord as record, apiText as text } from "./api-normalizers";
import type {
  CatalogResourcePage,
  CatalogResourceQuery,
  ContentTranslationTask,
  LocalizedContentFields,
  LocalizationVersion,
  ResolvedContentDocument,
  TranslationRequest,
  TranslationRequestResult,
} from "./editor-types";

export function loadCatalogResources(query: CatalogResourceQuery, token = "", signal?: AbortSignal) {
  const parameters = new URLSearchParams();
  if (query.query?.trim()) parameters.set("q", query.query.trim());
  if (query.locale?.trim()) parameters.set("locale", query.locale.trim());
  if (query.kind?.trim()) parameters.set("kindCode", query.kind.trim());
	if (query.registry?.trim()) parameters.set("registry", query.registry.trim());
  parameters.set("limit", String(Math.max(1, Math.min(100, query.limit ?? 40))));
  parameters.set("offset", String(Math.max(0, query.offset ?? 0)));
  return apiRequest<{
    items: Array<{
      publicId: string;
	  kind: string;
	  id: string;
	  namespace?: string;
	  registry?: string;
      defaultLocale?: string;
      locale?: string;
      name?: string;
	  names?: Record<string, string>;
	  iconUrl?: string;
	  iconFileId?: string;
	  source?: {
		publicId?: string;
		siteId?: string;
		name?: string;
		type?: string;
		version?: string;
	  };
    }>;
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/catalog/resources?${parameters}`, { signal }, token || undefined).then((page): CatalogResourcePage => ({
    ...page,
	items: page.items.map((item) => ({
      publicId: item.publicId,
	  id: item.id,
	  registry: item.registry || item.namespace || item.id.split(":", 1)[0] || "minecraft",
      kind: item.kind,
      names: item.names || (item.name ? { [item.locale || query.locale || item.defaultLocale || "en-US"]: item.name } : {}),
	  resolvedName: item.name,
	  resolvedLocale: item.locale,
	  iconUrl: item.iconUrl || (item.iconFileId ? `/api/v1/catalog/resources/${encodeURIComponent(item.publicId)}/icon` : undefined),
	  source: item.source,
    })),
  }));
}

export function requestContentTranslation(
  path: string,
  request: TranslationRequest,
  token: string,
) {
  return apiRequest<TranslationRequestResult>(path, {
    method: "POST",
    // The object identity is carried by the endpoint path. Keeping the body
    // limited to the translation contract also works with strict JSON decoding.
    body: JSON.stringify({
      targetLocale: request.targetLocale,
      ...(request.sourceLocale ? { sourceLocale: request.sourceLocale } : {}),
    }),
  }, token);
}

export async function loadResolvedContent(
  publicId: string,
  locale: string,
  secondaryLocale = "",
  token = "",
  signal?: AbortSignal,
) {
  const parameters = new URLSearchParams();
  if (locale.trim()) parameters.set("locale", locale.trim());
  if (secondaryLocale.trim()) parameters.set("secondaryLocale", secondaryLocale.trim());
  const query = parameters.size ? `?${parameters}` : "";
  const value = await apiRequest<unknown>(
    `/api/v1/content/${encodeURIComponent(publicId)}${query}`,
    { cache: "no-store", signal },
    token || undefined,
  );
  return normalizeResolvedContent(value);
}

export async function loadOwnedResolvedContent(
  collection: "skins" | "blueprints",
  publicId: string,
  locale: string,
  token: string,
  secondaryLocale = "",
) {
  const parameters = new URLSearchParams();
  if (locale.trim()) parameters.set("locale", locale.trim());
  if (secondaryLocale.trim()) parameters.set("secondaryLocale", secondaryLocale.trim());
  const query = parameters.size ? `?${parameters}` : "";
  const value = await apiRequest<unknown>(
    `/api/v1/${collection}/${encodeURIComponent(publicId)}/content${query}`,
    { cache: "no-store" },
    token,
  );
  return normalizeResolvedContent(value);
}

export function loadContentTranslationTask(taskId: string, token: string, signal?: AbortSignal) {
  return apiRequest<ContentTranslationTask>(
    `/api/v1/content/translations/${encodeURIComponent(String(taskId))}`,
    { cache: "no-store", signal },
    token,
  );
}

export function catalogResourceIconURL(value?: string) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return "";
  if (candidate.startsWith("/")) return `${API_BASE_URL}${candidate}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeResolvedContent(value: unknown): ResolvedContentDocument<LocalizedContentFields> {
  const source = record(value);
  return {
    publicId: text(source.publicId),
    entityType: text(source.entityType),
    canonicalPath: text(source.canonicalPath),
    requestedLocale: text(source.requestedLocale),
    resolvedLocale: text(source.resolvedLocale),
    defaultLocale: text(source.defaultLocale) || "en-US",
    resolution: normalizeResolution(source.resolution),
    localization: source.localization ? normalizeResolvedLocalization(source.localization) : undefined,
    available: Array.isArray(source.available) ? source.available.map(normalizeResolvedLocalization).filter((item) => item.locale) : [],
    editableLocales: Array.isArray(source.editableLocales) ? source.editableLocales.filter((item): item is string => typeof item === "string") : [],
    translation: {
      status: normalizeTranslationState(record(source.translation).status),
      taskId: text(record(source.translation).taskId) || undefined,
      automatic: record(source.translation).automatic === true,
      canRequest: record(source.translation).canRequest === true,
      countsTowardDailyTokenQuota: record(source.translation).countsTowardDailyTokenQuota === true,
    },
  };
}

function normalizeResolvedLocalization(value: unknown): LocalizationVersion<LocalizedContentFields> {
  const source = record(value);
  const provenance = text(source.provenance);
  const reviewStatus = text(source.reviewStatus);
  return {
    locale: text(source.locale),
    fields: {
      name: text(source.name),
      summary: text(source.summary),
      contentMarkdown: text(source.contentMarkdown),
    },
    revisionId: text(source.publishedRevisionId) || undefined,
    provenance: provenance === "ai" || provenance === "human_corrected" || provenance === "original" || provenance === "import" ? provenance : "human",
    reviewStatus: reviewStatus === "pending" || reviewStatus === "rejected" || reviewStatus === "draft" ? reviewStatus : "approved",
    generatedFromLocale: text(source.sourceLocale) || undefined,
    editable: source.editable !== false,
    updatedAt: text(source.updatedAt) || undefined,
  };
}

function normalizeResolution(value: unknown): ResolvedContentDocument["resolution"] {
  const candidate = text(value);
  return candidate === "exact" || candidate === "auto_ai" || candidate === "secondary" || candidate === "zh_sibling"
    || candidate === "chinese_pair" || candidate === "secondary_chinese_pair" || candidate === "default"
    || candidate === "english" || candidate === "first_available" ? candidate : "missing";
}

function normalizeTranslationState(value: unknown): ResolvedContentDocument["translation"]["status"] {
  const candidate = text(value);
  return candidate === "queued" || candidate === "running" || candidate === "retrying" || candidate === "completed"
    || candidate === "ready" || candidate === "failed" || candidate === "request_required" || candidate === "unavailable"
    || candidate === "no_source" ? candidate : "not_required";
}
