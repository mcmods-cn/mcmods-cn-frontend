import type {
  LocalizedContentFields,
  LocalizationVersion,
  ReviewStatus,
  TranslationProvenance,
} from "./editor-types";

const reviewStatuses = new Set<ReviewStatus>(["draft", "pending", "approved", "rejected"]);
const publishedReviewStatuses = new Set<Exclude<ReviewStatus, "draft">>(["pending", "approved", "rejected"]);
const translationProvenances = new Set<TranslationProvenance>(["original", "import", "human", "ai", "human_corrected"]);

export function parseReviewStatus(value: unknown, field = "reviewStatus"): ReviewStatus {
  if (typeof value === "string" && reviewStatuses.has(value as ReviewStatus)) return value as ReviewStatus;
  throw protocolError(field, value, [...reviewStatuses]);
}

export function parsePublishedReviewStatus(value: unknown, field = "reviewStatus"): Exclude<ReviewStatus, "draft"> {
  if (typeof value === "string" && publishedReviewStatuses.has(value as Exclude<ReviewStatus, "draft">)) {
    return value as Exclude<ReviewStatus, "draft">;
  }
  throw protocolError(field, value, [...publishedReviewStatuses]);
}

export function parseOptionalPublishedReviewStatus(value: unknown, field = "reviewStatus"): Exclude<ReviewStatus, "draft"> | undefined {
  return value === undefined || value === null || value === "" ? undefined : parsePublishedReviewStatus(value, field);
}

export function parseTranslationProvenance(value: unknown, field = "provenance"): TranslationProvenance {
  if (typeof value === "string" && translationProvenances.has(value as TranslationProvenance)) {
    return value as TranslationProvenance;
  }
  throw protocolError(field, value, [...translationProvenances]);
}

export function parseLocalizedContentVersion(value: unknown, field = "localization"): LocalizationVersion<LocalizedContentFields> {
  const source = apiRecord(value, field);
  const locale = apiText(source.locale).trim();
  if (!locale) throw protocolError(`${field}.locale`, source.locale, ["non-empty locale"]);
  return {
    locale,
    fields: {
      name: apiText(source.name),
      summary: apiText(source.summary),
      contentMarkdown: apiText(source.contentMarkdown),
    },
    revisionId: apiText(source.publishedRevisionId) || undefined,
    provenance: parseTranslationProvenance(source.provenance, `${field}.provenance`),
    reviewStatus: parseReviewStatus(source.reviewStatus, `${field}.reviewStatus`),
    generatedFromLocale: apiText(source.sourceLocale) || undefined,
    editable: source.editable !== false,
    updatedAt: apiText(source.updatedAt) || undefined,
  };
}

export function parseLocalizedContentVersions(value: unknown, field = "localizations"): LocalizationVersion<LocalizedContentFields>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw protocolError(field, value, ["array"]);
  return value.map((item, index) => parseLocalizedContentVersion(item, `${field}[${index}]`));
}

function apiRecord(value: unknown, field: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw protocolError(field, value, ["object"]);
}

function apiText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function protocolError(field: string, value: unknown, expected: string[]) {
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "string" ? JSON.stringify(value) : typeof value;
  return new Error(`Invalid API ${field}: expected ${expected.join(" | ")}, received ${actual}`);
}
