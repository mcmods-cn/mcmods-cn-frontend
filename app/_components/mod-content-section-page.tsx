"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import { NO_MOD_CONTENT_CAPABILITIES, type ModContentCapabilities } from "../_lib/mod-content-capabilities.mts";
import {
  loadModContentAdvancementGraph,
  loadModContentSectionResources,
  loadModContentTemplates,
  modContentResourceAssetURL,
  type ModContentLayoutSummary,
  type ModContentSection,
  type ModContentSectionResource,
  type ModContentTemplate,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { clusterSimilarResources } from "../_lib/similar-resource-groups";
import { useI18n } from "../_lib/i18n-provider";
import { ModContentSectionActions } from "./mod-content-section-actions";
import { AdvancementResourceIndex, CompactResourceIndex, type CompactResourceGroup, type ResourceIndexEntry } from "./mod-resource-indexes";
import { useRotatingValue } from "./rotating-resource";
import { CustomContentTemplateSettings } from "./custom-content-template-settings";

export function ModContentSectionPage(props: { siteId: string; sectionId: string }) {
  const { token, user } = useAuthSnapshot();
  const { locale } = useI18n();
  return <ModContentSectionSession key={`${user?.id || "guest"}:${token || "guest"}:${locale}:${props.siteId}:${props.sectionId}`} {...props} />;
}

function ModContentSectionSession({ siteId, sectionId }: { siteId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const capabilityRequestKey = `${siteId}\u0000${sectionId}\u0000${token}`;
  const [section, setSection] = useState<ModContentSection>();
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [advancementResources, setAdvancementResources] = useState<ModContentLayoutSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState("");
  const [graphCursor, setGraphCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [capabilityState, setCapabilityState] = useState<{ key: string; value: ModContentCapabilities }>();
  const [templates, setTemplates] = useState<ModContentTemplate[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const queryScope = `${query}:${refreshKey}`;
  const activeQueryScope = useRef(queryScope);
  const pagingInFlight = useRef(false);
  useLayoutEffect(() => { activeQueryScope.current = queryScope; pagingInFlight.current = false; }, [queryScope]);

  useEffect(() => {
    let cancelled = false;
    loadModContentTemplates(siteId, token)
      .then((items) => { if (!cancelled) setTemplates(items); })
      .catch(() => { if (!cancelled) setTemplates([]); });
    return () => { cancelled = true; };
  }, [refreshKey, siteId, token]);

  useEffect(() => {
    let cancelled = false;
    const apiQuery = query.trim().length >= 3 ? query.trim() : "";
    const timer = window.setTimeout(() => loadModContentSectionResources(siteId, sectionId, { locale, query: apiQuery }, token)
      .then(async (initialPage) => initialPage.section.templateCode === "advancement"
        ? { kind: "graph" as const, page: await loadModContentAdvancementGraph(siteId, sectionId, { locale, query: apiQuery }, token) }
        : { kind: "cards" as const, page: initialPage })
      .then(({ kind, page }) => {
        if (cancelled) return;
        setSection(page.section);
        setCategories(page.categories || []);
        setVersionLabel(page.versionLabel);
        if (kind === "graph") {
          setAdvancementResources(page.items);
          setResources([]);
        } else {
          setResources(page.items);
          setAdvancementResources([]);
        }
        setTotal(page.total);
        setNextCursor(page.nextCursor || "");
        setHasMore(page.hasMore);
        setGraphCursor("");
        setCursorHistory([]);
        setCapabilityState({ key: capabilityRequestKey, value: page.capabilities });
        setError("");
      }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (!cancelled) setLoadingMore(false); }), 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [capabilityRequestKey, locale, query, refreshKey, sectionId, siteId, token]);

  const displayedResources = resources;
  const hasDisplayedResources = section?.templateCode === "advancement"
    ? advancementResources.length > 0
    : displayedResources.length > 0;
  const indexedResources = useMemo(
    () => !section ? [] : section.templateCode === "advancement"
      ? advancementResources.map((resource) => layoutSummaryIndexEntry(siteId, section, resource))
      : displayedResources.map((resource) => sectionResourceIndexEntry(siteId, section, resource, locale)),
    [advancementResources, displayedResources, locale, section, siteId],
  );
  const capabilities = capabilityState?.key === capabilityRequestKey ? capabilityState.value : NO_MOD_CONTENT_CAPABILITIES;
  if (!section) return <main className="grid min-h-[65vh] place-items-center p-6"><div>{error ? <><p role="alert">{error}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => setRefreshKey(value => value + 1)}>{t("common.retry")}</button></> : t("common.loading")}</div></main>;
  const title = localizedSectionName(section, locale, t);
  const customTemplate = section.templateBuiltin ? undefined : templates.find((item) => item.publicId === section.templatePublicId);
  const addHref = `/mods/${encodeURIComponent(siteId)}/resources/new?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`;

  function navigateAdvancementPage(cursor: string, direction: "next" | "previous") {
    if (loadingMore || pagingInFlight.current) return;
    pagingInFlight.current = true;
    const requestScope = queryScope;
    setLoadingMore(true);
    const apiQuery = query.trim().length >= 3 ? query.trim() : "";
    void loadModContentAdvancementGraph(siteId, sectionId, { locale, query: apiQuery, cursor }, token)
      .then((page) => {
        if (activeQueryScope.current !== requestScope) return;
        setAdvancementResources(page.items);
        setNextCursor(page.nextCursor || "");
        setHasMore(page.hasMore);
        if (direction === "next") setCursorHistory((current) => [...current, graphCursor]);
        else setCursorHistory((current) => current.slice(0, -1));
        setGraphCursor(cursor);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch((reason) => { if (activeQueryScope.current === requestScope) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (activeQueryScope.current === requestScope) { pagingInFlight.current = false; setLoadingMore(false); } });
  }

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-end gap-4 border-b border-[var(--line)] pb-5">
      <div className="min-w-0 flex-1"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("modContent.sectionPage.back")}</Link><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-[var(--muted)]">{versionLabel || section.versionPublicId} · {t("modContent.sectionPage.entryCount", { count: total })}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><input className="field min-w-0 flex-1 sm:w-80" type="search" aria-label={t("modContent.sectionPage.search")} value={query} placeholder={t("modContent.sectionPage.search")} onChange={(event) => { setQuery(event.target.value); setHasMore(false); setNextCursor(""); }} />{capabilities.manageLayout || capabilities.createResource ? <ModContentSectionActions canArrange={capabilities.manageLayout} canCreateResource={capabilities.createResource} onChanged={() => setRefreshKey((value) => value + 1)} section={section} siteId={siteId} /> : null}{capabilities.manageLayout && customTemplate ? <CustomContentTemplateSettings siteId={siteId} template={customTemplate} token={token} onSaved={(result) => { setStatusMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved")); if (result.reviewStatus === "approved") setRefreshKey((value) => value + 1); }} /> : null}{capabilities.manageLayout ? <Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/data/edit?version=${encodeURIComponent(section.versionPublicId)}`}>{t("common.edit")}</Link> : null}</div>
    </header>
    {statusMessage ? <p className="mt-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 font-bold text-[var(--accent)]" role="status">{statusMessage}</p> : null}
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
    {!hasDisplayedResources ? <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]"><p>{query ? t("modContent.sectionPage.noMatches") : t("modContent.sectionPage.empty")}</p>{!query && capabilities.createResource ? <Link className="button-primary focus-ring mt-5 inline-flex" href={addHref}>{t("modContent.sectionActions.add")}</Link> : null}</div> : section.templateCode === "advancement"
      ? <AdvancementResourceIndex entries={indexedResources} />
      : section.displayMode === "compact"
      ? <CompactResourceIndex groups={compactResourceGroups(section, categories, displayedResources, indexedResources, locale, t)} />
      : categories.length
      ? <CategorizedSectionResources categories={categories} locale={locale} resources={displayedResources} root={section} siteId={siteId} />
      : <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3"><SectionResourceCollection locale={locale} resources={displayedResources} section={section} siteId={siteId} /></div>}
    {section.templateCode === "advancement" ? <div className="mt-6 flex justify-center gap-2">
      <button className="button-secondary focus-ring" disabled={loadingMore || !cursorHistory.length} type="button" onClick={() => navigateAdvancementPage(cursorHistory.at(-1) || "", "previous")}>{t("common.previous")}</button>
      <button className="button-secondary focus-ring" disabled={loadingMore || !hasMore || !nextCursor} type="button" onClick={() => navigateAdvancementPage(nextCursor, "next")}>{t("common.next")}</button>
    </div> : hasMore && nextCursor ? <div className="mt-6 text-center"><button className="button-secondary focus-ring" disabled={loadingMore} type="button" onClick={() => {
      if (loadingMore || pagingInFlight.current) return;
      pagingInFlight.current = true;
      const requestScope = queryScope;
      setLoadingMore(true);
      const apiQuery = query.trim().length >= 3 ? query.trim() : "";
      void loadModContentSectionResources(siteId, sectionId, { locale, query: apiQuery, cursor: nextCursor }, token)
        .then((page) => {
          if (activeQueryScope.current !== requestScope) return;
          setResources((current) => [...current, ...page.items]);
          setNextCursor(page.nextCursor || "");
          setHasMore(page.hasMore);
        })
        .catch((reason) => { if (activeQueryScope.current === requestScope) setError(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { if (activeQueryScope.current === requestScope) { pagingInFlight.current = false; setLoadingMore(false); } });
    }}>{loadingMore ? t("common.loading") : t("common.next")}</button></div> : null}
  </div></main>;
}

function layoutSummaryIndexEntry(siteId: string, section: ModContentSection, resource: ModContentLayoutSummary): ResourceIndexEntry {
  return {
    key: resource.resourcePublicId,
    id: resource.resourcePublicId,
    name: resource.label || resource.resourcePublicId,
    iconURL: "",
    href: `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`,
    parentId: resource.advancement?.parentResourcePublicId,
    x: resource.advancement?.x,
    y: resource.advancement?.y,
    frame: resource.advancement?.frame,
    similarGroupId: resource.similarGroupId,
  };
}

function compactResourceGroups(
  root: ModContentSection,
  categories: ModContentSection[],
  resources: ModContentSectionResource[],
  entries: ResourceIndexEntry[],
  locale: string,
  t: (key: string) => string,
): CompactResourceGroup[] {
  const orderedSections = [root, ...categories];
  const sectionsByPublicId = new Map(orderedSections.map((section) => [section.publicId, section]));
  const entriesBySection = new Map<string, ResourceIndexEntry[]>();

  resources.forEach((resource, index) => {
    const entry = entries[index];
    if (!entry) return;
    const sectionEntries = entriesBySection.get(resource.sectionPublicId);
    if (sectionEntries) sectionEntries.push(entry);
    else entriesBySection.set(resource.sectionPublicId, [entry]);
  });

  return orderedSections.flatMap((section) => {
    const sectionEntries = entriesBySection.get(section.publicId);
    if (!sectionEntries?.length) return [];
    return [{
      key: section.publicId,
      label: localizedSectionName(section, locale, t),
      entries: sectionEntries,
      depth: sectionDepth(section, root.publicId, sectionsByPublicId),
    }];
  });
}

function sectionDepth(section: ModContentSection, rootPublicId: string, sections: Map<string, ModContentSection>) {
  let result = 0;
  let parentPublicId = section.parentPublicId;
  const visited = new Set<string>();
  while (parentPublicId && parentPublicId !== rootPublicId && !visited.has(parentPublicId)) {
    visited.add(parentPublicId);
    result += 1;
    parentPublicId = sections.get(parentPublicId)?.parentPublicId || "";
  }
  return result;
}

function CategorizedSectionResources({ siteId, root, categories, resources, locale }: { siteId: string; root: ModContentSection; categories: ModContentSection[]; resources: ModContentSectionResource[]; locale: string }) {
  const { t } = useI18n();
  const ordered = [root, ...categories];
  const categoryMap = new Map(ordered.map((category) => [category.publicId, category]));
  return <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
    {ordered.map((category) => {
      const entries = resources.filter((resource) => resource.sectionPublicId === category.publicId);
      if (!entries.length) return null;
      const categoryName = category.publicId === root.publicId ? "" : localizedSectionName(category, locale, t);
      return <section className="grid border-b border-[var(--line)] last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)]" key={category.publicId}>
        <h2 className="self-start px-4 py-5 text-sm font-black text-[var(--muted)]" style={{ paddingInlineStart: `${16 + sectionDepth(category, root.publicId, categoryMap) * 18}px` }}>{categoryName || "—"}</h2>
        <div className="flex flex-wrap content-start gap-2 p-3 md:border-l md:border-[var(--line)]"><SectionResourceCollection compact locale={locale} resources={entries} section={root} siteId={siteId} /></div>
      </section>;
    })}
  </div>;
}

function SectionResourceCollection({ siteId, section, resources, locale, compact = false }: { siteId: string; section: ModContentSection; resources: ModContentSectionResource[]; locale: string; compact?: boolean }) {
  return <>{clusterSimilarResources(resources, (resource) => resource.similarGroupId).map((entries) => entries.length > 1
    ? <div className={compact ? "flex flex-wrap gap-1 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-1" : "grid gap-px rounded-lg border-2 border-[var(--accent)] bg-[var(--line)] p-px"} key={`similar-${entries[0].similarGroupId}`} role="group">{entries.map((resource) => <SectionResourceLink compact={compact} key={resource.resourcePublicId} locale={locale} resource={resource} section={section} siteId={siteId} />)}</div>
    : <SectionResourceLink compact={compact} key={entries[0].resourcePublicId} locale={locale} resource={entries[0]} section={section} siteId={siteId} />)}</>;
}

function SectionResourceLink({ siteId, section, resource, locale, compact = false }: { siteId: string; section: ModContentSection; resource: ModContentSectionResource; locale: string; compact?: boolean }) {
  const { t } = useI18n();
  const name = localizedResourceName(resource, locale, section.defaultLocale) || resource.canonicalId || resource.resourcePublicId;
  const href = `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`;
  const iconURLs = sectionResourceIconURLs(resource);
  const detailState = resource.hasDetailDescription ? undefined : t("modContent.sectionPage.missingDetailDescription");
  return <Link aria-label={detailState ? `${name}，${detailState}` : name} className={`focus-ring flex min-w-0 items-center bg-[var(--panel)] hover:bg-[var(--panel-subtle)] ${compact ? "max-w-80 gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5" : "min-h-24 gap-4 p-4"}`} href={href} title={detailState}>
    <SectionResourceIcon compact={compact} sources={iconURLs} />
    <span className="min-w-0"><strong className={`block truncate ${resource.hasDetailDescription ? "text-[var(--accent)]" : "text-[var(--red)]"}`}>{name}</strong>{detailState ? <span className="mt-0.5 block text-[10px] font-bold text-[var(--red)]">{t("modContent.sectionPage.missingDetailBadge")}</span> : null}<code className="mt-1 block truncate text-xs text-[var(--muted)]">{resource.canonicalId}</code></span>
  </Link>;
}

function SectionResourceIcon({ compact, sources }: { compact: boolean; sources: string[] }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const availableSources = useMemo(() => sources.filter((source) => !failedSources.includes(source)), [failedSources, sources]);
  const src = useRotatingValue(availableSources, 1000) || "";
  const className = compact ? "h-8 w-8 text-[10px]" : "h-14 w-14 text-sm";
  if (!src) {
    return <span className={`${className} grid shrink-0 place-items-center rounded bg-[var(--panel-subtle)] font-black text-[var(--muted)]`} aria-hidden="true">?</span>;
  }
  const size = compact ? 32 : 56;
  return <Image
    unoptimized
    alt=""
    className={`${className} shrink-0 object-contain [image-rendering:pixelated]`}
    height={size}
    onError={() => setFailedSources((current) => current.includes(src) ? current : [...current, src])}
    src={src}
    width={size}
  />;
}

function sectionResourceIndexEntry(siteId: string, section: ModContentSection, resource: ModContentSectionResource, locale: string): ResourceIndexEntry {
  const definition = record(resource.definition);
  const display = record(definition.display);
  return {
    key: resource.resourcePublicId,
    id: resource.canonicalId || resource.resourcePublicId,
    name: localizedResourceName(resource, locale, section.defaultLocale) || resource.canonicalId || resource.resourcePublicId,
    iconURL: sectionResourceIconURL(resource),
    iconURLs: sectionResourceIconURLs(resource),
    href: `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`,
    parentId: typeof definition.parentId === "string"
      ? definition.parentId
      : typeof definition.parent === "string" ? definition.parent : undefined,
    x: finiteNumber(display.x),
    y: finiteNumber(display.y),
    frame: typeof display.frame === "string" ? display.frame : undefined,
    similarGroupId: resource.similarGroupId,
  };
}

function sectionResourceIconURL(resource: ModContentSectionResource) {
  if (resource.iconFileId) return modContentResourceAssetURL(resource.resourcePublicId, resource.versionPublicId, "icon-small");
  return resource.revisionId && resource.iconPath ? modExportAssetURL(resource.revisionId, resource.iconPath) : "";
}

function sectionResourceIconURLs(resource: ModContentSectionResource) {
  const previews = Array.isArray(resource.definition?.previewResources) ? resource.definition.previewResources : [];
  const previewURLs = previews.flatMap((value) => {
    const preview = record(value);
    const revisionId = typeof preview.sourceRevisionId === "string" ? preview.sourceRevisionId : "";
    const iconPath = typeof preview.iconPath === "string" ? preview.iconPath : "";
    return revisionId && iconPath ? [modExportAssetURL(revisionId, iconPath)] : [];
  });
  const uniquePreviewURLs = [...new Set(previewURLs)];
  if (uniquePreviewURLs.length) return uniquePreviewURLs;
  const fallback = sectionResourceIconURL(resource);
  return fallback ? [fallback] : [];
}

function localizedResourceName(resource: ModContentSectionResource, locale: string, defaultLocale: string) {
  const names = resource.names || {};
  for (const candidate of contentLanguageCandidates(locale, defaultLocale, "en-US")) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = Object.entries(names).find(([key]) => normalizeContentLanguage(key).toLowerCase() === normalized);
    if (match?.[1]) return match[1];
  }
  return Object.values(names).find(Boolean) || "";
}

function localizedSectionName(section: ModContentSection, locale: string, t: (key: string) => string) {
  const values = section.localizations;
  const exact = values.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(locale))?.name;
  if (exact) return exact;
  if (section.systemKey === "items" || section.systemKey === "blocks") {
    return t(`mods.detail.dataCategories.${section.systemKey}`);
  }
  return values.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(section.defaultLocale))?.name
    || values.find((item) => normalizeContentLanguage(item.locale) === "en-US")?.name
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
