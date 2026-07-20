"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import {
  loadModContentSectionResources,
  type ModContentSection,
  type ModContentSectionResource,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { AdvancementResourceIndex, ItemBlockResourceIndex, type ResourceIndexEntry } from "./mod-resource-indexes";

export function ModContentSectionPage({ siteId, sectionId }: { siteId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [section, setSection] = useState<ModContentSection>();
  const [versionLabel, setVersionLabel] = useState("");
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const pageSize = section?.templateCode === "advancement" ? 2000 : 120;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => loadModContentSectionResources(siteId, sectionId, { locale, query, limit: pageSize, offset }, token).then((page) => {
      if (cancelled) return;
      setSection(page.section);
      setVersionLabel(page.versionLabel);
      setResources(page.items);
      setTotal(page.total);
      setError("");
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    }), 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [locale, offset, pageSize, query, sectionId, siteId, token]);

  const indexedResources = useMemo(
    () => section ? resources.map((resource) => sectionResourceIndexEntry(siteId, section, resource, locale)) : [],
    [locale, resources, section, siteId],
  );
  if (!section) return <main className="grid min-h-[65vh] place-items-center p-6">{error || t("common.loading")}</main>;
  const title = localizedSectionName(section, locale, t);

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-end gap-4 border-b border-[var(--line)] pb-5">
      <div className="min-w-0 flex-1"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("modContent.sectionPage.back")}</Link><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-[var(--muted)]">{versionLabel || section.versionPublicId} · {t("modContent.sectionPage.entryCount", { count: total })}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><input className="field min-w-0 flex-1 sm:w-80" type="search" value={query} placeholder={t("modContent.sectionPage.search")} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /><Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/data/edit?version=${encodeURIComponent(section.versionPublicId)}`}>{t("common.edit")}</Link></div>
    </header>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
    {!resources.length ? <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">{query ? t("modContent.sectionPage.noMatches") : t("modContent.sectionPage.empty")}</div> : section.templateCode === "item_block"
      ? <ItemBlockResourceIndex entries={indexedResources} />
      : section.templateCode === "advancement"
        ? <AdvancementResourceIndex entries={indexedResources} />
        : section.displayMode === "compact"
          ? <div className="mt-6 flex flex-wrap gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">{resources.map((resource) => <SectionResourceLink compact key={resource.resourcePublicId} locale={locale} resource={resource} section={section} siteId={siteId} />)}</div>
          : <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{resources.map((resource) => <SectionResourceLink key={resource.resourcePublicId} locale={locale} resource={resource} section={section} siteId={siteId} />)}</div>}
    {total > pageSize ? <nav className="mt-5 flex items-center justify-center gap-3"><button className="button-secondary focus-ring" disabled={offset === 0} type="button" onClick={() => setOffset(Math.max(0, offset - pageSize))}>{t("modContent.sectionPage.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{Math.floor(offset / pageSize) + 1} / {Math.ceil(total / pageSize)}</span><button className="button-secondary focus-ring" disabled={offset + pageSize >= total} type="button" onClick={() => setOffset(offset + pageSize)}>{t("modContent.sectionPage.next")}</button></nav> : null}
  </div></main>;
}

function SectionResourceLink({ siteId, section, resource, locale, compact = false }: { siteId: string; section: ModContentSection; resource: ModContentSectionResource; locale: string; compact?: boolean }) {
  const name = localizedResourceName(resource, locale) || resource.canonicalId || resource.resourcePublicId;
  const href = `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(section.versionPublicId)}`;
  const iconURL = sectionResourceIconURL(resource);
  return <Link className={`focus-ring flex min-w-0 items-center bg-[var(--panel)] hover:bg-[var(--panel-subtle)] ${compact ? "max-w-80 gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5" : "min-h-24 gap-4 p-4"}`} href={href}>
    {iconURL ? <Image unoptimized alt="" className={`${compact ? "h-8 w-8" : "h-14 w-14"} shrink-0 object-contain [image-rendering:pixelated]`} height={compact ? 32 : 56} src={iconURL} width={compact ? 32 : 56} /> : <span className={`${compact ? "h-8 w-8 text-[10px]" : "h-14 w-14 text-sm"} grid shrink-0 place-items-center rounded bg-[var(--panel-subtle)] font-black text-[var(--muted)]`}>?</span>}
    <span className="min-w-0"><strong className="block truncate">{name}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{resource.canonicalId}</code></span>
  </Link>;
}

function sectionResourceIndexEntry(siteId: string, section: ModContentSection, resource: ModContentSectionResource, locale: string): ResourceIndexEntry {
  const definition = record(resource.definition);
  const display = record(definition.display);
  return {
    key: resource.resourcePublicId,
    id: resource.canonicalId || resource.resourcePublicId,
    name: localizedResourceName(resource, locale) || resource.canonicalId || resource.resourcePublicId,
    kindCode: resource.kindCode,
    iconURL: sectionResourceIconURL(resource),
    href: `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(section.versionPublicId)}`,
    parentId: typeof definition.parent === "string" ? definition.parent : undefined,
    x: finiteNumber(display.x),
    y: finiteNumber(display.y),
    frame: typeof display.frame === "string" ? display.frame : undefined,
  };
}

function sectionResourceIconURL(resource: ModContentSectionResource) {
  if (resource.revisionId && resource.iconPath) return modExportAssetURL(resource.revisionId, resource.iconPath);
  return resource.iconFileId ? `${API_BASE_URL}/api/v1/catalog/resources/${encodeURIComponent(resource.resourcePublicId)}/icon` : "";
}

function localizedResourceName(resource: ModContentSectionResource, locale: string) {
  const names = resource.names || {};
  for (const candidate of contentLanguageCandidates(locale, "", "en")) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = Object.entries(names).find(([key]) => normalizeContentLanguage(key).toLowerCase() === normalized);
    if (match?.[1]) return match[1];
  }
  return Object.values(names).find(Boolean) || "";
}

function localizedSectionName(section: ModContentSection, locale: string, t: (key: string) => string) {
  const values = section.localizations;
  return values.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(locale))?.name
    || values.find((item) => normalizeContentLanguage(item.locale) === "en")?.name
    || values[0]?.name
    || t(`modContent.templates.${section.templateCode}`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}
