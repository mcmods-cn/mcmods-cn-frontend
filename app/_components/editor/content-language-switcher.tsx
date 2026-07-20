"use client";

import { findLocalizationVersion, toEditableContentLanguage } from "../../_lib/content-language";
import type { LocalizationVersion } from "../../_lib/editor-types";
import { supportedLocales, type Locale, useI18n } from "../../_lib/i18n-provider";
import { LocalizationStatusBadge, type LocalizationStatusLabels } from "./localization-status-badge";

export function ContentLanguageSwitcher<TFields>({
  value,
  versions,
  onChange,
  disabled = false,
  labels = {},
}: {
  value: Locale;
  versions: readonly LocalizationVersion<TFields>[];
  onChange: (locale: Locale) => void;
  disabled?: boolean;
  labels?: LocalizationStatusLabels & { title?: string; unavailable?: string };
}) {
  const { t } = useI18n();
  const selectedVersion = findLocalizationVersion(versions, value);

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
          className={`focus-ring rounded-md border px-3 py-2 text-left text-sm font-bold transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel-subtle)] hover:border-[var(--accent)]"}`}
          disabled={disabled || unavailable}
          key={item.code}
          role="tab"
          title={unavailable ? labels.unavailable : undefined}
          type="button"
          onClick={() => onChange(item.code)}
        >
          <span className="block">{item.label}</span>
          {version?.provenance === "ai" ? <small className="mt-0.5 block font-black opacity-70">AI</small> : null}
          {version?.provenance === "human_corrected" ? <small className="mt-0.5 block font-black opacity-70">{labels.humanCorrected ?? `${t("common.edit")} ✓`}</small> : null}
        </button>;
      })}
    </div>
  </section>;
}
