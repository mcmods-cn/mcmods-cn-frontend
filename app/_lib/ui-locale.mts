export const supportedUILocales = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en-US", label: "English (US)" },
  { code: "ja-JP", label: "日本語" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "ru-RU", label: "Русский" },
] as const;

export type UILocale = (typeof supportedUILocales)[number]["code"];
export const uiLocaleCodes: readonly UILocale[] = supportedUILocales.map(({ code }) => code);
export const defaultUILocale: UILocale = "zh-CN";
export const uiLocaleCookieName = "mcmods-ui-locale";

const localeAliases: Record<string, UILocale> = {
  "zh": "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN",
  "zh-tw": "zh-TW", "zh-hk": "zh-TW", "zh-hant": "zh-TW",
  "en": "en-US", "en-us": "en-US",
  "ja": "ja-JP", "ja-jp": "ja-JP",
  "fr": "fr-FR", "fr-fr": "fr-FR",
  "de": "de-DE", "de-de": "de-DE",
  "es": "es-ES", "es-es": "es-ES",
  "ru": "ru-RU", "ru-ru": "ru-RU",
};

export function normalizeUILocale(value: string | null | undefined): UILocale | undefined {
  const normalized = value?.trim().replaceAll("_", "-").toLowerCase();
  return normalized ? localeAliases[normalized] : undefined;
}

export function readUILocaleCookie(cookieHeader: string): UILocale | undefined {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== uiLocaleCookieName) continue;
    try {
      return normalizeUILocale(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function serializeUILocaleCookie(locale: UILocale): string {
  return `${uiLocaleCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
