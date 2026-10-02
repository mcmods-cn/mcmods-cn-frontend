import { normalizeUILocale, type UILocale } from "./ui-locale.mts";

export type I18nOverrides = Partial<Record<UILocale, Record<string, string>>>;

export function parseI18nOverrides(value: string): I18nOverrides {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const normalized: I18nOverrides = {};
    for (const [locale, messages] of Object.entries(parsed)) {
      const canonical = normalizeUILocale(locale);
      if (!canonical || !messages || typeof messages !== "object" || Array.isArray(messages)) continue;
      const valid: Record<string, string> = {};
      for (const [key, message] of Object.entries(messages)) {
        if (typeof message === "string" && message.trim()) {
          Object.defineProperty(valid, key, { value: message, enumerable: true, configurable: true, writable: true });
        }
      }
      normalized[canonical] = { ...(normalized[canonical] ?? {}), ...valid };
    }
    return normalized;
  } catch {
    return {};
  }
}

// One pass keeps values containing {anotherParameter} as literal user data.
// Replacement callbacks also preserve `$&`, `$'` and `$` literals.
export function formatI18nMessage(message: string, params?: Record<string, string | number>): string {
  if (!params) return message;
  return message.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => Object.hasOwn(params, key) ? String(params[key]) : placeholder);
}

export function hasSameI18nPlaceholders(source: string, translation: string): boolean {
  const names = (value: string) => [...new Set([...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]))].sort();
  return JSON.stringify(names(source)) === JSON.stringify(names(translation));
}
