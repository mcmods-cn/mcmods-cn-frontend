"use client";

import { catalogResourceIconURL } from "../../_lib/editor-api";
import { localizedCatalogResourceName } from "../../_lib/content-language";
import type { CatalogResourceRef } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";

export type SelectedResourceListLabels = Partial<{
  empty: string;
  remove: string;
  source: string;
}>;

export function SelectedResourceList({
  items,
  onRemove,
  readOnly = false,
  labels = {},
}: {
  items: readonly CatalogResourceRef[];
  onRemove?: (resource: CatalogResourceRef) => void;
  readOnly?: boolean;
  labels?: SelectedResourceListLabels;
}) {
  const { t } = useI18n();
  if (!items.length) {
    return <p className="rounded-lg border border-dashed border-[var(--line)] p-7 text-center text-sm text-[var(--muted)]">{labels.empty ?? t("common.select")}</p>;
  }
  return <div className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    {items.map((resource) => <div className="flex items-center gap-3 p-3" key={resource.publicId}>
      <CatalogResourceIdentity labels={labels} resource={resource} />
      {!readOnly && onRemove ? <button className="button-secondary focus-ring shrink-0 px-3 py-2 text-sm text-[var(--red)]" type="button" onClick={() => onRemove(resource)}>{labels.remove ?? t("common.delete")}</button> : null}
    </div>)}
  </div>;
}

export function CatalogResourceIdentity({
  resource,
  labels = {},
}: {
  resource: CatalogResourceRef;
  labels?: SelectedResourceListLabels;
}) {
  const { locale } = useI18n();
  const name = localizedCatalogResourceName(resource, locale);
  const source = resource.source?.name || resource.source?.siteId || resource.source?.publicId || "";
  return <div className="flex min-w-0 flex-1 items-center gap-3">
    <CatalogResourceIcon resource={resource} />
    <div className="min-w-0 flex-1">
      <strong className="block truncate">{name}</strong>
      <code className="mt-0.5 block truncate text-xs text-[var(--muted)]">{resource.id}</code>
      <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-bold uppercase text-[var(--muted)]">
        <span>{resource.kind}</span>
        <span>{resource.registry}</span>
        {source ? <span>{labels.source ? `${labels.source}: ` : ""}{source}</span> : null}
      </span>
    </div>
  </div>;
}

export function CatalogResourceIcon({ resource, className = "h-11 w-11" }: { resource: CatalogResourceRef; className?: string }) {
  const source = catalogResourceIconURL(resource.iconUrl);
  if (resource.unresolved) return <span className={`grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-base font-black text-[var(--muted)] ${className}`}>?</span>;
  if (!source) return <span className={`grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)] ${className}`}>{resource.kind.slice(0, 2).toUpperCase() || "?"}</span>;
  return <span aria-label="" className={`block shrink-0 rounded-md bg-contain bg-center bg-no-repeat [image-rendering:pixelated] ${className}`} role="img" style={{ backgroundImage: `url(${JSON.stringify(source)})` }} />;
}
