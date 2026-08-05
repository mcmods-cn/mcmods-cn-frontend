"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { localizedCatalogResourceName } from "../../_lib/content-language";
import { loadCatalogResources } from "../../_lib/editor-api";
import type { CatalogResourcePage, CatalogResourceRef, ResourcePageLoader } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";
import { namespaceFromIdentifier } from "../../_lib/catalog-resource-identifiers";
import { CatalogResourceIcon, CatalogResourceIdentity, type SelectedResourceListLabels } from "./selected-resource-list";

type ResourceFilterOption = { value: string; label: string };

export type ResourcePickerLabels = SelectedResourceListLabels & Partial<{
  title: string;
  description: string;
  searchPlaceholder: string;
  kind: string;
  registry: string;
  empty: string;
  selected: string;
  notFound: string;
  manualPrompt: string;
  manualPlaceholder: string;
  addManualInput: string;
  backToResults: string;
  insert: string;
  invalidIdentifier: string;
}>;

type ResourcePickerProps = {
  open: boolean;
  token?: string;
  value: readonly CatalogResourceRef[];
  multiple?: boolean;
  kindOptions?: readonly ResourceFilterOption[];
  registryOptions?: readonly ResourceFilterOption[];
  initialKind?: string;
  initialRegistry?: string;
  unresolvedKind?: string;
  unresolvedRegistry?: string;
  allowUnresolved?: boolean;
  labels?: ResourcePickerLabels;
  loadPage?: ResourcePageLoader;
  validateUnresolved?: (identifier: string) => boolean;
  onClose: () => void;
  onConfirm: (resources: CatalogResourceRef[]) => void;
};

export function ResourcePickerDialog(props: ResourcePickerProps) {
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
  unresolvedKind = "",
  unresolvedRegistry = "",
  allowUnresolved = false,
  labels = {},
  loadPage = loadCatalogResources,
  validateUnresolved = defaultIdentifierValidator,
  onClose,
  onConfirm,
}: Omit<ResourcePickerProps, "open"> & { open?: boolean }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState(initialKind || (kindOptions.length === 1 ? kindOptions[0].value : ""));
  const [registry, setRegistry] = useState(initialRegistry || (registryOptions.length === 1 ? registryOptions[0].value : ""));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CatalogResourcePage>({ items: [], total: 0, limit: 40, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualInputs, setManualInputs] = useState([""]);
  const [selected, setSelected] = useState<Map<string, CatalogResourceRef>>(
    () => new Map(value.map((resource) => [resource.publicId, resource])),
  );
  const pageSize = 40;

  useEffect(() => {
    if (manualMode) return;
    let cancelled = false;
    const controller = new AbortController();
    loadPage({
      query: submittedQuery,
      locale,
      kind,
      registry,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }, token, controller.signal)
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setSelected((current) => resolveSelectedResources(current, next.items));
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
  }, [kind, loadPage, locale, manualMode, page, registry, submittedQuery, token]);

  useEffect(() => {
    const pending = value.filter(needsResourceHydration);
    if (!pending.length) return;
    let cancelled = false;
    const controller = new AbortController();
    void hydrateSelectedResources(pending, loadPage, locale, token, controller.signal).then((resolved) => {
      if (cancelled || !resolved.length) return;
      setSelected((current) => resolveSelectedResources(current, resolved));
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) return;
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadPage, locale, token, value]);

  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const selectedItems = useMemo(() => [...selected.values()], [selected]);
  const invalidManual = manualInputs.some((input) => input.trim() && !validateUnresolved(input.trim()));

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function toggle(resource: CatalogResourceRef) {
    setSelected((current) => {
      if (!multiple) return current.has(resource.publicId) ? new Map() : new Map([[resource.publicId, resource]]);
      const next = new Map(current);
      if (next.has(resource.publicId)) next.delete(resource.publicId);
      else {
        const unresolvedMatch = [...next.entries()].find(([, selectedResource]) =>
          selectedResource.unresolved && selectedResource.id.toLowerCase() === resource.id.toLowerCase());
        if (unresolvedMatch) next.delete(unresolvedMatch[0]);
        next.set(resource.publicId, resource);
      }
      return next;
    });
  }

  function returnFromManualMode() {
    if (invalidManual) return;
    const identifiers = [...new Set(manualInputs.map((item) => item.trim()).filter(Boolean))];
    const manualKind = unresolvedKind || kind || initialKind || kindOptions[0]?.value || "resource";
    const manualRegistry = unresolvedRegistry || registry || initialRegistry || registryOptions[0]?.value || "";
    setSelected((current) => {
      const next = multiple ? new Map(current) : new Map<string, CatalogResourceRef>();
      for (const identifier of identifiers) {
        const publicId = unresolvedPublicID(manualKind, identifier);
        next.set(publicId, {
          publicId,
          id: identifier,
          registry: manualRegistry || namespaceFromIdentifier(identifier),
          kind: manualKind,
          names: {},
          unresolved: true,
          rawIdentifier: identifier,
        });
        if (!multiple) break;
      }
      return next;
    });
    setLoading(true);
    setManualMode(false);
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={onClose}>
    <section aria-modal="true" className="surface flex h-[min(760px,90dvh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg shadow-2xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] p-4">
        <div>
          <h2 className="text-xl font-black">{labels.title ?? t("common.select")}</h2>
          {labels.description ? <p className="mt-1 text-sm text-[var(--muted)]">{labels.description}</p> : null}
        </div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </header>

      {manualMode ? <ManualIdentifierPanel
        inputs={manualInputs}
        invalid={invalidManual}
        labels={labels}
        onChange={setManualInputs}
        onReturn={returnFromManualMode}
      /> : <>
        <form className="grid gap-2 border-b border-[var(--line)] p-4 md:grid-cols-[minmax(0,1fr)_180px_220px_auto]" onSubmit={search}>
          <input className="field" type="search" value={query} placeholder={labels.searchPlaceholder ?? t("common.search")} onChange={(event) => setQuery(event.target.value)} />
          {kindOptions.length ? <select aria-label={labels.kind} className="field" value={kind} onChange={(event) => { setLoading(true); setPage(1); setKind(event.target.value); }}><option value="">{labels.kind ?? t("common.all")}</option>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
          {registryOptions.length ? <select aria-label={labels.registry} className="field" value={registry} onChange={(event) => { setLoading(true); setPage(1); setRegistry(event.target.value); }}><option value="">{labels.registry ?? t("common.all")}</option>{registryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
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

        <div className="border-t border-[var(--line)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-[var(--muted)]">
            <span>{labels.selected ?? t("common.select")}: {selected.size}</span>
            <span>{page} / {pages}</span>
          </div>
          <SelectedIconStrip items={selectedItems} locale={locale} onRemove={toggle} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary focus-ring" disabled={loading || page <= 1} type="button" onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }}>{t("common.previous")}</button>
            <button className="button-secondary focus-ring" disabled={loading || page >= pages} type="button" onClick={() => { setLoading(true); setPage((current) => Math.min(pages, current + 1)); }}>{t("common.next")}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowUnresolved ? <button className="button-secondary focus-ring" type="button" onClick={() => setManualMode(true)}>{labels.notFound ?? "没有我寻找的资源？"}</button> : null}
            <button className="button-primary focus-ring" type="button" onClick={() => onConfirm(selectedItems)}>{labels.insert ?? t("common.confirm")}</button>
          </div>
        </footer>
      </>}
    </section>
  </div>;
}

function ManualIdentifierPanel({
  inputs,
  invalid,
  labels,
  onChange,
  onReturn,
}: {
  inputs: string[];
  invalid: boolean;
  labels: ResourcePickerLabels;
  onChange: (inputs: string[]) => void;
  onReturn: () => void;
}) {
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h3 className="text-lg font-black">{labels.manualPrompt ?? "请在这里填写资源 ID"}</h3>
      <div className="mt-4 grid gap-3">
        {inputs.map((input, index) => <input
          autoFocus={index === 0}
          className="field font-mono"
          key={index}
          placeholder={labels.manualPlaceholder ?? "namespace:identifier"}
          value={input}
          onChange={(event) => onChange(inputs.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
        />)}
      </div>
      {invalid ? <p className="mt-3 text-sm font-bold text-[var(--red)]">{labels.invalidIdentifier ?? "ID 格式无效"}</p> : null}
      <button aria-label={labels.addManualInput ?? "新增输入框"} className="button-secondary focus-ring mt-4 h-11 w-11 rounded-full p-0 text-xl" type="button" onClick={() => onChange([...inputs, ""])}>+</button>
    </div>
    <footer className="flex justify-end border-t border-[var(--line)] p-4">
      <button className="button-primary focus-ring" disabled={invalid} type="button" onClick={onReturn}>{labels.backToResults ?? "返回"}</button>
    </footer>
  </div>;
}

function SelectedIconStrip({
  items,
  locale,
  onRemove,
}: {
  items: CatalogResourceRef[];
  locale: string;
  onRemove: (resource: CatalogResourceRef) => void;
}) {
  if (!items.length) return <div className="h-12 rounded-lg border border-dashed border-[var(--line)]" />;
  return <div className="flex gap-2 overflow-x-auto pb-1">
    {items.map((resource) => {
      const name = resource.unresolved ? resource.rawIdentifier || resource.id : localizedCatalogResourceName(resource, locale);
      const title = resource.unresolved ? name : `${name} · ${resource.source?.name || resource.id}`;
      return <button aria-label={title} className="focus-ring shrink-0 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-1 hover:border-[var(--red)]" key={resource.publicId} title={title} type="button" onClick={() => onRemove(resource)}>
        <CatalogResourceIcon className="h-10 w-10" resource={resource} />
      </button>;
    })}
  </div>;
}

function unresolvedPublicID(kind: string, identifier: string) {
  return `unresolved:${kind.toLowerCase()}:${identifier.toLowerCase()}`;
}

function needsResourceHydration(resource: CatalogResourceRef) {
  return resource.unresolved || (!resource.resolvedName && Object.values(resource.names).every((name) => !name.trim()));
}

async function hydrateSelectedResources(
  resources: readonly CatalogResourceRef[],
  loadPage: ResourcePageLoader,
  locale: string,
  token: string,
  signal: AbortSignal,
) {
  const resolved: CatalogResourceRef[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < resources.length) {
      const resource = resources[cursor++];
      const identifier = resource.rawIdentifier || resource.id || resource.publicId;
      const page = await loadPage({
        query: identifier,
        locale,
        kind: resource.kind === "resource" ? "" : resource.kind,
        registry: resource.registry,
        limit: 40,
        offset: 0,
      }, token, signal);
      const match = page.items.find((candidate) => resourceMatches(candidate, resource));
      if (match) resolved.push(match);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, resources.length) }, () => worker()));
  return resolved;
}

function resolveSelectedResources(current: Map<string, CatalogResourceRef>, candidates: readonly CatalogResourceRef[]) {
  let next: Map<string, CatalogResourceRef> | undefined;
  for (const [key, selectedResource] of current) {
    if (!needsResourceHydration(selectedResource)) continue;
    const match = candidates.find((candidate) => resourceMatches(candidate, selectedResource));
    if (!match) continue;
    next ??= new Map(current);
    next.delete(key);
    next.set(match.publicId, match);
  }
  return next ?? current;
}

function resourceMatches(candidate: CatalogResourceRef, selectedResource: CatalogResourceRef) {
  if (candidate.publicId.toLowerCase() === selectedResource.publicId.toLowerCase()) return true;
  const identifier = (selectedResource.rawIdentifier || selectedResource.id).trim().toLowerCase();
  return identifier !== "" && candidate.id.trim().toLowerCase() === identifier;
}

function defaultIdentifierValidator(identifier: string) {
  return identifier.length <= 255 && /^[A-Za-z0-9_#.-]+(?::[A-Za-z0-9_./#-]+)?$/.test(identifier);
}
