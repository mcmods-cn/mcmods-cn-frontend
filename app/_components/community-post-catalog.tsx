"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { communityPostCollection, communityPostCoverURL, communityProjectTypes, loadCommunityPosts, type CommunityPostKind, type CommunityPostReference, type CommunityPostSummary, type CommunityProjectType } from "../_lib/community-post-api";
import { type CatalogPreferences, useCatalogControls } from "../_lib/catalog-state";
import { type CatalogSortField, coreCatalogSortFields, normalizeCatalogSortDirection, normalizeCatalogSortField } from "../_lib/catalog-sort";
import { catalogResourceIconURL } from "../_lib/editor-api";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { modExportAssetURL } from "../_lib/mod-export-api";
import {
  CatalogEmptyState,
  CatalogFilterGroup,
  CatalogFilterPanel,
  CatalogFilterSidebar,
  CatalogMobileFilterDrawer,
  CatalogPageFallback,
  CatalogRadioList,
  CatalogSortControl,
} from "./catalog-list-ui";
import { CatalogMinecraftVersionFilter } from "./catalog-minecraft-version-filter";
import { ModResourceSelectionField } from "./editor/mod-resource-picker";

const communityCatalogSorts: CatalogSortField[] = [...coreCatalogSortFields];
const communityFilterParams = ["version", "versionMode", "project", "category"];

export function CommunityPostCatalog({ kind }: { kind: CommunityPostKind }) {
  return <Suspense fallback={<CatalogPageFallback />}><CommunityPostCatalogContent kind={kind} /></Suspense>;
}

function CommunityPostCatalogContent({ kind }: { kind: CommunityPostKind }) {
  const { t } = useI18n();
  const { token, user, generation } = useAuthSnapshot();
  const resultsTopRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState<CommunityPostSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState<{ hasMore: boolean; nextCursor: string } | null>(null);
  const [cursorPage, setCursorPage] = useState<{ scope: string; history: string[] }>({ scope: "", history: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const {
    paramsKey, preferences, mobileFiltersOpen, setMobileFiltersOpen, queryDraft, setQueryDraft,
    replaceParams, clearFilters, submitSearch, changePreference,
  } = useCatalogControls<CatalogSortField>({
    preferenceStorageKey: `mcmods-community-${kind}-catalog-preferences`,
    expandedStorageKey: `mcmods-community-${kind}-catalog-groups`,
    filterParams: communityFilterParams,
    defaultExpandedGroups: ["version", "project", "category"],
    sortOptions: communityCatalogSorts,
    defaultSort: "published",
    onPageChange: () => resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  });
  const filters = useMemo(() => parseCommunityFilters(new URLSearchParams(paramsKey), preferences), [paramsKey, preferences]);
  const filterScope = JSON.stringify([kind, user?.id, generation, filters]);
  const communityPostCursorHistory = cursorPage.scope === filterScope ? cursorPage.history : [];
  const currentCursor = communityPostCursorHistory.at(-1) ?? "";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => { if (!cancelled) setLoading(true); });
    loadCommunityPosts(kind, {
      query: filters.query,
      category: filters.category,
      versions: filters.versions,
      versionMode: filters.versionMode,
      projects: filters.projects,
      sort: filters.sort,
      order: filters.sortDirection,
      limit: filters.pageSize,
      cursor: currentCursor,
    }, token, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setPage({ hasMore: result.hasMore, nextCursor: result.nextCursor });
          setCategories(result.categories ?? []);
          setMessage("");
        }
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [generation, user?.id, currentCursor, filters.category, filters.pageSize, filters.projects, filters.query, filters.sort, filters.sortDirection, filters.versionMode, filters.versions, kind, reload, token]);

  const canCreate = hasPermission(user, `community.${kind}.create`);
  const filterPanel = (onClose?: () => void) => <CatalogFilterPanel
    clearLabel={t("communityPosts.catalog.clear")}
    closeLabel={t("common.close")}
    showResultsLabel={onClose ? t("communityPosts.catalog.pageItems", { count: items.length }) : undefined}
    title={t("communityPosts.catalog.filters")}
    onClear={clearFilters}
    onClose={onClose}
    onShowResults={onClose}
  >
    {kind !== "news" ? <CatalogFilterGroup label={t("communityPosts.fields.minecraftVersions")}>
      <CatalogMinecraftVersionFilter
        values={filters.versions}
        versionMode={filters.versionMode}
        onChange={(versions) => replaceParams({ version: versions })}
        onVersionModeChange={(mode) => replaceParams({ versionMode: mode === "any" ? null : mode })}
      />
    </CatalogFilterGroup> : null}
    <CatalogFilterGroup label={t("communityPosts.fields.projects")}>
      <CommunityProjectCatalogFilter
        projectRefs={filters.projects}
        token={token}
        onChange={(projects) => replaceParams({ project: projects })}
      />
    </CatalogFilterGroup>
    <CatalogFilterGroup label={t("communityPosts.fields.category")}>
      <CatalogRadioList options={["", ...categories]} selected={filters.category} label={(category) => category ? t(`communityPosts.categories.${kind}.${category}`) : t("common.all")} onChange={(category) => replaceParams({ category: category || null })} />
    </CatalogFilterGroup>
  </CatalogFilterPanel>;

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <section className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-7xl px-4 py-7 lg:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold text-[var(--accent)]">{t("communityPosts.eyebrow")}</p><h1 className="mt-1 text-3xl font-black md:text-4xl">{t(`communityPosts.${kind}.title`)}</h1><p className="mt-2 max-w-3xl text-[var(--muted)]">{t(`communityPosts.${kind}.description`)}</p></div>{canCreate ? <Link className="button-primary focus-ring" href={`/${communityPostCollection(kind)}/new`}>+ {t(`communityPosts.${kind}.create`)}</Link> : !user ? <Link className="button-secondary focus-ring" href={`/login?next=/${communityPostCollection(kind)}/new`}>{t("communityPosts.loginToCreate")}</Link> : null}</header>
      <form className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}><input className="field h-12" type="search" value={queryDraft} placeholder={t("communityPosts.search")} onChange={(event) => setQueryDraft(event.target.value)} /><button className="button-primary focus-ring h-12 px-6" type="submit">{t("common.search")}</button></form>
    </div></section>
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden"><button className="button-secondary focus-ring" type="button" onClick={() => setMobileFiltersOpen(true)}>{t("communityPosts.catalog.filters")}</button><span className="text-sm font-semibold text-[var(--muted)]">{t("communityPosts.catalog.pageItems", { count: items.length })}</span></div>
      <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
        <CatalogFilterSidebar>{filterPanel()}</CatalogFilterSidebar>
        <section className="min-w-0" ref={resultsTopRef}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4"><h2 className="text-xl font-black">{t("communityPosts.catalog.pageItems", { count: items.length })}</h2><CatalogSortControl direction={filters.sortDirection} field={filters.sort} fields={communityCatalogSorts} onDirectionChange={(sortDirection) => changePreference({ sortDirection })} onFieldChange={(sort) => changePreference({ sort })} /></div>
          {message ? <div className="mt-4 rounded-lg border border-[var(--red)] bg-[var(--panel)] p-5"><p className="font-bold text-[var(--red)]">{message}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => setReload((value) => value + 1)}>{t("communityPosts.catalog.retry")}</button></div> : null}
          {loading ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("common.loading")}>{Array.from({ length: 6 }, (_, index) => <div className="h-72 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--panel)]" key={index} />)}</div> : null}
          {!loading && !message && items.length ? <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <CommunityPostCard item={item} key={item.id} />)}</div> : null}
          {!loading && !message && !items.length ? <CatalogEmptyState clearLabel={t("communityPosts.catalog.clear")} description={t("communityPosts.catalog.emptyHint")} title={t("communityPosts.empty")} onClear={clearFilters} /> : null}
          {!loading && !message && page && (communityPostCursorHistory.length > 0 || page.hasMore) ? <div className="mt-6 flex items-center justify-between gap-3"><button className="button-secondary focus-ring" disabled={communityPostCursorHistory.length === 0} type="button" onClick={() => setCursorPage({ scope: filterScope, history: communityPostCursorHistory.slice(0, -1) })}>{t("common.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{t("communityPosts.catalog.cursorPage", { page: communityPostCursorHistory.length + 1 })}</span><button className="button-secondary focus-ring" disabled={!page.hasMore || !page.nextCursor} type="button" onClick={() => setCursorPage({ scope: filterScope, history: [...communityPostCursorHistory, page.nextCursor] })}>{t("common.next")}</button></div> : null}
        </section>
      </div>
    </div>
    <CatalogMobileFilterDrawer open={mobileFiltersOpen} title={t("communityPosts.catalog.filters")} onClose={() => setMobileFiltersOpen(false)}>{filterPanel(() => setMobileFiltersOpen(false))}</CatalogMobileFilterDrawer>
  </main>;
}

function parseCommunityFilters(params: URLSearchParams, preferences: CatalogPreferences<CatalogSortField>) {
  const rawSort = params.get("sort");
  const normalizedSort = normalizeCatalogSortField(rawSort, preferences.sort);
  const sort = communityCatalogSorts.includes(normalizedSort) ? normalizedSort : preferences.sort;
  return {
    query: params.get("q")?.trim() ?? "",
    category: params.get("category") ?? "",
    versions: (params.get("version") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    versionMode: params.get("versionMode") === "all" ? "all" as const : "any" as const,
    projects: parseCommunityProjectFilters(params.get("project")),
    sort,
    sortDirection: normalizeCatalogSortDirection(params.get("order"), preferences.sortDirection, normalizedSort),
    pageSize: [20, 40, 60].includes(Number(params.get("size"))) ? Number(params.get("size")) : preferences.pageSize,
  };
}

function parseCommunityProjectFilters(value: string | null) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter((item) => {
    const separator = item.indexOf(":");
    if (separator <= 0 || separator === item.length - 1 || item.length > 80) return false;
    return communityProjectTypes.includes(item.slice(0, separator) as CommunityProjectType);
  }))].slice(0, 20);
}

function CommunityProjectCatalogFilter({ projectRefs, token, onChange }: { projectRefs: string[]; token: string; onChange: (values: string[]) => void }) {
  const { t } = useI18n();
  const projectRefsKey = projectRefs.join(",");
  const [selectedProjects, setSelectedProjects] = useState<CatalogResourceRef[]>(() => projectRefs.map(projectFilterToResource));

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const synchronizedRefs = projectRefsKey ? projectRefsKey.split(",") : [];
      setSelectedProjects((current) => synchronizedRefs.map((projectRef) =>
        current.find((resource) => resourceToProjectFilter(resource) === projectRef) ?? projectFilterToResource(projectRef)));
    });
    return () => { cancelled = true; };
  }, [projectRefsKey]);

  return <ModResourceSelectionField
    buttonLabel={t("communityPosts.fields.selectProjects")}
    emptyLabel={t("communityPosts.fields.projectsHint")}
    projectTypes={communityProjectTypes}
    token={token}
    value={selectedProjects}
    onChange={(resources) => {
      setSelectedProjects(resources);
      onChange(resources.map(resourceToProjectFilter).filter(Boolean));
    }}
  />;
}

function resourceToProjectFilter(resource: CatalogResourceRef) {
  const type = communityProjectTypes.find((projectType) => projectType === resource.kind || projectType === resource.registry) ?? "mod";
  const identity = (resource.unresolved ? resource.rawIdentifier || resource.id : resource.publicId || resource.id).trim().toLowerCase();
  return identity ? `${type}:${identity}` : "";
}

function projectFilterToResource(projectRef: string): CatalogResourceRef {
  const separator = projectRef.indexOf(":");
  const type = projectRef.slice(0, separator) as CommunityProjectType;
  const identity = projectRef.slice(separator + 1);
  return {
    publicId: identity,
    id: identity,
    registry: type,
    kind: type,
    names: {},
    resolvedName: identity,
    source: { publicId: identity, siteId: identity, name: identity },
  };
}

function CommunityPostCard({ item }: { item: CommunityPostSummary }) {
  const { locale, t } = useI18n();
  const href = `/${communityPostCollection(item.kind)}/${item.id}`;
  return <Link className="focus-ring group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={href}>
    <div className="relative aspect-[121/75] overflow-hidden bg-[var(--panel-subtle)]">{item.coverUrl ? <Image unoptimized fill alt="" className="object-cover transition group-hover:scale-[1.02]" src={communityPostCoverURL(item.coverUrl)} /> : <RotatingResourceIcon resources={item.resources} />}</div>
    <div className="p-5"><div className="flex flex-wrap gap-2">{item.minecraftVersions.slice(0, 3).map((version) => <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]" key={version}>{version}</span>)}{item.kind === "issue" && item.severity ? <span className="rounded bg-[var(--warning-soft)] px-2 py-1 text-xs font-bold text-[var(--warning)]">{t(`communityPosts.severity.${item.severity}`)}</span> : null}{item.kind === "discussion" ? <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]">{t(`communityPosts.bounty.status.${item.resolutionStatus || "open"}`)}</span> : null}</div><h2 className="mt-3 line-clamp-2 text-xl font-black group-hover:text-[var(--accent)]">{item.title}</h2><p className="mt-3 text-sm text-[var(--muted)]">{item.authorName} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</p></div>
  </Link>;
}

export function RelatedCommunityPosts({ modId, kind }: { modId: string; kind: CommunityPostKind }) {
  const { token, user, generation } = useAuthSnapshot();
  return <RelatedPostList key={JSON.stringify([modId, kind, user?.id, generation])} modId={modId} kind={kind} token={token} />;
}

function RelatedPostList({ modId, kind, token }: { modId: string; kind: CommunityPostKind; token: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<CommunityPostSummary[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadCommunityPosts(kind, { modId, limit: 12 }, token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [attempt, kind, modId, token]);
  if (error) return <div role="alert" className="rounded-lg border border-[var(--line)] p-4">
    <p className="text-[var(--red)]">{error}</p>
    <button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>{t("communityPosts.catalog.retry")}</button>
  </div>;
  if (!items) return <p role="status" className="p-4 text-[var(--muted)]">{t("common.loading")}</p>;
  if (!items.length) return <p className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center font-bold text-[var(--muted)]">{t("communityPosts.empty")}</p>;
  return <section><h2 className="mb-4 text-xl font-black">{t(relatedTitleKey(kind))}</h2>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <CommunityPostCard item={item} key={item.id} />)}</div>
  </section>;
}

function relatedTitleKey(kind: CommunityPostKind) {
  switch (kind) {
    case "tutorial": return "communityPosts.relatedTutorials";
    case "issue": return "communityPosts.relatedIssues";
    case "news": return "communityPosts.relatedNews";
    case "discussion": return "communityPosts.relatedDiscussions";
  }
}

export function RotatingResourceIcon({ resources, compact = false }: { resources?: CommunityPostReference[] | null; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const resourceCount = resources?.length ?? 0;
  useEffect(() => {
    if (resourceCount < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % resourceCount), 1000);
    return () => window.clearInterval(timer);
  }, [resourceCount]);
  const resource = resourceCount > 0 ? resources?.[index % resourceCount] : undefined;
  const icon = resourceIcon(resource);
  const fallback = resource?.unresolved ? "?" : (resource?.name || resource?.identifier || "R").trim().slice(0, 2);
  return <div className="grid h-full w-full place-items-center">{icon ? <Image unoptimized alt="" className={compact ? "h-8 w-8 object-contain [image-rendering:pixelated]" : "h-24 w-24 object-contain [image-rendering:pixelated]"} height={compact ? 32 : 96} src={icon} width={compact ? 32 : 96} /> : <strong className={compact ? "text-sm text-[var(--muted)]" : "text-3xl text-[var(--muted)]"}>{fallback}</strong>}</div>;
}

function resourceIcon(resource?: CommunityPostReference) {
  if (!resource) return "";
  if (resource.iconUrl) return catalogResourceIconURL(resource.iconUrl);
  if (resource.revisionId && resource.iconPath) return modExportAssetURL(resource.revisionId, resource.iconPath);
  return "";
}
