"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadCatalogResources } from "../../_lib/editor-api";
import type { CatalogResourcePage, CatalogResourceRef } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";
import { CatalogResourceIdentity, type SelectedResourceListLabels } from "./selected-resource-list";

export type ResourceFilterOption = { value: string; label: string };

export type ResourcePickerLabels = SelectedResourceListLabels & Partial<{
  title: string;
  description: string;
  searchPlaceholder: string;
  kind: string;
  registry: string;
  empty: string;
  selected: string;
}>;

export function ResourcePickerDialog(props: {
  open: boolean;
  token?: string;
  value: readonly CatalogResourceRef[];
  multiple?: boolean;
  kindOptions?: readonly ResourceFilterOption[];
  registryOptions?: readonly ResourceFilterOption[];
  initialKind?: string;
  initialRegistry?: string;
  labels?: ResourcePickerLabels;
  onClose: () => void;
  onConfirm: (resources: CatalogResourceRef[]) => void;
}) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<OpenResourcePickerDialog {...props} />, document.body);
}

function OpenResourcePickerDialog({
  token = "",
  value,
  multiple = true,
  kindOptions = [],
  registryOptions = [],
  initialKind = "",
  initialRegistry = "",
  labels = {},
  onClose,
  onConfirm,
}: Omit<Parameters<typeof ResourcePickerDialog>[0], "open"> & { open?: boolean }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState(initialKind || (kindOptions.length === 1 ? kindOptions[0].value : ""));
  const [registry, setRegistry] = useState(initialRegistry || (registryOptions.length === 1 ? registryOptions[0].value : ""));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CatalogResourcePage>({ items: [], total: 0, limit: 40, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Map<string, CatalogResourceRef>>(() => new Map(value.map((resource) => [resource.publicId, resource])));
  const pageSize = 40;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadCatalogResources({ query: submittedQuery, locale, kind, registry, limit: pageSize, offset: (page - 1) * pageSize }, token, controller.signal)
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setError("");
      })
      .catch((reason: unknown) => {
        if (cancelled || reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [kind, locale, page, registry, submittedQuery, token]);

  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const selectedItems = useMemo(() => [...selected.values()], [selected]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function changeKind(next: string) {
    setLoading(true);
    setPage(1);
    setKind(next);
  }

  function changeRegistry(next: string) {
    setLoading(true);
    setPage(1);
    setRegistry(next);
  }

  function toggle(resource: CatalogResourceRef) {
    setSelected((current) => {
      if (!multiple) return current.has(resource.publicId) ? new Map() : new Map([[resource.publicId, resource]]);
      const next = new Map(current);
      if (next.has(resource.publicId)) next.delete(resource.publicId);
      else next.set(resource.publicId, resource);
      return next;
    });
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={onClose}>
    <section aria-modal="true" className="surface flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg shadow-2xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] p-4">
        <div><h2 className="text-xl font-black">{labels.title ?? t("common.select")}</h2>{labels.description ? <p className="mt-1 text-sm text-[var(--muted)]">{labels.description}</p> : null}</div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </header>

      <form className="grid gap-2 border-b border-[var(--line)] p-4 md:grid-cols-[minmax(0,1fr)_180px_220px_auto]" onSubmit={search}>
        <input className="field" type="search" value={query} placeholder={labels.searchPlaceholder ?? t("common.search")} onChange={(event) => setQuery(event.target.value)} />
        {kindOptions.length ? <select aria-label={labels.kind} className="field" value={kind} onChange={(event) => changeKind(event.target.value)}><option value="">{labels.kind ?? t("common.all")}</option>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
        {registryOptions.length ? <select aria-label={labels.registry} className="field" value={registry} onChange={(event) => changeRegistry(event.target.value)}><option value="">{labels.registry ?? t("common.all")}</option>{registryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
        <button className="button-primary focus-ring" type="submit">{t("common.search")}</button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? <p className="mb-3 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{error}</p> : null}
        {loading ? <p className="grid min-h-52 place-items-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
        {!loading && !result.items.length ? <p className="grid min-h-52 place-items-center rounded-lg border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">{labels.empty ?? t("common.search")}</p> : null}
        {!loading && result.items.length ? <div className="grid gap-2 sm:grid-cols-2">
          {result.items.map((resource) => {
            const active = selected.has(resource.publicId);
            return <button aria-pressed={active} className={`focus-ring flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} key={resource.publicId} type="button" onClick={() => toggle(resource)}>
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center border text-xs font-black ${multiple ? "rounded" : "rounded-full"} ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>{active ? "✓" : ""}</span>
              <CatalogResourceIdentity labels={labels} resource={resource} />
            </button>;
          })}
        </div> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
        <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]"><span>{labels.selected ?? t("common.select")}: {selected.size}</span><span>{page} / {pages}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="button-secondary focus-ring" disabled={loading || page <= 1} type="button" onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }}>{t("common.previous")}</button>
          <button className="button-secondary focus-ring" disabled={loading || page >= pages} type="button" onClick={() => { setLoading(true); setPage((current) => Math.min(pages, current + 1)); }}>{t("common.next")}</button>
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button className="button-primary focus-ring" type="button" onClick={() => onConfirm(selectedItems)}>{t("common.confirm")}</button>
        </div>
      </footer>
    </section>
  </div>;
}
