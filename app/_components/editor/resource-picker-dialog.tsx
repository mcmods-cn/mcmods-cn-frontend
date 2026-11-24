"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { unresolvedPublicID, sameResourceIdentity, resolveSelectedResources, needsResourceHydration } from "../../_lib/resource-selection.mts";
import { localizedCatalogResourceName } from "../../_lib/content-language";
import { loadCatalogResourcePresentations, loadCatalogResources } from "../../_lib/editor-api";
import type { CatalogResourcePage, CatalogResourceRef, ResourcePageLoader } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";
import { catalogRegistryForKind } from "../../_lib/catalog-resource-identifiers";
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
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState(initialKind || (kindOptions.length === 1 ? kindOptions[0].value : ""));
  const [registry, setRegistry] = useState(initialRegistry || (registryOptions.length === 1 ? registryOptions[0].value : ""));
  const scope = JSON.stringify([locale, token, submittedQuery, kind, registry]);
  const [pagination, setPagination] = useState({ scope, page: 1, cursors: [""] });
  if (pagination.scope !== scope) setPagination({ scope, page: 1, cursors: [""] });
  const page = pagination.scope === scope ? pagination.page : 1;
  const cursor = pagination.scope === scope ? pagination.cursors[page - 1] ?? "" : "";
  const [attempt, setAttempt] = useState(0);
  const readKey = JSON.stringify([scope, page, cursor, attempt]);
  const [response, setResponse] = useState<{ key: string; result?: CatalogResourcePage; error?: string }>();
  const loading = response?.key !== readKey;
  const error = !loading ? response.error : undefined;
  const result = !loading ? response.result : undefined;
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
      cursor,
    }, token, controller.signal)
      .then((next) => {
        if (cancelled) return;
        setResponse({ key: readKey, result: next });
        setSelected((current) => resolveSelectedResources(current, next.items));
      })
      .catch((reason: unknown) => {
        if (cancelled || reason instanceof DOMException && reason.name === "AbortError") return;
        setResponse({ key: readKey, error: reason instanceof Error ? reason.message : String(reason) });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cursor, kind, loadPage, locale, manualMode, page, readKey, registry, submittedQuery, token]);

  const hydrationScope = JSON.stringify(value.filter(needsResourceHydration).map((resource) => ({
    publicId: resource.publicId,
    id: resource.rawIdentifier || resource.id,
    kind: resource.kind,
    registry: resource.registry,
  })));
  const hydrateSelection = useEffectEvent((controller: AbortController) => {
    const pending = value.filter(needsResourceHydration);
    return loadCatalogResourcePresentations(pending, locale, token, controller.signal);
  });
  useEffect(() => {
    if (hydrationScope === "[]") return;
    let cancelled = false;
    const controller = new AbortController();
    void hydrateSelection(controller).then((resolved) => {
      if (cancelled || !resolved.length) return;
      setSelected((current) => resolveSelectedResources(current, resolved));
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) return;
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hydrationScope, locale, token]);

  const cursorBased = typeof result?.hasMore === "boolean";
  const pages = cursorBased ? page + (result?.hasMore ? 1 : 0) : Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));
  const selectedItems = useMemo(() => [...selected.values()], [selected]);
  const invalidManual = manualInputs.some((input) => input.trim() && !validateUnresolved(input.trim()));

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPagination({ scope, page: 1, cursors: [""] });
    setAttempt(current => current + 1);
    setSubmittedQuery(query.trim());
  }

  function toggle(resource: CatalogResourceRef) {
    setSelected((current) => {
      if (!multiple) return current.has(resource.publicId) ? new Map() : new Map([[resource.publicId, resource]]);
      const next = new Map(current);
      if (next.has(resource.publicId)) next.delete(resource.publicId);
      else {
        const unresolvedMatch = [...next.entries()].find(([, selectedResource]) =>
          selectedResource.unresolved && sameResourceIdentity(selectedResource, resource));
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
    const manualRegistry = unresolvedRegistry || registry || initialRegistry || registryOptions[0]?.value || catalogRegistryForKind(manualKind) || "";
    setSelected((current) => {
      const next = multiple ? new Map(current) : new Map<string, CatalogResourceRef>();
      for (const identifier of identifiers) {
        const publicId = unresolvedPublicID(manualKind, identifier, manualRegistry);
        next.set(publicId, {
          publicId,
          id: identifier,
          registry: manualRegistry,
          kind: manualKind,
          names: {},
          unresolved: true,
          rawIdentifier: identifier,
        });
        if (!multiple) break;
      }
      return next;
    });
    setAttempt(current => current + 1);
    setManualMode(false);
  }

  return <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-5xl rounded-lg border-0 bg-transparent p-0 text-[var(--foreground)] backdrop:bg-black/55" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="surface flex h-[min(760px,90dvh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] p-4">
        <div>
          <h2 id={titleId} className="text-xl font-black">{labels.title ?? t("common.select")}</h2>
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
          <input className="field" type="search" aria-label={labels.searchPlaceholder ?? t("common.search")} value={query} placeholder={labels.searchPlaceholder ?? t("common.search")} onChange={(event) => setQuery(event.target.value)} />
          {kindOptions.length ? <select aria-label={labels.kind} className="field" value={kind} onChange={(event) => { setKind(event.target.value); }}><option value="">{labels.kind ?? t("common.all")}</option>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
          {registryOptions.length ? <select aria-label={labels.registry} className="field" value={registry} onChange={(event) => { setRegistry(event.target.value); }}><option value="">{labels.registry ?? t("common.all")}</option>{registryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
          <button className="button-primary focus-ring" type="submit">{t("common.search")}</button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? <p className="mb-3 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{error} <button className="button-secondary focus-ring ml-2" type="button" onClick={() => setAttempt(current => current + 1)}>{t("common.retry")}</button></p> : null}
          {loading ? <p className="grid min-h-52 place-items-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
          {result && !result.items.length ? <p className="grid min-h-52 place-items-center rounded-lg border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">{labels.empty ?? t("common.search")}</p> : null}
          {result && result.items.length ? <div className="grid gap-2 sm:grid-cols-2">
            {result.items.map((resource) => {
              const active = selected.has(resource.publicId);
              return <button aria-pressed={active} className={`focus-ring flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} key={resource.publicId} type="button" onClick={() => toggle(resource)}>
                <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center border text-xs font-black ${multiple ? "rounded" : "rounded-full"} ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--line)]"}`}>{active ? "✓" : ""}</span>
                <CatalogResourceIdentity labels={labels} resource={resource} />
              </button>;
            })}
          </div> : null}
        </div>

        <div className="border-t border-[var(--line)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-[var(--muted)]">
            <span>{labels.selected ?? t("common.select")}: {selected.size}</span>
            <span>{cursorBased ? page : `${page} / ${pages}`}</span>
          </div>
          <SelectedIconStrip items={selectedItems} locale={locale} onRemove={toggle} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary focus-ring" disabled={loading || page <= 1} type="button" onClick={() => { setPagination({ scope, page: Math.max(1, page - 1), cursors: pagination.cursors }); }}>{t("common.previous")}</button>
            <button className="button-secondary focus-ring" disabled={!result || (cursorBased ? !result.hasMore || !result.nextCursor : page >= pages)} type="button" onClick={() => {
              if (!result) return;
              const cursors = pagination.scope === scope ? pagination.cursors.slice(0, page) : [""];
              if (cursorBased) {
                if (!result.hasMore || !result.nextCursor) return;
                cursors[page] = result.nextCursor;
              }
              setPagination({ scope, page: Math.min(pages, page + 1), cursors });
            }}>{t("common.next")}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowUnresolved ? <button className="button-secondary focus-ring" type="button" onClick={() => setManualMode(true)}>{labels.notFound ?? t("catalogEditor.resourceNotFound")}</button> : null}
            <button className="button-primary focus-ring" type="button" onClick={() => onConfirm(selectedItems)}>{labels.insert ?? t("common.confirm")}</button>
          </div>
        </footer>
      </>}
    </section>
  </dialog>;
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
  const { t } = useI18n();
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h3 className="text-lg font-black">{labels.manualPrompt ?? t("catalogEditor.manualResourcePrompt")}</h3>
      <div className="mt-4 grid gap-3">
        {inputs.map((input, index) => <input
          autoFocus={index === 0}
          aria-label={`${labels.manualPrompt ?? t("catalogEditor.manualResourcePrompt")} ${index + 1}`}
          className="field font-mono"
          key={index}
          placeholder={labels.manualPlaceholder ?? "namespace:identifier"}
          value={input}
          onChange={(event) => onChange(inputs.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
        />)}
      </div>
      {invalid ? <p className="mt-3 text-sm font-bold text-[var(--red)]">{labels.invalidIdentifier ?? t("catalogEditor.invalidIdentifier")}</p> : null}
      <button aria-label={labels.addManualInput ?? t("catalogEditor.addManualInput")} className="button-secondary focus-ring mt-4 h-11 w-11 rounded-full p-0 text-xl" type="button" onClick={() => onChange([...inputs, ""])}>+</button>
    </div>
    <footer className="flex justify-end border-t border-[var(--line)] p-4">
      <button className="button-primary focus-ring" disabled={invalid} type="button" onClick={onReturn}>{labels.backToResults ?? t("common.back")}</button>
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


function defaultIdentifierValidator(identifier: string) {
  return identifier.length <= 255 && /^[A-Za-z0-9_#.-]+(?::[A-Za-z0-9_./#-]+)?$/.test(identifier);
}
