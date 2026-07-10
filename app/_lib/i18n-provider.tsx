"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import en from "../_locales/en";
import zhCN from "../_locales/zh-CN";
import zhTW from "../_locales/zh-TW";
import ja from "../_locales/ja";
import fr from "../_locales/fr";
import de from "../_locales/de";
import es from "../_locales/es";
import ru from "../_locales/ru";

export type Locale = "zh-CN" | "zh-TW" | "en" | "ja" | "fr" | "de" | "es" | "ru";
export type LocaleMessages = typeof en;
export type TranslationValue = string | { [key: string]: TranslationValue };

export const defaultLocale: Locale = "zh-CN";
export const supportedLocales: Array<{ code: Locale; label: string }> = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
];

export const dictionaries: Record<Locale, LocaleMessages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en,
  ja,
  fr,
  de,
  es,
  ru,
};

const localeStorageKey = "mcmods-ui-locale";
const overrideStorageKey = "mcmods-i18n-overrides";
type I18nOverrides = Partial<Record<Locale, Record<string, string>>>;

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

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(localeStorageKey, nextLocale);
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
      if (nextLocale !== "en" && value === readMessage(en, key)) return "";
      if (nextLocale !== "zh-CN" && value === readMessage(zhCN, key)) return "";
      return value;
    },
    [overrides],
  );

  const setTranslation = useCallback((nextLocale: Locale, key: string, value: string) => {
    const nextOverrides = parseOverrides(window.localStorage.getItem(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), [key]: value };
    window.localStorage.setItem(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const setTranslations = useCallback((nextLocale: Locale, values: Record<string, string>) => {
    const nextOverrides = parseOverrides(window.localStorage.getItem(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), ...values };
    window.localStorage.setItem(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const resetTranslation = useCallback((nextLocale: Locale, key: string) => {
    const nextOverrides = parseOverrides(window.localStorage.getItem(overrideStorageKey) ?? "{}");
    if (nextOverrides[nextLocale]) delete nextOverrides[nextLocale]?.[key];
    window.localStorage.setItem(overrideStorageKey, JSON.stringify(nextOverrides));
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
  const saved = window.localStorage.getItem(localeStorageKey);
  return supportedLocales.some((locale) => locale.code === saved) ? (saved as Locale) : defaultLocale;
}

function getOverrideSnapshot() {
  return window.localStorage.getItem(overrideStorageKey) ?? "{}";
}

function readMessage(messages: TranslationValue, key: string): string | undefined {
  let current: TranslationValue | undefined = messages;
  for (const segment of key.split(".")) {
    if (!current || typeof current === "string") return undefined;
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
    return JSON.parse(value) as I18nOverrides;
  } catch {
    return {};
  }
}

function formatMessage(message: string, params?: Record<string, string | number>) {
  if (!params) return message;
  return Object.entries(params).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), message);
}
