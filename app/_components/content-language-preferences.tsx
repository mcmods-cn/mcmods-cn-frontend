"use client";

import { apiErrorMessage } from "../_lib/api-error.mts";

import { useEffect, useMemo, useState } from "react";
import { loadContentLanguageSettings, saveContentLanguageSettings } from "../_lib/content-language-api";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftLanguagePicker } from "./minecraft-language-picker";

export function ContentLanguagePreferences({ token }: { token: string }) {
  const { t } = useI18n();
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [editableLocales, setEditableLocales] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const primaryIsEditable = useMemo(
    () => editableLocales.some((locale) => locale.toLowerCase() === primary.trim().replaceAll("_", "-").toLowerCase()),
    [editableLocales, primary],
  );
  const secondaryIsEditable = useMemo(
    () => editableLocales.some((locale) => locale.toLowerCase() === secondary.trim().replaceAll("_", "-").toLowerCase()),
    [editableLocales, secondary],
  );

  useEffect(() => {
    let cancelled = false;
    loadContentLanguageSettings(token)
      .then((settings) => {
        if (cancelled) return;
        setPrimary(settings.primaryLocale);
        setSecondary(settings.secondaryLocale);
        setEditableLocales(settings.editableLocales);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(apiErrorMessage(error, t, t("contentLanguage.loadFailed")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t, token]);

  async function save() {
    if (!primary.trim() || !secondary.trim()) {
      setMessage(t("contentLanguage.required"));
      return;
    }
    if (!secondaryIsEditable) {
      setMessage(t("contentLanguage.unsupportedSecondary"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const settings = await saveContentLanguageSettings(primary.trim(), secondary.trim(), token);
      setPrimary(settings.primaryLocale);
      setSecondary(settings.secondaryLocale);
      setEditableLocales(settings.editableLocales);
      setMessage(t("contentLanguage.saved"));
    } catch (error) {
      setMessage(apiErrorMessage(error, t, t("contentLanguage.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-lg border border-[var(--line)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">{t("contentLanguage.title")}</h3>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{t("contentLanguage.description")}</p>
      </div>
      {primary && !loading ? <span className={`rounded-md px-2 py-1 text-xs font-bold ${primaryIsEditable ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
        {t(primaryIsEditable ? "contentLanguage.editablePrimary" : "contentLanguage.translationOnlyPrimary")}
      </span> : null}
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="grid gap-2 text-sm font-semibold">
        <span>{t("contentLanguage.primary")}</span>
        <MinecraftLanguagePicker
          disabled={loading || saving}
          multiple={false}
          title={t("contentLanguage.selectPrimary")}
          values={primary ? [primary] : []}
          onChange={(values) => setPrimary(values[0] ?? "")}
        />
        <small className="font-normal text-[var(--muted)]">{t("contentLanguage.primaryHint")}</small>
      </div>
      <div className="grid gap-2 text-sm font-semibold">
        <span>{t("contentLanguage.secondary")}</span>
        <MinecraftLanguagePicker
          disabled={loading || saving}
          multiple={false}
          optionCodes={editableLocales}
          title={t("contentLanguage.selectSecondary")}
          values={secondary ? [secondary] : []}
          onChange={(values) => setSecondary(values[0] ?? "")}
        />
        <small className="font-normal text-[var(--muted)]">{t("contentLanguage.secondaryHint")}</small>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted)]">{t("contentLanguage.chineseFallbackHint")}</p>
      <button className="button-primary focus-ring" disabled={loading || saving} type="button" onClick={() => void save()}>
        {saving ? t("admin.saving") : t("contentLanguage.save")}
      </button>
    </div>
    {message ? <p className="mt-3 rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm">{message}</p> : null}
  </section>;
}
