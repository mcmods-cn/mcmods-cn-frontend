"use client";

import { useRef } from "react";
import { findLocalizationVersion, toEditableContentLanguage } from "../../_lib/content-language";
import type { LocalizationVersion } from "../../_lib/editor-types";
import { supportedLocales, type Locale, useI18n } from "../../_lib/i18n-provider";
import { LocalizationStatusBadge, type LocalizationStatusLabels } from "./localization-status-badge";

export function ContentLanguageSwitcher<TFields>({
  value,
  versions,
  onChange,
  panelId,
  disabled = false,
  labels = {},
}: {
  value: Locale;
  versions: readonly LocalizationVersion<TFields>[];
  onChange: (locale: Locale) => void;
  panelId?: string;
  disabled?: boolean;
  labels?: LocalizationStatusLabels & { title?: string; unavailable?: string };
}) {
  const { t } = useI18n();
  const selectedVersion = findLocalizationVersion(versions, value);
  const buttonRefs = useRef(new Map<Locale, HTMLButtonElement>());

  function moveFocus(event: React.KeyboardEvent<HTMLButtonElement>, current: Locale) {
    const locales = supportedLocales
      .map((item) => item.code)
      .filter((code) => {
        const version = findLocalizationVersion(versions, code);
        return Boolean(toEditableContentLanguage(code)) && version?.editable !== false;
      });
    const currentIndex = locales.indexOf(current);
    if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? locales.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + locales.length) % locales.length;
    const next = locales[nextIndex];
    if (!next) return;
    onChange(next);
    buttonRefs.current.get(next)?.focus();
  }

  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3" aria-label={labels.title ?? t("common.language")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-sm">{labels.title ?? t("common.language")}</strong>
      <LocalizationStatusBadge version={selectedVersion as LocalizationVersion<unknown> | undefined} labels={labels} />
    </div>
    <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label={labels.title ?? t("common.language")}>
      {supportedLocales.map((item) => {
        const version = findLocalizationVersion(versions, item.code);
        const editableLocale = toEditableContentLanguage(item.code);
        const unavailable = !editableLocale || version?.editable === false;
        const selected = item.code === value;
        return <button
          aria-selected={selected}
          aria-controls={panelId}
          className={`focus-ring rounded-md border px-3 py-2 text-left text-sm font-bold transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel-subtle)] hover:border-[var(--accent)]"}`}
          disabled={disabled || unavailable}
          key={item.code}
          id={panelId ? contentLanguageTabId(panelId, item.code) : undefined}
          ref={(node) => {
            if (node) buttonRefs.current.set(item.code, node);
            else buttonRefs.current.delete(item.code);
          }}
          role="tab"
          tabIndex={selected ? 0 : -1}
          title={unavailable ? labels.unavailable : undefined}
          type="button"
          onClick={() => onChange(item.code)}
          onKeyDown={(event) => moveFocus(event, item.code)}
        >
          <span className="block">{item.label}</span>
          {version?.provenance === "ai" ? <small className="mt-0.5 block font-black opacity-70">AI</small> : null}
          {version?.provenance === "human_corrected" ? <small className="mt-0.5 block font-black opacity-70">{labels.humanCorrected ?? `${t("common.edit")} ✓`}</small> : null}
        </button>;
      })}
    </div>
  </section>;
}

export function contentLanguageTabId(panelId: string, locale: string) {
  return `${panelId}-tab-${locale.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
