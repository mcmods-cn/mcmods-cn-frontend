"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import en from "../_locales/en-US";
import zhCN from "../_locales/zh-CN";
import zhTW from "../_locales/zh-TW";
import ja from "../_locales/ja";
import fr from "../_locales/fr";
import de from "../_locales/de";
import es from "../_locales/es";
import ru from "../_locales/ru";

export type Locale = "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "fr-FR" | "de-DE" | "es-ES" | "ru-RU";
export type TranslationValue = string | { [key: string]: TranslationValue };

const defaultLocale: Locale = "zh-CN";
export const supportedLocales: Array<{ code: Locale; label: string }> = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en-US", label: "English (US)" },
  { code: "ja-JP", label: "日本語" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "ru-RU", label: "Русский" },
];

const dictionaries: Record<Locale, TranslationValue> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": en,
  "ja-JP": ja,
  "fr-FR": fr,
  "de-DE": de,
  "es-ES": es,
  "ru-RU": ru,
};

const localeStorageKey = "mcmods-ui-locale";
const overrideStorageKey = "mcmods-i18n-overrides";
type I18nOverrides = Partial<Record<Locale, Record<string, string>>>;
const transientStorage = new Map<string, string>();

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  setTranslation: (locale: Locale, key: string, value: string) => void;
  setTranslations: (locale: Locale, values: Record<string, string>) => void;
  resetTranslation: (locale: Locale, key: string) => void;
  getTranslation: (locale: Locale, key: string) => string;
  getBaseTranslation: (locale: Locale, key: string) => string;
  getOwnTranslation: (locale: Locale, key: string) => string;
  translationKeys: string[];
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, () => defaultLocale);
  const overrideSnapshot = useSyncExternalStore(subscribeLocale, getOverrideSnapshot, () => "{}");
  const overrides = useMemo(() => parseOverrides(overrideSnapshot), [overrideSnapshot]);
  const translationKeys = useMemo(() => flattenKeys(en), []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    writeStoredValue(localeStorageKey, nextLocale);
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const getBaseTranslation = useCallback((nextLocale: Locale, key: string) => {
    return readMessage(dictionaries[nextLocale], key) ?? readMessage(en, key) ?? key;
  }, []);

  const getTranslation = useCallback(
    (nextLocale: Locale, key: string) => overrides[nextLocale]?.[key] ?? getBaseTranslation(nextLocale, key),
    [getBaseTranslation, overrides],
  );

  const getOwnTranslation = useCallback(
    (nextLocale: Locale, key: string) => {
      if (typeof overrides[nextLocale]?.[key] === "string") return overrides[nextLocale]?.[key] ?? "";
      const value = readMessage(dictionaries[nextLocale], key);
      if (!value) return "";
      if (nextLocale !== "en-US" && value === readMessage(en, key)) return "";
      if (nextLocale !== "zh-CN" && value === readMessage(zhCN, key)) return "";
      return value;
    },
    [overrides],
  );

  const setTranslation = useCallback((nextLocale: Locale, key: string, value: string) => {
    const nextOverrides = parseOverrides(readStoredValue(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), [key]: value };
    writeStoredValue(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const setTranslations = useCallback((nextLocale: Locale, values: Record<string, string>) => {
    const nextOverrides = parseOverrides(readStoredValue(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), ...values };
    writeStoredValue(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const resetTranslation = useCallback((nextLocale: Locale, key: string) => {
    const nextOverrides = parseOverrides(readStoredValue(overrideStorageKey) ?? "{}");
    if (nextOverrides[nextLocale]) delete nextOverrides[nextLocale]?.[key];
    writeStoredValue(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => formatMessage(getTranslation(locale, key), params),
    [getTranslation, locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, setTranslation, setTranslations, resetTranslation, getTranslation, getBaseTranslation, getOwnTranslation, translationKeys }),
    [getBaseTranslation, getOwnTranslation, getTranslation, locale, resetTranslation, setLocale, setTranslation, setTranslations, t, translationKeys],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

function subscribeLocale(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("mcmods-locale-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("mcmods-locale-change", onStoreChange);
  };
}

function getLocaleSnapshot(): Locale {
  const saved = readStoredValue(localeStorageKey);
  return normalizeUILocale(saved) ?? defaultLocale;
}

function getOverrideSnapshot() {
  return readStoredValue(overrideStorageKey) ?? "{}";
}

function readMessage(messages: TranslationValue, key: string): string | undefined {
  let current: TranslationValue | undefined = messages;
  for (const segment of key.split(".")) {
    if (!current || typeof current === "string" || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function flattenKeys(messages: TranslationValue, prefix = ""): string[] {
  if (typeof messages === "string") return [prefix];
  return Object.entries(messages).flatMap(([key, value]) => flattenKeys(value, prefix ? `${prefix}.${key}` : key));
}

function parseOverrides(value: string): I18nOverrides {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const normalized: I18nOverrides = {};
    for (const [locale, messages] of Object.entries(parsed)) {
      const canonical = normalizeUILocale(locale);
      if (!canonical || !messages || typeof messages !== "object" || Array.isArray(messages)) continue;
      const validMessages = Object.fromEntries(Object.entries(messages).filter((entry): entry is [string, string] => {
        const [key, message] = entry;
        const source = readMessage(en, key);
        return source !== undefined && typeof message === "string" && Boolean(message.trim())
          && hasCompatibleInterpolationParameters(source, message);
      }));
      normalized[canonical] = { ...(normalized[canonical] ?? {}), ...validMessages };
    }
    return normalized;
  } catch {
    return {};
  }
}

export function hasCompatibleInterpolationParameters(source: string, translated: string) {
  return interpolationParameters(source) === interpolationParameters(translated);
}

function interpolationParameters(message: string) {
  return [...new Set(Array.from(message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g), (match) => match[1]))].sort().join(",");
}

function readStoredValue(key: string) {
  if (transientStorage.has(key)) return transientStorage.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return transientStorage.get(key) ?? null;
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    transientStorage.delete(key);
  } catch {
    // Locale changes remain usable for this page when persistence is blocked.
    transientStorage.set(key, value);
  }
}

function normalizeUILocale(value: string | null | undefined): Locale | undefined {
  const normalized = value?.trim().replaceAll("_", "-").toLowerCase();
  const aliases: Record<string, Locale> = {
    "zh": "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN",
    "zh-tw": "zh-TW", "zh-hk": "zh-TW", "zh-hant": "zh-TW",
    "en": "en-US", "en-us": "en-US",
    "ja": "ja-JP", "ja-jp": "ja-JP",
    "fr": "fr-FR", "fr-fr": "fr-FR",
    "de": "de-DE", "de-de": "de-DE",
    "es": "es-ES", "es-es": "es-ES",
    "ru": "ru-RU", "ru-ru": "ru-RU",
  };
  return normalized ? aliases[normalized] : undefined;
}

function formatMessage(message: string, params?: Record<string, string | number>) {
  if (!params) return message;
  return message.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (placeholder, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : placeholder);
}
