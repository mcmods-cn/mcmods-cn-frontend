export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number;
  details?: unknown;

  constructor(message: string, status: number, code = "", retryAfter = 0, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export type ErrorTranslator = (key: string, params?: Record<string, string | number>) => string;

// These are presentation keys, not a second business-error authority. Keep the
// server code, details and retry budget unchanged; never classify by prose.
const errorTranslationKeys: Readonly<Record<string, string>> = {
  API_RESPONSE_EMPTY: "apiErrors.emptyResponse",
  CONTENT_LANGUAGE_REQUEST_INVALID: "apiErrors.HTTP_400",
  CONTENT_LANGUAGE_TAG_INVALID: "apiErrors.invalidLanguageTag",
  CONTENT_LANGUAGE_SECONDARY_UNSUPPORTED: "contentLanguage.unsupportedSecondary",
  CONTENT_LANGUAGE_SETTINGS_READ_FAILED: "contentLanguage.loadFailed",
  CONTENT_LANGUAGE_SETTINGS_UPDATE_FAILED: "contentLanguage.saveFailed",
  CONTENT_LANGUAGE_SETTINGS_AUDIT_FAILED: "contentLanguage.saveFailed",
  COMMENT_EDIT_CONFLICT: "apiErrors.editConflict",
  COMMUNITY_POST_EDIT_CONFLICT: "apiErrors.editConflict",
  CHANGELOG_LOOKUP_FAILED: "apiErrors.HTTP_500",
  PROJECT_REVIEW_PREVIEW_INVALID: "apiErrors.HTTP_400",
  PROJECT_REVIEW_PREVIEW_AUTH_REQUIRED: "apiErrors.HTTP_401",
  PROJECT_REVIEW_PREVIEW_NOT_FOUND: "apiErrors.HTTP_404",
  PROJECT_REVIEW_PREVIEW_FORBIDDEN: "apiErrors.HTTP_403",
  PROJECT_REVIEW_PREVIEW_UNAVAILABLE: "apiErrors.HTTP_503",
  PROJECT_REVIEW_PREVIEW_INVALID_SNAPSHOT: "apiErrors.HTTP_500",
  COMMENT_IDEMPOTENCY_SCOPE_CONFLICT: "apiErrors.idempotencyScopeConflict",
  challenge_required: "antiAbuse.challengeRequired",
  account_banned: "apiErrors.accountBanned",
  anti_abuse_state_unavailable: "apiErrors.HTTP_503",
  invalid_anti_abuse_config: "apiErrors.HTTP_400",
  auth_rate_limited: "apiErrors.HTTP_429",
  crawler_rate_limited: "apiErrors.HTTP_429",
  LOG_SHARE_READ_RATE_LIMIT: "apiErrors.HTTP_429",
  LOG_SHARE_READ_BUSY: "apiErrors.HTTP_503",
  LOG_SHARE_ENTRY_INVALID: "apiErrors.HTTP_400",
  LOG_SHARE_CHUNK_QUERY_INVALID: "apiErrors.HTTP_400",
  LOG_SHARE_CHUNK_CURSOR_INVALID: "apiErrors.HTTP_400",
  LOG_SHARE_METADATA_QUERY_INVALID: "apiErrors.HTTP_400",
  LOG_SHARE_CHUNK_RESPONSE_BUDGET: "apiErrors.HTTP_413",
  LOG_SHARE_METADATA_RESPONSE_BUDGET: "apiErrors.HTTP_413",
};

export function apiErrorMessage(error: unknown, t: ErrorTranslator, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const key = Object.hasOwn(errorTranslationKeys, error.code)
    ? errorTranslationKeys[error.code]
    : /^HTTP_[45][0-9]{2}$/.test(error.code) ? `apiErrors.${error.code}` : undefined;
  if (!key) return fallback;
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
}
