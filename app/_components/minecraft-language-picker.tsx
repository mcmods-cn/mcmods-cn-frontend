"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  findMinecraftLanguage,
  minecraftLanguageLabel,
  minecraftLanguages,
  normalizeMinecraftLanguageCode,
} from "../_lib/minecraft-languages";
import { useI18n } from "../_lib/i18n-provider";

type MinecraftLanguagePickerProps = {
  values: readonly string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  maxSelections?: number;
  optionCodes?: readonly string[];
};

export function MinecraftLanguagePicker({
  values,
  onChange,
  multiple = true,
  disabled = false,
  className = "",
  title,
  emptyLabel,
  allowEmpty = false,
  maxSelections,
  optionCodes,
}: MinecraftLanguagePickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const normalizedValues = uniqueLanguageCodes(values);
  const summary = normalizedValues.length
    ? normalizedValues.map(minecraftLanguageLabel).join(" · ")
    : emptyLabel ?? t("minecraftLanguagePicker.select");

  return <div className={`min-w-0 ${className}`}>
    <button
      className="field focus-ring flex min-h-11 w-full items-center justify-between gap-3 text-left"
      disabled={disabled}
      type="button"
      onClick={() => setOpen(true)}
    >
      <span className="min-w-0 truncate">{summary}</span>
      <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">…</span>
    </button>
    {multiple && normalizedValues.length ? <SelectedLanguages
      values={normalizedValues}
      onRemove={disabled ? undefined : (code) => onChange(normalizedValues.filter((value) => value !== code))}
    /> : null}
    <MinecraftLanguagePickerDialog
      allowEmpty={allowEmpty}
      maxSelections={maxSelections}
      multiple={multiple}
      optionCodes={optionCodes}
      open={open}
      title={title}
      values={normalizedValues}
      onClose={() => setOpen(false)}
      onConfirm={(next) => {
        onChange(next);
        setOpen(false);
      }}
    />
  </div>;
}

function MinecraftLanguagePickerDialog({
  open,
  values,
  multiple,
  title,
  allowEmpty,
  maxSelections,
  optionCodes,
  onClose,
  onConfirm,
}: {
  open: boolean;
  values: readonly string[];
  multiple: boolean;
  title?: string;
  allowEmpty: boolean;
  maxSelections?: number;
  optionCodes?: readonly string[];
  onClose: () => void;
  onConfirm: (values: string[]) => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <OpenMinecraftLanguagePickerDialog
      allowEmpty={allowEmpty}
      maxSelections={maxSelections}
      multiple={multiple}
      optionCodes={optionCodes}
      title={title}
      values={values}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
    document.body,
  );
}

function OpenMinecraftLanguagePickerDialog({
  values,
  multiple,
  title,
  allowEmpty,
  maxSelections,
  optionCodes,
  onClose,
  onConfirm,
}: Omit<Parameters<typeof MinecraftLanguagePickerDialog>[0], "open">) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selected, setSelected] = useState(() => uniqueLanguageCodes(values));
  const availableLanguages = useMemo(() => {
    if (!optionCodes) return minecraftLanguages;
    const allowed = new Set(optionCodes.map((code) => normalizeMinecraftLanguageCode(code).toLowerCase()));
    return minecraftLanguages.filter((language) => allowed.has(language.code.toLowerCase()));
  }, [optionCodes]);
  const filteredLanguages = useMemo(() => {
    const query = submittedSearch.trim().toLocaleLowerCase();
    return query
      ? availableLanguages.filter((language) => language.searchText.includes(query))
      : availableLanguages;
  }, [availableLanguages, submittedSearch]);
  const selectionLimitReached = Boolean(multiple && maxSelections && selected.length >= maxSelections);

  function toggle(code: string) {
    setSelected((current) => {
      if (current.includes(code)) return current.filter((value) => value !== code);
      if (!multiple) return [code];
      if (maxSelections && current.length >= maxSelections) return current;
      return [...current, code];
    });
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-3 sm:p-6" role="presentation" onMouseDown={onClose}>
    <section
      aria-modal="true"
      className="surface flex h-[min(780px,92dvh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--line)] shadow-2xl"
      role="dialog"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="border-b border-[var(--line)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{title ?? t("minecraftLanguagePicker.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t(multiple ? "minecraftLanguagePicker.multipleHint" : "minecraftLanguagePicker.singleHint", { count: availableLanguages.length })}
            </p>
          </div>
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
        </div>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedSearch(search.trim());
          }}
        >
          <input
            autoFocus
            className="field"
            placeholder={t("minecraftLanguagePicker.search")}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="button-primary focus-ring" type="submit">{t("common.search")}</button>
        </form>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {filteredLanguages.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLanguages.map((language) => {
            const active = selected.includes(language.code);
            const disabled = !active && selectionLimitReached;
            return <button
              aria-pressed={active}
              className={`focus-ring flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`}
              disabled={disabled}
              key={language.minecraftCode}
              type="button"
              onClick={() => toggle(language.code)}
            >
              <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center border text-xs font-black ${multiple ? "rounded" : "rounded-full"} ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--line)]"}`}>{active ? "✓" : ""}</span>
              <span className="min-w-0 font-bold">{language.label}</span>
            </button>;
          })}
        </div> : <p className="grid min-h-52 place-items-center rounded-lg border border-dashed border-[var(--line)] text-sm font-bold text-[var(--muted)]">{t("minecraftLanguagePicker.empty")}</p>}
      </div>

      <div className="border-t border-[var(--line)] px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--muted)]">
          <span>{t("minecraftLanguagePicker.selected", { count: selected.length })}</span>
          {maxSelections ? <span>{t("minecraftLanguagePicker.maximum", { count: maxSelections })}</span> : null}
        </div>
        {selected.length ? <SelectedLanguages values={selected} onRemove={toggle} /> : <p className="text-sm text-[var(--muted)]">{t("minecraftLanguagePicker.noneSelected")}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
        <div>
          {allowEmpty ? <button className="button-secondary focus-ring" type="button" onClick={() => setSelected([])}>{t("minecraftLanguagePicker.clear")}</button> : null}
        </div>
        <button className="button-primary focus-ring" disabled={!allowEmpty && selected.length === 0} type="button" onClick={() => onConfirm(selected)}>{t("common.confirm")}</button>
      </footer>
    </section>
  </div>;
}

function SelectedLanguages({ values, onRemove }: { values: readonly string[]; onRemove?: (code: string) => void }) {
  return <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
    {values.map((code) => <button
      className="focus-ring shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-1.5 text-sm font-bold"
      disabled={!onRemove}
      key={code}
      title={minecraftLanguageLabel(code)}
      type="button"
      onClick={() => onRemove?.(code)}
    >
      {minecraftLanguageLabel(code)}{onRemove ? <span aria-hidden="true" className="ml-2 text-[var(--muted)]">×</span> : null}
    </button>)}
  </div>;
}

function uniqueLanguageCodes(values: readonly string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const code = findMinecraftLanguage(value)?.code ?? normalizeMinecraftLanguageCode(value);
    const key = code.toLowerCase();
    if (!code || seen.has(key)) continue;
    seen.add(key);
    result.push(code);
  }
  return result;
}
