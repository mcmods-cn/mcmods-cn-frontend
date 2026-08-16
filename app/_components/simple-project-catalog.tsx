"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  readCatalogList as readList,
  type CatalogFilterChip as FilterChip,
  type CatalogParamValue as ParamValue,
  type CatalogPreferences,
  type CatalogTranslation as Translation,
  type CatalogView,
  useCatalogControls,
} from "../_lib/catalog-state";
import { useI18n } from "../_lib/i18n-provider";
import { licenseOptions } from "../_lib/mod-catalog-data";
import {
  localizedSimpleProject,
  simpleProjectConfig,
  simpleProjectIconURL,
  type SimpleProjectConfig,
  type SimpleProjectList,
  type SimpleProjectRecord,
  type SimpleProjectType,
} from "../_lib/simple-project-api";
import {
  CatalogEmptyState,
  CatalogFilterGroup,
  CatalogFilterPanel,
  CatalogFilterSidebar,
  CatalogMobileFilterDrawer,
  CatalogOptionList,
  CatalogPagination,
  CatalogRadioList,
} from "./catalog-list-ui";
import { CatalogMinecraftVersionFilter } from "./catalog-minecraft-version-filter";
import { ProjectSubmissionModal } from "./project-submission-modal";

type CatalogSort = "relevance" | "heat" | "updated" | "nameAsc" | "nameDesc";
type CatalogFilters = ReturnType<typeof parseFilters>;
const sortOptions: CatalogSort[] = ["relevance", "heat", "updated", "nameAsc", "nameDesc"];
const officialStatusOptions = ["active", "lowFrequency", "development", "discontinued", "archived"] as const;
const sourceStatusOptions = ["open", "partial", "closed", "unknown"] as const;
const updatedOptions = ["all", "week", "month", "quarter", "year", "stale"] as const;
const filterParams = ["version", "versionMode", "loader", "category", "feature", "resolution", "performance", "mapSize", "parent", "status", "source", "license", "updated"];
const defaultExpandedGroups = ["versions", "loaders", "categories", "selector", "features", "parentProjects", "status", "source", "updated"];

export function SimpleProjectCatalog({ projectType }: { projectType: SimpleProjectType }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const config = simpleProjectConfig(projectType);
  const resultsTopRef = useRef<HTMLElement | null>(null);
  const preferenceStorageKey = `mcmods-${projectType}-catalog-preferences`;
  const expandedStorageKey = `mcmods-${projectType}-filter-groups`;
  const [items, setItems] = useState<SimpleProjectRecord[]>([]);
  const [backendTotal, setBackendTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const {
    paramsKey, preferences, expandedGroups, mobileFiltersOpen, setMobileFiltersOpen,
    queryDraft, setQueryDraft, notice, setNotice, replaceParams, toggleListParam, clearFilters,
    submitSearch, changePreference, toggleGroup, changePage,
  } = useCatalogControls<CatalogSort>({
    preferenceStorageKey,
    expandedStorageKey,
    filterParams,
    defaultExpandedGroups,
    sortOptions,
    defaultSort: "relevance",
    onPageChange: () => resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  });

  const filters = useMemo(() => parseFilters(new URLSearchParams(paramsKey), preferences, config), [config, paramsKey, preferences]);
  const totalPages = Math.max(1, Math.ceil(backendTotal / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const pageStart = (currentPage - 1) * filters.pageSize;
  const visibleItems = items;
  const selectedFilterCount = countSelectedFilters(filters);
  const options = useMemo(() => catalogFilterOptions(items, config), [config, items]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const requestParams = new URLSearchParams(paramsKey);
      requestParams.delete("page");
      requestParams.delete("size");
      requestParams.delete("view");
      requestParams.set("limit", String(filters.pageSize));
      requestParams.set("offset", String((filters.page - 1) * filters.pageSize));
      const result = await apiRequest<SimpleProjectList>(`/api/v1/content-projects/${projectType}?${requestParams}`, {}, token);
      setItems(result.items);
      setBackendTotal(result.total);
      setMessage("");
    } catch (error) {
      setItems([]);
      setBackendTotal(0);
      setMessage(error instanceof Error ? error.message : t("largeProjects.catalog.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.pageSize, paramsKey, projectType, ready, t, token]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function shareProject(item: SimpleProjectRecord) {
    const localization = localizedSimpleProject(item, locale);
    const url = `${window.location.origin}${config.path}/${item.siteId}`;
    try {
      if (navigator.share) await navigator.share({ title: localization.name || item.siteId, url });
      else await navigator.clipboard.writeText(url);
      setNotice(t("largeProjects.catalog.linkCopied"));
    } catch {
      // Closing the native share sheet is not an actionable error.
    }
  }

  const chips = buildFilterChips(filters, config, options, t, (key, values) => replaceParams({ [key]: values }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-7xl px-4 py-7 lg:py-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--accent)]">{t("largeProjects.kicker")}</p>
              <h1 className="mt-1 text-3xl font-black md:text-4xl">{t(`largeProjects.types.${projectType}`)}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{t("largeProjects.catalog.total", { count: backendTotal })}</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t(`largeProjects.descriptions.${projectType}`)}</p>
            </div>
            <button className="button-primary focus-ring" type="button" onClick={() => setSubmissionOpen(true)}>+ {t("largeProjects.catalog.create")}</button>
          </div>
          <form className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}>
            <input className="field h-12" value={queryDraft} placeholder={t("largeProjects.catalog.searchPlaceholder")} onChange={(event) => setQueryDraft(event.target.value)} />
            <button className="button-primary focus-ring h-12 px-6" type="submit">{t("common.search")}</button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <button className="button-secondary focus-ring" type="button" onClick={() => setMobileFiltersOpen(true)}>{t("largeProjects.catalog.filterButton", { count: selectedFilterCount })}</button>
          <span className="text-sm font-semibold text-[var(--muted)]">{t("largeProjects.catalog.results", { count: backendTotal })}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
          <CatalogFilterSidebar>
            <ProjectFilterPanel
              config={config}
              expandedGroups={expandedGroups}
              filters={filters}
              options={options}
              resultCount={backendTotal}
              t={t}
              onClear={clearFilters}
              onClose={null}
              onGroupToggle={toggleGroup}
              onParamChange={replaceParams}
              onToggleList={toggleListParam}
            />
          </CatalogFilterSidebar>

          <section className="min-w-0" ref={resultsTopRef}>
            <div className="border-b border-[var(--line)] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">{filters.query ? t("largeProjects.catalog.queryResults", { query: filters.query, count: backendTotal }) : t("largeProjects.catalog.results", { count: backendTotal })}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <span className="sr-only">{t("largeProjects.catalog.sortLabel")}</span>
                    <select className="field h-10 min-w-36 py-0" value={filters.sort} onChange={(event) => changePreference({ sort: event.target.value as CatalogSort })}>
                      {sortOptions.map((option) => <option key={option} value={option}>{t(`largeProjects.catalog.sort.${option}`)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1" aria-label={t("largeProjects.catalog.viewLabel")}>
                    {(["list", "grid"] as const).map((view) => <button key={view} className={`focus-ring min-w-16 rounded-md px-3 py-1.5 text-sm font-bold ${filters.view === view ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`} type="button" onClick={() => changePreference({ view })}>{t(`largeProjects.catalog.view.${view}`)}</button>)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.length > 0 ? chips.map((chip) => <button key={chip.id} className="focus-ring rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-bold hover:border-[var(--accent)]" type="button" onClick={chip.remove}>{chip.label} <span aria-hidden="true">×</span></button>) : <span className="text-sm text-[var(--muted)]">{t("largeProjects.catalog.noActiveFilters")}</span>}
                {chips.length > 0 ? <button className="px-2 py-1 text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={clearFilters}>{t("largeProjects.catalog.clearAll")}</button> : null}
              </div>
            </div>

            {loading ? <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</div> : null}
            {message ? <div className="mt-4 rounded-lg border border-[var(--red)] bg-[var(--panel)] p-4"><p className="font-bold text-[var(--red)]">{message}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => void load()}>{t("common.refresh")}</button></div> : null}
            {!loading && !message && visibleItems.length > 0 ? (
              <div className={filters.view === "grid" ? "mt-4 grid gap-4 md:grid-cols-2" : "mt-4 grid gap-4"}>
                {visibleItems.map((item) => <ProjectCard key={item.id} config={config} item={item} locale={locale} t={t} view={filters.view} onShare={() => void shareProject(item)} />)}
              </div>
            ) : null}
            {!loading && !message && visibleItems.length === 0 ? <CatalogEmptyState clearLabel={t("largeProjects.catalog.clearAll")} description={t("largeProjects.catalog.emptyHint")} title={t("largeProjects.catalog.empty")} onClear={clearFilters} /> : null}

            {!loading && !message ? <CatalogPagination
              currentPage={currentPage}
              pageSize={filters.pageSize}
              totalPages={totalPages}
              labels={{
                previous: t("largeProjects.catalog.pagination.previous"),
                next: t("largeProjects.catalog.pagination.next"),
                pageSize: t("largeProjects.catalog.pagination.pageSize"),
                pageSummary: t("largeProjects.catalog.pagination.pageSummary", { page: currentPage, pages: totalPages }),
                itemSummary: t("largeProjects.catalog.pagination.itemSummary", { start: backendTotal === 0 ? 0 : pageStart + 1, end: Math.min(pageStart + visibleItems.length, backendTotal), total: backendTotal }),
              }}
              onPageChange={changePage}
              onPageSizeChange={(pageSize) => changePreference({ pageSize })}
            /> : null}
          </section>
        </div>
      </div>

      <CatalogMobileFilterDrawer open={mobileFiltersOpen} title={t("largeProjects.catalog.filtersTitle")} onClose={() => setMobileFiltersOpen(false)}>
        <ProjectFilterPanel
          config={config}
          expandedGroups={expandedGroups}
          filters={filters}
          options={options}
          resultCount={backendTotal}
          t={t}
          onClear={clearFilters}
          onClose={() => setMobileFiltersOpen(false)}
          onGroupToggle={toggleGroup}
          onParamChange={replaceParams}
          onToggleList={toggleListParam}
        />
      </CatalogMobileFilterDrawer>
      {notice ? <div className="fixed bottom-5 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-[var(--foreground)] px-4 py-3 text-center text-sm font-bold text-[var(--background)] shadow-xl" role="status">{notice}</div> : null}
      <ProjectSubmissionModal open={submissionOpen} projectType={projectType} onClose={() => setSubmissionOpen(false)} />
    </main>
  );
}

function ProjectFilterPanel({ config, expandedGroups, filters, options, resultCount, t, onClear, onClose, onGroupToggle, onParamChange, onToggleList }: {
  config: SimpleProjectConfig;
  expandedGroups: Set<string>;
  filters: CatalogFilters;
  options: ReturnType<typeof catalogFilterOptions>;
  resultCount: number;
  t: Translation;
  onClear: () => void;
  onClose: (() => void) | null;
  onGroupToggle: (group: string, open: boolean) => void;
  onParamChange: (updates: Record<string, ParamValue>) => void;
  onToggleList: (key: string, value: string) => void;
}) {
  const selectorKey = config.selector;
  return <CatalogFilterPanel
    clearLabel={t("largeProjects.catalog.clearAll")}
    closeLabel={t("common.close")}
    showResultsLabel={onClose ? t("largeProjects.catalog.showResults", { count: resultCount }) : undefined}
    title={t("largeProjects.catalog.filtersTitle")}
    onClear={onClear}
    onClose={onClose ?? undefined}
    onShowResults={onClose ?? undefined}
  >
    <FilterGroup group="versions" label={t("largeProjects.fields.minecraftVersions")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogMinecraftVersionFilter
        values={filters.versions}
        versionMode={filters.versionMode}
        onChange={(versions) => onParamChange({ version: versions })}
        onVersionModeChange={(mode) => onParamChange({ versionMode: mode === "any" ? null : mode })}
      />
    </FilterGroup>
    {options.loaders.length ? <FilterGroup group="loaders" label={t("largeProjects.fields.loaders")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={options.loaders} selected={filters.loaders} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList("loader", value)} />
    </FilterGroup> : null}
    {options.categories.length ? <FilterGroup group="categories" label={t("largeProjects.fields.categories")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={options.categories} selected={filters.categories} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList("category", value)} />
    </FilterGroup> : null}
    {selectorKey && options.selectorValues.length ? <FilterGroup group="selector" label={t(`largeProjects.fields.${selectorKey}`)} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={options.selectorValues} selected={filters.selectorValues} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList(selectorKey, value)} />
    </FilterGroup> : null}
    {options.features.length ? <FilterGroup group="features" label={t("largeProjects.fields.features")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={options.features} selected={filters.features} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList("feature", value)} />
    </FilterGroup> : null}
    {config.type === "addon" && options.parentProjects.length ? <FilterGroup group="parentProjects" label={t("largeProjects.fields.parentProjects")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={options.parentProjects.map((option) => option.key)} selected={filters.parents} label={(value) => options.parentProjects.find((option) => option.key === value)?.label || value} onToggle={(value) => onToggleList("parent", value)} />
    </FilterGroup> : null}
    <FilterGroup group="status" label={t("largeProjects.catalog.groups.status")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={officialStatusOptions} selected={filters.statuses} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList("status", value)} />
    </FilterGroup>
    <FilterGroup group="source" label={t("largeProjects.catalog.groups.source")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogOptionList options={sourceStatusOptions} selected={filters.sources} label={(value) => optionLabel(value, t)} onToggle={(value) => onToggleList("source", value)} />
      {options.licenses.length ? <><div className="my-3 border-t border-[var(--line)]" /><p className="mb-2 text-xs font-bold text-[var(--muted)]">{t("largeProjects.catalog.groups.license")}</p><CatalogOptionList options={options.licenses} selected={filters.licenses} label={(value) => value} onToggle={(value) => onToggleList("license", value)} /></> : null}
    </FilterGroup>
    <FilterGroup group="updated" label={t("largeProjects.catalog.groups.updated")} expandedGroups={expandedGroups} onGroupToggle={onGroupToggle}>
      <CatalogRadioList options={updatedOptions} selected={filters.updated || "all"} label={(value) => t(`largeProjects.catalog.updated.${value}`)} onChange={(value) => onParamChange({ updated: value === "all" ? null : value })} />
    </FilterGroup>
  </CatalogFilterPanel>;
}

function FilterGroup({ group, label, expandedGroups, onGroupToggle, children }: { group: string; label: string; expandedGroups: Set<string>; onGroupToggle: (group: string, open: boolean) => void; children: React.ReactNode }) {
  return <CatalogFilterGroup group={group} label={label} expanded={expandedGroups.has(group)} onToggle={onGroupToggle}>{children}</CatalogFilterGroup>;
}

function ProjectCard({ item, config, locale, t, view, onShare }: { item: SimpleProjectRecord; config: SimpleProjectConfig; locale: string; t: Translation; view: CatalogView; onShare: () => void }) {
  const router = useRouter();
  const localization = localizedSimpleProject(item, locale);
  const defaultLocalization = localizedSimpleProject(item, item.defaultLocale);
  const displayName = localization.name || defaultLocalization.name || item.siteId;
  const secondaryName = defaultLocalization.name && defaultLocalization.name !== displayName ? defaultLocalization.name : "";
  const specialValue = config.selector ? selectorValue(item, config.selector) : "";
  const cardClass = view === "list" ? "grid gap-4 p-4 lg:grid-cols-[96px_minmax(0,1fr)_190px]" : "flex h-full flex-col p-4";

  function openDetails() { router.push(`${config.path}/${item.siteId}`); }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails();
    }
  }

  return <article className={`surface focus-ring group cursor-pointer rounded-lg transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md ${cardClass}`} role="link" tabIndex={0} onClick={openDetails} onKeyDown={handleKeyDown}>
    <div className={view === "grid" ? "flex items-start gap-3" : "flex items-start gap-3 lg:block"}>
      <ProjectIcon icon={simpleProjectIconURL(item)} name={displayName} t={t} />
      {view === "grid" ? <ProjectTitle item={item} displayName={displayName} secondaryName={secondaryName} t={t} /> : null}
      {view === "list" ? <div className="min-w-0 lg:hidden"><ProjectTitle item={item} displayName={displayName} secondaryName={secondaryName} t={t} /></div> : null}
    </div>
    <div className={`min-w-0 ${view === "grid" ? "mt-4 flex-1" : ""}`}>
      {view === "list" ? <div className="hidden lg:block"><ProjectTitle item={item} displayName={displayName} secondaryName={secondaryName} t={t} /></div> : null}
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-6 text-[var(--muted)]">{localization.summary || defaultLocalization.summary || t("largeProjects.catalog.noSummary")}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {specialValue ? <Tag accent>{optionLabel(specialValue, t)}</Tag> : null}
        {item.categories.slice(0, 4).map((value) => <Tag key={value}>{optionLabel(value, t)}</Tag>)}
        {item.features.slice(0, 2).map((value) => <Tag key={value}>{optionLabel(value, t)}</Tag>)}
        {item.categories.length + item.features.length > 6 ? <Tag>+{item.categories.length + item.features.length - 6}</Tag> : null}
      </div>
      {item.parentProjects.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.parentProjects.slice(0, 3).map((parent, index) => <Tag key={`${parent.type}-${parent.siteId || parent.identifier || index}`}>{parent.name || parent.identifier || t(`largeProjects.types.${parent.type}`)}</Tag>)}</div> : null}
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div><span className="font-bold text-[var(--muted)]">{t("largeProjects.fields.minecraftVersions")}: </span>{item.minecraftVersions.slice(0, 5).join("、") || "—"}</div>
        {item.loaders.length ? <div className="flex flex-wrap items-center gap-1"><span className="font-bold text-[var(--muted)]">{t("largeProjects.fields.loaders")}:</span>{item.loaders.map((loader) => <Tag key={loader}>{optionLabel(loader, t)}</Tag>)}</div> : null}
        <div><span className="font-bold text-[var(--muted)]">{t("largeProjects.catalog.card.updated")}: </span>{formatDate(item.updatedAt, locale)}</div>
        <div><span className="font-bold text-[var(--muted)]">{t("largeProjects.catalog.card.authors")}: </span>{item.authors.map((author) => author.name).join("、") || "—"}</div>
      </div>
    </div>
    <div className={`${view === "grid" ? "mt-4 border-t border-[var(--line)] pt-4" : "border-t border-[var(--line)] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"}`}>
      <dl className="grid gap-2 text-xs">
        <CardMeta label={t("largeProjects.catalog.groups.status")} value={optionLabel(item.officialStatus, t)} />
        <CardMeta label={t("largeProjects.catalog.groups.source")} value={optionLabel(item.sourceStatus, t)} />
        <CardMeta label={t("largeProjects.catalog.groups.license")} value={item.license || "—"} />
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="button-primary focus-ring col-span-2 px-3 py-2 text-sm" type="button" onClick={stopAnd(openDetails)}>{t("largeProjects.catalog.card.details")}</button>
        <button className="button-secondary focus-ring col-span-2 px-2 py-2 text-xs" type="button" onClick={stopAnd(onShare)}>{t("largeProjects.catalog.card.share")}</button>
      </div>
    </div>
  </article>;
}

function ProjectTitle({ item, displayName, secondaryName, t }: { item: SimpleProjectRecord; displayName: string; secondaryName: string; t: Translation }) {
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 text-lg font-black group-hover:text-[var(--accent)]">{item.abbreviation ? `[${item.abbreviation}] ` : ""}{displayName}</h3><Tag>{optionLabel(item.officialStatus, t)}</Tag></div>{secondaryName ? <p className="mt-1 truncate text-sm font-semibold text-[var(--muted)]">{secondaryName}</p> : null}<code className="mt-1 block truncate text-xs text-[var(--muted)]">{item.siteId}</code></div>;
}

function ProjectIcon({ icon, name, t }: { icon: string; name: string; t: Translation }) {
  return icon ? <Image unoptimized alt={t("largeProjects.catalog.card.iconAlt", { name })} className="h-20 w-20 shrink-0 rounded-lg object-contain lg:h-24 lg:w-24" height={96} src={icon} width={96} /> : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--accent-soft)] text-xl font-black text-[var(--accent)] lg:h-24 lg:w-24" aria-label={t("largeProjects.catalog.card.iconAlt", { name })}>{[...name.trim()].slice(0, 2).join("").toUpperCase() || "?"}</span>;
}

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${accent ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>{children}</span>;
}

function CardMeta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-bold text-[var(--muted)]">{label}</dt><dd className="font-black">{value}</dd></div>;
}

function parseFilters(params: URLSearchParams, preferences: CatalogPreferences<CatalogSort>, config: SimpleProjectConfig) {
  const pageSize = [20, 40, 60].includes(Number(params.get("size"))) ? Number(params.get("size")) : preferences.pageSize;
  const view = params.get("view") === "grid" || params.get("view") === "list" ? params.get("view") as CatalogView : preferences.view;
  const requestedSort = params.get("sort") as CatalogSort | null;
  const sort = requestedSort && sortOptions.includes(requestedSort) ? requestedSort : preferences.sort;
  return {
    query: params.get("q")?.trim() ?? "",
    versions: readList(params, "version"),
    versionMode: params.get("versionMode") === "all" ? "all" as const : "any" as const,
    loaders: readList(params, "loader"),
    categories: readList(params, "category"),
    features: readList(params, "feature"),
    selectorValues: config.selector ? readList(params, config.selector) : [],
    parents: readList(params, "parent"),
    statuses: readList(params, "status"),
    sources: readList(params, "source"),
    licenses: readList(params, "license"),
    updated: params.get("updated") ?? "",
    sort,
    view,
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize,
  };
}

function catalogFilterOptions(items: SimpleProjectRecord[], config: SimpleProjectConfig) {
  return {
    versions: uniqueSorted(items.flatMap((item) => item.minecraftVersions), compareMinecraftVersions),
    loaders: uniqueStable([...config.loaders, ...items.flatMap((item) => item.loaders)]),
    categories: uniqueStable([...config.categories, ...items.flatMap((item) => item.categories)]),
    features: uniqueStable([...config.features, ...items.flatMap((item) => item.features)]),
    selectorValues: uniqueStable([...(config.selectorOptions ?? []), ...items.map((item) => config.selector ? selectorValue(item, config.selector) : "")]),
    parentProjects: uniqueParentProjects(items),
    licenses: uniqueStable([...licenseOptions, ...items.map((item) => item.license)]),
  };
}

function buildFilterChips(filters: CatalogFilters, config: SimpleProjectConfig, options: ReturnType<typeof catalogFilterOptions>, t: Translation, update: (key: string, values: string[]) => void): FilterChip[] {
  const groups: Array<[string, string[], (value: string) => string]> = [
    ["version", filters.versions, (value) => value],
    ["loader", filters.loaders, (value) => optionLabel(value, t)],
    ["category", filters.categories, (value) => optionLabel(value, t)],
    ["feature", filters.features, (value) => optionLabel(value, t)],
    [config.selector ?? "", filters.selectorValues, (value) => optionLabel(value, t)],
    ["parent", filters.parents, (value) => options.parentProjects.find((option) => option.key === value)?.label || value],
    ["status", filters.statuses, (value) => optionLabel(value, t)],
    ["source", filters.sources, (value) => optionLabel(value, t)],
    ["license", filters.licenses, (value) => value],
  ];
  const chips = groups.filter(([key]) => key).flatMap(([key, values, label]) => values.map((value) => ({ id: `${key}-${value}`, label: label(value), remove: () => update(key, values.filter((item) => item !== value)) })));
  if (filters.updated) chips.push({ id: `updated-${filters.updated}`, label: t(`largeProjects.catalog.updated.${filters.updated}`), remove: () => update("updated", []) });
  return chips;
}

function countSelectedFilters(filters: CatalogFilters) {
  return filters.versions.length + filters.loaders.length + filters.categories.length + filters.features.length + filters.selectorValues.length + filters.parents.length + filters.statuses.length + filters.sources.length + filters.licenses.length + (filters.updated ? 1 : 0);
}

function uniqueParentProjects(items: SimpleProjectRecord[]) {
  const values = new Map<string, { key: string; label: string }>();
  for (const parent of items.flatMap((item) => item.parentProjects)) {
    const key = parentProjectKey(parent);
    if (!key || values.has(key)) continue;
    const identity = parent.name || parent.identifier || parent.siteId || parent.publicId || parent.type;
    values.set(key, { key, label: identity });
  }
  return [...values.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function parentProjectKey(parent: SimpleProjectRecord["parentProjects"][number]) {
  const identity = parent.siteId || parent.publicId || parent.identifier;
  return identity ? `${parent.type}:${identity}` : "";
}

function selectorValue(item: SimpleProjectRecord, selector: NonNullable<SimpleProjectConfig["selector"]>) {
  if (selector === "resolution") return item.resolution;
  if (selector === "performance") return item.performance;
  return item.mapSize;
}

function optionLabel(value: string, t: Translation) {
  return t(`largeProjects.options.${value}`);
}

function uniqueStable(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSorted(values: readonly string[], compare?: (left: string, right: string) => number) {
  return uniqueStable(values).sort(compare);
}

function compareMinecraftVersions(left: string, right: string) {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function stopAnd(action: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };
}
