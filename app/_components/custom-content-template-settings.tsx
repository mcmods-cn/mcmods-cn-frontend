"use client";

import { useRef, useState } from "react";
import {
  type ModContentLocalization,
  type ModContentMutationResult,
  type ModContentTemplate,
  updateModContentTemplate,
} from "../_lib/mod-content-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";

export function CustomContentTemplateSettings({
  siteId,
  template,
  token,
  onSaved,
}: {
  siteId: string;
  template: ModContentTemplate;
  token: string;
  onSaved: (result: ModContentMutationResult) => void | Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [savedResult, setSavedResult] = useState<ModContentMutationResult>();
  const [error, setError] = useState("");
  const [activeLocale, setActiveLocale] = useState<string>(locale);
  const [defaultLocale, setDefaultLocale] = useState(template.defaultLocale);
  const [localizations, setLocalizations] = useState<ModContentLocalization[]>(() => editableLocalizations(template));
  const value = localizations.find((item) => item.locale === activeLocale) || emptyLocalization(activeLocale);
  const defaultNameAvailable = Boolean(localizations.find((item) => item.locale === defaultLocale)?.name.trim());

  function updateLocalization(patch: Partial<ModContentLocalization>) {
    const next = { ...value, ...patch };
    setLocalizations((items) => items.some((item) => item.locale === activeLocale)
      ? items.map((item) => item.locale === activeLocale ? next : item)
      : [...items, next]);
  }

  function resetAndClose() {
    if (busy) return;
    setActiveLocale(locale);
    setDefaultLocale(template.defaultLocale);
    setLocalizations(editableLocalizations(template));
    setError("");
    setOpen(false);
  }

  function openSettings() {
    setActiveLocale(locale);
    setDefaultLocale(template.defaultLocale);
    setLocalizations(editableLocalizations(template));
    setError("");
    setOpen(true);
  }

  async function save() {
    if (!token || inFlight.current || (!savedResult && !defaultNameAvailable)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = savedResult ?? await updateModContentTemplate(siteId, template.publicId, {
        code: template.code,
        defaultLocale,
        defaultDisplayMode: template.defaultDisplayMode,
        definition: template.definition,
        localizations: localizations.filter((item) => item.name.trim() || item.summary.trim() || item.contentMarkdown.trim()),
        reason: t("modContent.templateSettings.reason"),
        baseRevisionId: template.publishedRevisionId,
      }, token);
      setSavedResult(result);
      await onSaved(result);
      setSavedResult(undefined);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <>
    <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={openSettings}>
      {t("modContent.templateSettings.action")}
    </button>
    {open ? <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={resetAndClose}>
      <section aria-modal="true" className="surface max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] p-5 shadow-2xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{t("modContent.templateSettings.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.templateSettings.hint")}</p>
          </div>
          <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={resetAndClose}>{t("common.close")}</button>
        </header>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm font-bold">
            <span>{t("modContent.templateSettings.editingLocale")}</span>
            <select className="field" disabled={busy || !!savedResult} value={activeLocale} onChange={(event) => setActiveLocale(event.target.value)}>
              {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>{t("modContent.localizedName")}</span>
            <input className="field" disabled={busy || !!savedResult} value={value.name} onChange={(event) => updateLocalization({ name: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>{t("modContent.localizedDescription")}</span>
            <textarea className="field min-h-28" disabled={busy || !!savedResult} value={value.summary} onChange={(event) => updateLocalization({ summary: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>{t("modContent.versionEditor.defaultLocale")}</span>
            <select className="field" disabled={busy || !!savedResult} value={defaultLocale} onChange={(event) => setDefaultLocale(event.target.value)}>
              {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          {!defaultNameAvailable ? <p className="text-sm font-bold text-[var(--red)]">{t("modContent.templateSettings.defaultNameRequired")}</p> : null}
          {savedResult ? <p role="status">{t(savedResult.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved")}</p> : null}
          {error ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
            <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={resetAndClose}>{t("common.cancel")}</button>
            <button className="button-primary focus-ring" disabled={busy || (!savedResult && !defaultNameAvailable)} type="button" onClick={() => void save()}>{savedResult ? t("common.refresh") : t(busy ? "common.saving" : "common.save")}</button>
          </div>
        </div>
      </section>
    </div> : null}
  </>;
}

function editableLocalizations(template: ModContentTemplate) {
  return template.localizations.length
    ? template.localizations.map((item) => ({ ...item }))
    : [emptyLocalization(template.defaultLocale)];
}

function emptyLocalization(locale: string): ModContentLocalization {
  return { locale, name: "", summary: "", contentMarkdown: "" };
}
