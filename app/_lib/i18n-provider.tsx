"use client";

import { readBrowserStorage, writeBrowserStorage } from "./browser-storage.mts";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import en from "../_locales/en-US";
import zhCN from "../_locales/zh-CN";
import zhTW from "../_locales/zh-TW";
import ja from "../_locales/ja";
import fr from "../_locales/fr";
import de from "../_locales/de";
import es from "../_locales/es";
import ru from "../_locales/ru";
import { formatI18nMessage, parseI18nOverrides } from "./i18n-message.mts";
import {
  defaultUILocale,
  readUILocaleCookie,
  resolveUILocaleSyncHint,
  serializeUILocaleCookie,
  supportedUILocales,
  type UILocale,
} from "./ui-locale.mts";

export type Locale = UILocale;
export type TranslationValue = string | { [key: string]: TranslationValue };

const defaultLocale = defaultUILocale;
export const supportedLocales = supportedUILocales;

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

const localeSyncStorageKey = "mcmods-ui-locale-sync";
let localeSyncChangedAt = 0;
const overrideStorageKey = "mcmods-i18n-overrides";
const overrideEditStorageKey = "mcmods-i18n-edit-version";
// In-flight local suggestions must also notice edits that restore the same text.
// The storage fingerprint detects writes in other tabs before an event is delivered.
let overrideEditVersion = 0;

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  setTranslation: (locale: Locale, key: string, value: string) => void;
  setTranslations: (locale: Locale, values: Record<string, string>) => void;
  getTranslationEditVersion: () => string;
  setTranslationsIfUnchanged: (version: string, locale: Locale, values: Record<string, string>) => boolean;
  resetTranslation: (locale: Locale, key: string) => void;
  getTranslation: (locale: Locale, key: string) => string;
  getBaseTranslation: (locale: Locale, key: string) => string;
  getOwnTranslation: (locale: Locale, key: string) => string;
  translationKeys: string[];
} | null>(null);

export function I18nProvider({ children, initialLocale = defaultLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, () => initialLocale);
  const overrideSnapshot = useSyncExternalStore(subscribeLocale, getOverrideSnapshot, () => "{}");
  const overrides = useMemo(() => parseI18nOverrides(overrideSnapshot), [overrideSnapshot]);
  const translationKeys = useMemo(() => flattenKeys(en), []);

  const setLocale = useCallback((nextLocale: Locale) => {
    document.cookie = serializeUILocaleCookie(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = "ltr";
    localeSyncChangedAt = Date.now();
    writeBrowserStorage(localeSyncStorageKey, `${localeSyncChangedAt}:${nextLocale}`);
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

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
    overrideEditVersion += 1;
    writeBrowserStorage(overrideEditStorageKey, crypto.randomUUID());
    const nextOverrides = parseI18nOverrides(readBrowserStorage(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), [key]: value };
    writeBrowserStorage(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const setTranslations = useCallback((nextLocale: Locale, values: Record<string, string>) => {
    overrideEditVersion += 1;
    writeBrowserStorage(overrideEditStorageKey, crypto.randomUUID());
    const nextOverrides = parseI18nOverrides(readBrowserStorage(overrideStorageKey) ?? "{}");
    nextOverrides[nextLocale] = { ...(nextOverrides[nextLocale] ?? {}), ...values };
    writeBrowserStorage(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const getTranslationEditVersion = useCallback(() => `${overrideEditVersion}:${readBrowserStorage(overrideEditStorageKey) ?? ""}:${readBrowserStorage(overrideStorageKey) ?? "{}"}`, []);
  const setTranslationsIfUnchanged = useCallback((version: string, nextLocale: Locale, values: Record<string, string>) => {
    if (version !== getTranslationEditVersion()) return false;
    setTranslations(nextLocale, values);
    return true;
  }, [getTranslationEditVersion, setTranslations]);

  const resetTranslation = useCallback((nextLocale: Locale, key: string) => {
    overrideEditVersion += 1;
    writeBrowserStorage(overrideEditStorageKey, crypto.randomUUID());
    const nextOverrides = parseI18nOverrides(readBrowserStorage(overrideStorageKey) ?? "{}");
    if (nextOverrides[nextLocale]) delete nextOverrides[nextLocale]?.[key];
    writeBrowserStorage(overrideStorageKey, JSON.stringify(nextOverrides));
    window.dispatchEvent(new Event("mcmods-locale-change"));
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => formatI18nMessage(getTranslation(locale, key), params),
    [getTranslation, locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, setTranslation, setTranslations, getTranslationEditVersion, setTranslationsIfUnchanged, resetTranslation, getTranslation, getBaseTranslation, getOwnTranslation, translationKeys }),
    [getBaseTranslation, getOwnTranslation, getTranslation, locale, resetTranslation, setLocale, setTranslation, setTranslations, getTranslationEditVersion, setTranslationsIfUnchanged, t, translationKeys],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

function subscribeLocale(onStoreChange: () => void) {
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === localeSyncStorageKey) {
      const hint = resolveUILocaleSyncHint(event.newValue, readBrowserStorage(localeSyncStorageKey), localeSyncChangedAt);
      if (hint) {
        localeSyncChangedAt = hint.changedAt;
        document.cookie = serializeUILocaleCookie(hint.locale);
      }
    }
    if (event.key === overrideStorageKey || event.key === overrideEditStorageKey || event.key === null) overrideEditVersion += 1;
    onStoreChange();
  };
  window.addEventListener("storage", onStorageChange);
  window.addEventListener("mcmods-locale-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener("mcmods-locale-change", onStoreChange);
  };
}

function getLocaleSnapshot(): Locale {
  return readUILocaleCookie(document.cookie) ?? defaultLocale;
}

function getOverrideSnapshot() {
  return readBrowserStorage(overrideStorageKey) ?? "{}";
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
