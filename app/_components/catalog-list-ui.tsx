"use client";

import { useState } from "react";
import { type CatalogSortDirection, type CatalogSortField } from "../_lib/catalog-sort";
import { useI18n } from "../_lib/i18n-provider";

type CatalogFilterPanelProps = {
  title: string;
  clearLabel: string;
  closeLabel: string;
  children: React.ReactNode;
  showResultsLabel?: string;
  onClear: () => void;
  onClose?: () => void;
  onShowResults?: () => void;
};

type CatalogPaginationLabels = {
  previous: string;
  next: string;
  pageSize: string;
  pageSummary: string;
  itemSummary: string;
};

export function CatalogPageFallback() {
  return <main className="min-h-screen bg-[var(--background)]" />;
}

export function CatalogSortControl({
  field,
  direction,
  fields,
  onFieldChange,
  onDirectionChange,
  className = "",
}: {
  field: CatalogSortField;
  direction: CatalogSortDirection;
  fields: readonly CatalogSortField[];
  onFieldChange: (field: CatalogSortField) => void;
  onDirectionChange: (direction: CatalogSortDirection) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <label className="min-w-36 flex-1 sm:flex-none">
        <span className="sr-only">{t("catalogSort.fieldLabel")}</span>
        <select
          aria-label={t("catalogSort.fieldLabel")}
          className="field h-10 py-0"
          value={field}
          onChange={(event) => onFieldChange(event.target.value as CatalogSortField)}
        >
          {fields.map((item) => <option key={item} value={item}>{t(`catalogSort.fields.${item}`)}</option>)}
        </select>
      </label>
      <label className="min-w-28 flex-1 sm:flex-none">
        <span className="sr-only">{t("catalogSort.directionLabel")}</span>
        <select
          aria-label={t("catalogSort.directionLabel")}
          className="field h-10 py-0"
          value={direction}
          onChange={(event) => onDirectionChange(event.target.value as CatalogSortDirection)}
        >
          {(["desc", "asc"] as const).map((item) => <option key={item} value={item}>{t(`catalogSort.directions.${item}`)}</option>)}
        </select>
      </label>
    </div>
  );
}

export function CatalogHero({
  kicker,
  title,
  total,
  description,
  actions,
  children,
}: {
  kicker: React.ReactNode;
  title: React.ReactNode;
  total?: React.ReactNode;
  description: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--line)] bg-[var(--panel)]">
      <div className="mx-auto max-w-7xl px-4 py-7 lg:py-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--accent)]">{kicker}</p>
            <h1 className="mt-1 text-3xl font-black md:text-4xl">{title}</h1>
            {total ? <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{total}</p> : null}
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}

export function CatalogFilterSidebar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        {children}
      </div>
    </aside>
  );
}

export function CatalogMobileFilterDrawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/45" aria-label={title} type="button" onClick={onClose} />
      <aside className="relative h-full w-[min(90vw,360px)] overflow-y-auto bg-[var(--panel)] shadow-2xl">
        {children}
      </aside>
    </div>
  );
}

export function CatalogFilterPanel({
  title,
  clearLabel,
  closeLabel,
  children,
  showResultsLabel,
  onClear,
  onClose,
  onShowResults,
}: CatalogFilterPanelProps) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <h2 className="font-black">{title}</h2>
        <div className="flex items-center gap-2">
          <button className="text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={onClear}>{clearLabel}</button>
          {onClose ? <button className="button-secondary focus-ring px-2 py-1 text-xs" type="button" onClick={onClose}>{closeLabel}</button> : null}
        </div>
      </div>
      {children}
      {showResultsLabel && onShowResults ? (
        <div className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--panel)] p-4">
          <button className="button-primary focus-ring w-full" type="button" onClick={onShowResults}>{showResultsLabel}</button>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogFilterGroup({
  group,
  label,
  expanded,
  defaultExpanded = true,
  children,
  onToggle,
}: {
  group?: string;
  label: string;
  expanded?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  onToggle?: (group: string, open: boolean) => void;
}) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const open = expanded ?? uncontrolledExpanded;
  return (
    <details
      className="group border-b border-[var(--line)]"
      open={open}
      onToggle={(event) => {
        if (expanded === undefined) setUncontrolledExpanded(event.currentTarget.open);
        if (group && onToggle) onToggle(group, event.currentTarget.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-black hover:bg-[var(--panel-subtle)]">
        {label}
        <span className="text-[var(--muted)] group-open:hidden" aria-hidden="true">+</span>
        <span className="hidden text-[var(--muted)] group-open:inline" aria-hidden="true">−</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function CatalogEmptyState({
  title,
  description,
  clearLabel,
  onClear,
}: {
  title: string;
  description: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="mt-4 border-y border-[var(--line)] py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[var(--panel-subtle)] text-2xl font-black text-[var(--muted)]" aria-hidden="true">0</div>
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{description}</p>
      <button className="button-primary focus-ring mt-5" type="button" onClick={onClear}>{clearLabel}</button>
    </div>
  );
}

export function CatalogOptionList<T extends string>({
  options,
  selected,
  label,
  count,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly string[];
  label: (value: T) => string;
  count?: (value: T) => number;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="grid gap-1">
      {options.map((option) => (
        <label key={option} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--panel-subtle)]">
          <input className="h-4 w-4 shrink-0 accent-[var(--accent)]" type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
          <span className="min-w-0 flex-1">{label(option)}</span>
          {count ? <span className="text-xs tabular-nums text-[var(--muted)]">{count(option)}</span> : null}
        </label>
      ))}
    </div>
  );
}

export function CatalogRadioList<T extends string>({
  options,
  selected,
  label,
  onChange,
}: {
  options: readonly T[];
  selected: string;
  label: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1">
      {options.map((option) => (
        <label key={option} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--panel-subtle)]">
          <input className="h-4 w-4 accent-[var(--accent)]" type="radio" checked={selected === option} onChange={() => onChange(option)} />
          <span>{label(option)}</span>
        </label>
      ))}
    </div>
  );
}

export function CatalogPagination({
  currentPage,
  totalPages,
  pageSize,
  labels,
  pageSizes = [20, 40, 60],
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  labels: CatalogPaginationLabels;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = paginationPages(currentPage, totalPages);
  return (
    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1">
          <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={currentPage <= 1} type="button" onClick={() => onPageChange(currentPage - 1)}>{labels.previous}</button>
          {pages.map((page, index) => page === "ellipsis"
            ? <span key={`ellipsis-${index}`} className="px-2 text-[var(--muted)]">…</span>
            : <button key={page} className={`focus-ring h-9 min-w-9 rounded-md border px-2 text-sm font-bold ${page === currentPage ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)]"}`} type="button" onClick={() => onPageChange(page)}>{page}</button>)}
          <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={currentPage >= totalPages} type="button" onClick={() => onPageChange(currentPage + 1)}>{labels.next}</button>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
          {labels.pageSize}
          <select
            aria-label={labels.pageSize}
            className="field catalog-page-size-select tabular-nums"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-semibold text-[var(--muted)]">
        <span>{labels.pageSummary}</span>
        <span>{labels.itemSummary}</span>
      </div>
    </div>
  );
}

function paginationPages(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page > 0 && page <= total).sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}
