"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCatalogResources, catalogResourceIconURL } from "../_lib/editor-api";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { ResourcePickerDialog } from "./editor/resource-picker-dialog";
import { CatalogResourceIcon } from "./editor/selected-resource-list";

const catalogIconPrefix = "catalog:";
const resourceCache = new Map<string, Promise<CatalogResourceRef | null>>();
type CatalogIconReference = { publicId?: string; identifier?: string };

export function CatalogResourceIconPicker({
  fallbackName,
  token,
  value,
  onChange,
}: {
  fallbackName: string;
  token: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => {
    const reference = catalogIconReference(value);
    return reference ? [{ ...placeholderResource(reference, fallbackName, locale), unresolved: true }] : [];
  }, [fallbackName, locale, value]);

  return <>
    <div className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-2">
      <CatalogResourceIconValue className="h-11 w-11" fallbackName={fallbackName} value={value} />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{fallbackName || t("admin.community.iconPickerTitle")}</strong>
        <code className="block truncate text-xs text-[var(--muted)]">{value || t("resourceEditor.unset")}</code>
      </div>
      {value ? <button className="button-secondary focus-ring shrink-0 px-3 py-2 text-sm" type="button" onClick={() => onChange("")}>{t("common.clear")}</button> : null}
      <button className="button-secondary focus-ring shrink-0 px-3 py-2 text-sm" type="button" onClick={() => setOpen(true)}>{t("common.select")}</button>
    </div>
    <ResourcePickerDialog
      allowUnresolved
      initialKind="minecraft.item"
      multiple={false}
      open={open}
      token={token}
      unresolvedKind="minecraft.item"
      unresolvedRegistry="items"
      value={selected}
      labels={{
        title: t("admin.community.iconPickerTitle"),
        description: t("admin.community.iconPickerDescription"),
        searchPlaceholder: t("admin.community.iconPickerSearch"),
        empty: t("admin.community.iconPickerEmpty"),
        selected: t("admin.community.iconPickerSelected"),
        notFound: t("resourceEditor.referencePicker.resourceNotFound"),
        manualPrompt: t("resourceEditor.referencePicker.resourcePrompt"),
        manualPlaceholder: "namespace:item_id",
        insert: t("common.confirm"),
      }}
      onClose={() => setOpen(false)}
      onConfirm={(resources) => {
        const resource = resources[0];
        onChange(resource ? (resource.unresolved ? resource.rawIdentifier || resource.id : `${catalogIconPrefix}${resource.publicId}`) : "");
        setOpen(false);
      }}
    />
  </>;
}

export function CatalogResourceIconValue({
  className = "h-12 w-12",
  fallbackName,
  value,
}: {
  className?: string;
  fallbackName: string;
  value: string;
}) {
  const { locale } = useI18n();
  const reference = catalogIconReference(value);
  if (reference) {
    const referenceKey = reference.publicId || reference.identifier || "";
    return <ResolvedCatalogResourceIcon className={className} fallbackName={fallbackName} key={`${referenceKey}\u0000${locale}\u0000${fallbackName}`} locale={locale} reference={reference} />;
  }
  const source = catalogResourceIconURL(value);
  if (source) return <span aria-label="" className={`block shrink-0 rounded-md bg-contain bg-center bg-no-repeat ${className}`} role="img" style={{ backgroundImage: `url(${JSON.stringify(source)})` }} />;
  const fallback = Array.from(value || fallbackName).slice(0, 2).join("").toLocaleUpperCase() || "?";
  return <span className={`grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)] ${className}`}>{fallback}</span>;
}

function ResolvedCatalogResourceIcon({
  className,
  fallbackName,
  locale,
  reference,
}: {
  className: string;
  fallbackName: string;
  locale: string;
  reference: CatalogIconReference;
}) {
  const [resource, setResource] = useState<CatalogResourceRef>(() => placeholderResource(reference, fallbackName, locale));

  useEffect(() => {
    let cancelled = false;
    void resolveCatalogResource(reference, locale).then((resolved) => {
      if (cancelled) return;
      setResource(resolved ?? { ...placeholderResource(reference, fallbackName, locale), unresolved: true });
    }).catch(() => {
      // Keep the readable placeholder during transient backend failures.
    });
    return () => { cancelled = true; };
  }, [fallbackName, locale, reference]);

  return <CatalogResourceIcon className={className} resource={resource} />;
}

function catalogIconReference(value: string): CatalogIconReference | null {
  const candidate = value.trim();
  if (candidate.toLowerCase().startsWith(catalogIconPrefix)) {
    const publicId = candidate.slice(catalogIconPrefix.length).trim().toLowerCase();
    return publicId ? { publicId } : null;
  }
  return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i.test(candidate) ? { identifier: candidate.toLowerCase() } : null;
}

function placeholderResource(reference: CatalogIconReference, name: string, locale: string): CatalogResourceRef {
  const identifier = reference.identifier || reference.publicId || "";
  return {
    publicId: reference.publicId || `unresolved:minecraft.item:${identifier}`,
    id: identifier,
    registry: reference.identifier?.split(":", 1)[0] || "",
    kind: "minecraft.item",
    names: name ? { [locale]: name } : {},
    resolvedName: name,
    rawIdentifier: identifier,
  };
}

function resolveCatalogResource(reference: CatalogIconReference, locale: string) {
  const query = reference.publicId || reference.identifier || "";
  const key = `${query}\u0000${locale}`;
  let request = resourceCache.get(key);
  if (!request) {
    request = loadCatalogResources({ query, locale, limit: 40, offset: 0 })
      .then((page) => page.items.find((resource) => reference.publicId
        ? resource.publicId.toLowerCase() === reference.publicId
        : resource.id.toLowerCase() === reference.identifier) ?? null)
      .catch((reason) => {
        resourceCache.delete(key);
        throw reason;
      });
    resourceCache.set(key, request);
  }
  return request;
}
