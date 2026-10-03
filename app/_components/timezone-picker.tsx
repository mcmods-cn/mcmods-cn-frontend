"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supportedTimezones, timezoneDisplayName, timezoneLabel, timezoneOffsetLabel, timezoneSearchText } from "../_lib/timezones";
import { useI18n } from "../_lib/i18n-provider";

export function TimezonePicker({
  value,
  onChange,
  disabled = false,
  className = "",
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  return <div className={className}>
    <button className="field focus-ring flex min-h-11 w-full items-center justify-between gap-3 text-left" disabled={disabled} type="button" onClick={() => setOpen(true)}>
      <span className="min-w-0 truncate">{value ? timezoneLabel(value, locale) : t("timezonePicker.select")}</span>
      <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">…</span>
    </button>
    <TimezonePickerDialog
      open={open}
      title={title}
      value={value}
      onClose={() => setOpen(false)}
      onConfirm={(timezone) => {
        onChange(timezone);
        setOpen(false);
      }}
    />
  </div>;
}

function TimezonePickerDialog({
  open,
  value,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <OpenTimezonePickerDialog title={title} value={value} onClose={onClose} onConfirm={onConfirm} />,
    document.body,
  );
}

function OpenTimezonePickerDialog({
  value,
  title,
  onClose,
  onConfirm,
}: Omit<Parameters<typeof TimezonePickerDialog>[0], "open">) {
  const { locale, t } = useI18n();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selected, setSelected] = useState(value || "Asia/Shanghai");
  const now = useMemo(() => new Date(), []);
  const options = useMemo(() => supportedTimezones(value ? [value] : []).map((timezone) => ({
    timezone,
    name: timezoneDisplayName(timezone, locale, now),
    offset: timezoneOffsetLabel(timezone, locale, now),
    searchText: timezoneSearchText(timezone, locale, now),
  })), [locale, now, value]);
  const filteredOptions = useMemo(() => {
    const query = submittedSearch.trim().toLocaleLowerCase();
    return query ? options.filter((option) => option.searchText.includes(query)) : options;
  }, [options, submittedSearch]);

  function detectTimezone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setSelected(detected);
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-3 sm:p-6" role="presentation" onMouseDown={onClose}>
    <section aria-modal="true" className="surface flex h-[min(780px,92dvh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--line)] shadow-2xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="border-b border-[var(--line)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{title ?? t("timezonePicker.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("timezonePicker.description")}</p>
          </div>
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
        </div>
        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(search.trim());
        }}>
          <input autoFocus className="field" placeholder={t("timezonePicker.search")} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="button-primary focus-ring" type="submit">{t("common.search")}</button>
          <button className="button-secondary focus-ring" type="button" onClick={detectTimezone}>{t("timezonePicker.detect")}</button>
        </form>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {filteredOptions.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOptions.map((option) => {
            const active = option.timezone === selected;
            return <button aria-pressed={active} className={`focus-ring flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} key={option.timezone} type="button" onClick={() => setSelected(option.timezone)}>
              <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--line)]"}`}>{active ? "✓" : ""}</span>
              <span className="min-w-0">
                <strong className="block truncate">{option.name}</strong>
                <small className="mt-0.5 block truncate text-[var(--muted)]">{option.offset} · {option.timezone}</small>
              </span>
            </button>;
          })}
        </div> : <p className="grid min-h-52 place-items-center rounded-lg border border-dashed border-[var(--line)] text-sm font-bold text-[var(--muted)]">{t("timezonePicker.empty")}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
        <span className="min-w-0 truncate text-sm font-bold text-[var(--muted)]">{timezoneLabel(selected, locale, now)}</span>
        <button className="button-primary focus-ring" type="button" onClick={() => onConfirm(selected)}>{t("common.confirm")}</button>
      </footer>
    </section>
  </div>;
}
