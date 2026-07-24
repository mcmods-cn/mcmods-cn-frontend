import { normalizeUILocale, type Locale } from "./i18n-provider";
import type { CatalogResourceRef, ContentLanguageTag, LocalizationVersion } from "./editor-types";

export const editableContentLanguages = ["zh-CN", "zh-TW", "en-US", "ja-JP", "fr-FR", "de-DE", "es-ES", "ru-RU"] as const satisfies readonly Locale[];

const editableLanguageSet = new Set<string>(editableContentLanguages);

const minecraftLocaleAliases: Record<Locale, readonly string[]> = {
  "zh-CN": ["zh-CN", "zh_cn", "zh-Hans", "zh_hans"],
  "zh-TW": ["zh-TW", "zh_tw", "zh-Hant", "zh_hant"],
  "en-US": ["en-US", "en", "en_us"],
  "ja-JP": ["ja-JP", "ja", "ja_jp"],
  "fr-FR": ["fr-FR", "fr", "fr_fr"],
  "de-DE": ["de-DE", "de", "de_de"],
  "es-ES": ["es-ES", "es", "es_es"],
  "ru-RU": ["ru-RU", "ru", "ru_ru"],
};

export function normalizeContentLanguage(value: ContentLanguageTag | null | undefined) {
  const candidate = value?.trim().replaceAll("_", "-") ?? "";
  if (!candidate) return "";
  const supported = normalizeUILocale(candidate);
  if (supported) return supported;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? candidate;
  } catch {
    return candidate;
  }
}

export function toEditableContentLanguage(value: ContentLanguageTag | null | undefined): Locale | undefined {
  const normalized = normalizeContentLanguage(value);
  if (!normalized) return undefined;
  if (editableLanguageSet.has(normalized)) return normalized as Locale;
  const [language = "", region = ""] = normalized.toLowerCase().split("-");
  if (language === "zh") {
    return ["tw", "hk", "mo", "hant"].includes(region) || normalized.toLowerCase().includes("hant")
      ? "zh-TW"
      : "zh-CN";
  }
  return editableContentLanguages.find((item) => item.toLowerCase().startsWith(`${language}-`));
}

export function isEditableContentLanguage(value: ContentLanguageTag | null | undefined): value is Locale {
  const normalized = normalizeContentLanguage(value);
  return editableLanguageSet.has(normalized);
}

export function contentLanguageCandidates(
  primary: ContentLanguageTag,
  secondary = "",
  defaultLanguage: ContentLanguageTag = "en-US",
) {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeContentLanguage(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  };
  const addWithChineseSibling = (value: string) => {
    add(value);
    const editable = toEditableContentLanguage(value);
    if (editable === "zh-CN") add("zh-TW");
    if (editable === "zh-TW") add("zh-CN");
  };

  addWithChineseSibling(primary);
  addWithChineseSibling(secondary);
  addWithChineseSibling(defaultLanguage);
  add("en-US");
  return result;
}

export function findLocalizationVersion<TFields>(
  versions: readonly LocalizationVersion<TFields>[],
  locale: ContentLanguageTag,
) {
  const requestedKey = comparableLanguageKey(locale);
  return versions.find((version) => comparableLanguageKey(version.locale) === requestedKey);
}

export function resolveAvailableLocalization<TFields>(
  versions: readonly LocalizationVersion<TFields>[],
  primary: ContentLanguageTag,
  secondary = "",
  defaultLanguage: ContentLanguageTag = "en-US",
) {
  for (const candidate of contentLanguageCandidates(primary, secondary, defaultLanguage)) {
    const version = findLocalizationVersion(versions, candidate);
    if (version) return version;
  }
  return undefined;
}

export function canEditLocalization<TFields>(
  version: LocalizationVersion<TFields> | undefined,
  locale: ContentLanguageTag,
) {
  return Boolean(toEditableContentLanguage(locale)) && (version?.editable ?? true);
}

export function localizedCatalogResourceName(
  resource: Pick<CatalogResourceRef, "id" | "names" | "resolvedName">,
  primary: ContentLanguageTag,
  secondary = "",
  defaultLanguage: ContentLanguageTag = "en-US",
) {
  if (resource.resolvedName?.trim()) return resource.resolvedName.trim();
  const values = new Map<string, string>();
  for (const [locale, value] of Object.entries(resource.names ?? {})) {
    if (!value.trim()) continue;
    values.set(locale.toLowerCase(), value);
    const normalized = normalizeContentLanguage(locale);
    if (normalized) values.set(normalized.toLowerCase(), value);
  }

  for (const candidate of contentLanguageCandidates(primary, secondary, defaultLanguage)) {
    for (const alias of contentLanguageAliases(candidate)) {
      const value = values.get(alias.toLowerCase());
      if (value) return value;
    }
  }
  return resource.id;
}

export function contentLanguageAliases(value: ContentLanguageTag) {
  const editable = toEditableContentLanguage(value);
  const normalized = normalizeContentLanguage(value);
  const aliases = editable ? minecraftLocaleAliases[editable] : [normalized];
  return [...new Set([normalized, ...aliases].filter(Boolean))];
}

function comparableLanguageKey(value: ContentLanguageTag) {
  return (toEditableContentLanguage(value) ?? normalizeContentLanguage(value)).toLowerCase();
}
