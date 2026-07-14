"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { BackendModList, backendModToCatalogEntry } from "../_lib/mod-api";
import {
  advancedOptions,
  aprilFoolsVersions,
  commonVersions,
  environmentOptions,
  licenseOptions,
  loaderOptions,
  maintenanceOptions,
  ModCatalogEntry,
  ModFeature,
  primaryCategoryOptions,
  releaseVersions,
  snapshotVersions,
  sortOptions,
  sourceOptions,
  tagOptions,
  updatedOptions,
} from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { ModSubmissionModal } from "./mod-submission-modal";

type CatalogView = "list" | "grid";
type CatalogPreferences = { view: CatalogView; pageSize: number; sort: string };
type CatalogFilters = ReturnType<typeof parseFilters>;
type Translation = (key: string, params?: Record<string, string | number>) => string;
type FilterChip = { id: string; label: string; remove: () => void };

const filterParams = ["version", "versionMode", "loader", "primary", "tag", "environment", "status", "source", "license", "updated", "feature"];
const defaultExpandedGroups = ["versions", "loaders", "primary", "tags", "environment", "status", "source", "updated"];
const preferenceStorageKey = "mcmods-mod-catalog-preferences";
const expandedStorageKey = "mcmods-mod-filter-groups";
const favoriteStorageKey = "mcmods-favorite-mods";
const catalogNow = Date.parse("2026-07-11T12:00:00Z");

export function ModCatalog() {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const [preferences, setPreferences] = useState<CatalogPreferences>({ view: "list", pageSize: 20, sort: "relevance" });
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(defaultExpandedGroups));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");
  const [favoriteSlugs, setFavoriteSlugs] = useState(() => new Set<string>());
  const [expandedCards, setExpandedCards] = useState(() => new Set<string>());
  const [notice, setNotice] = useState("");
  const [backendMods, setBackendMods] = useState<ModCatalogEntry[]>([]);
  const [submissionOpen, setSubmissionOpen] = useState(false);

  const paramsKey = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(paramsKey), preferences), [paramsKey, preferences]);
  const filteredMods = useMemo(() => sortMods(filterMods(backendMods, filters), filters.sort, filters.query), [backendMods, filters]);
  const totalPages = Math.max(1, Math.ceil(filteredMods.length / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const pageStart = (currentPage - 1) * filters.pageSize;
  const visibleMods = filteredMods.slice(pageStart, pageStart + filters.pageSize);
  const selectedFilterCount = countSelectedFilters(filters);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPreferences(readPreferences());
      setExpandedGroups(readStringSet(expandedStorageKey, defaultExpandedGroups));
      setFavoriteSlugs(readStringSet(favoriteStorageKey));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<BackendModList>("/api/v1/mods?limit=100", {}, token)
      .then((result) => {
        if (!cancelled) setBackendMods(result.items.map(backendModToCatalogEntry));
      })
      .catch(() => {
        if (!cancelled) setBackendMods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQueryDraft(filters.query);
    });
    return () => {
      cancelled = true;
    };
  }, [filters.query]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileFiltersOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function replaceParams(updates: Record<string, string | string[] | number | null>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) next.delete(key);
      else next.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    if (resetPage && !("page" in updates)) next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggleListParam(key: string, value: string) {
    const current = readList(searchParams, key);
    replaceParams({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  function clearFilters() {
    replaceParams(Object.fromEntries(filterParams.map((key) => [key, null])));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    replaceParams({ q: queryDraft.trim() || null });
  }

  function changePreference(next: Partial<CatalogPreferences>) {
    const value = { ...preferences, ...next };
    setPreferences(value);
    window.localStorage.setItem(preferenceStorageKey, JSON.stringify(value));
    replaceParams({
      ...(next.view ? { view: next.view } : {}),
      ...(next.pageSize ? { size: next.pageSize } : {}),
      ...(next.sort ? { sort: next.sort } : {}),
    });
  }

  function toggleGroup(group: string, open: boolean) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (open) next.add(group);
      else next.delete(group);
      window.localStorage.setItem(expandedStorageKey, JSON.stringify([...next]));
      return next;
    });
  }

  function changePage(page: number) {
    replaceParams({ page }, false);
    window.requestAnimationFrame(() => resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleFavorite(siteId: string) {
    setFavoriteSlugs((current) => {
      const next = new Set(current);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      window.localStorage.setItem(favoriteStorageKey, JSON.stringify([...next]));
      setNotice(t(next.has(siteId) ? "mods.notices.favorited" : "mods.notices.unfavorited"));
      return next;
    });
  }

  async function shareMod(mod: ModCatalogEntry) {
    const url = `${window.location.origin}/mods/${mod.siteId}`;
    try {
      if (navigator.share) await navigator.share({ title: mod.name, url });
      else await navigator.clipboard.writeText(url);
      setNotice(t("mods.notices.linkCopied"));
    } catch {
      // Closing the native share sheet is not an error the page needs to surface.
    }
  }

  const chips = buildFilterChips(filters, t, (key, values) => replaceParams({ [key]: values }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-7xl px-4 py-7 lg:py-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--accent)]">{t("mods.kicker")}</p>
              <h1 className="mt-1 text-3xl font-black md:text-4xl">{t("mods.title")}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{t("mods.total", { count: backendMods.length })}</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("mods.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="button-secondary focus-ring" href="/mods-tag">{t("globalCatalog.tags.short")}</Link>
              <Link className="button-secondary focus-ring" href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link>
              <button className="button-primary focus-ring" type="button" onClick={() => setSubmissionOpen(true)}>{t("mods.submit")}</button>
            </div>
          </div>
          <form className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}>
            <input
              className="field h-12"
              value={queryDraft}
              placeholder={t("mods.searchPlaceholder")}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <button className="button-primary focus-ring h-12 px-6" type="submit">{t("mods.search")}</button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <button className="button-secondary focus-ring" type="button" onClick={() => setMobileFiltersOpen(true)}>
            {t("mods.filterButton", { count: selectedFilterCount })}
          </button>
          <span className="text-sm font-semibold text-[var(--muted)]">{t("mods.results", { count: filteredMods.length })}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
              <FilterPanel
                expandedGroups={expandedGroups}
                filters={filters}
                mods={backendMods}
                resultCount={filteredMods.length}
                t={t}
                onClear={clearFilters}
                onClose={null}
                onGroupToggle={toggleGroup}
                onParamChange={replaceParams}
                onToggleList={toggleListParam}
              />
            </div>
          </aside>

          <section className="min-w-0" ref={resultsTopRef}>
            <div className="border-b border-[var(--line)] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    {filters.query
                      ? t("mods.queryResults", { query: filters.query, count: filteredMods.length })
                      : t("mods.results", { count: filteredMods.length })}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <span className="sr-only">{t("mods.sortLabel")}</span>
                    <select className="field h-10 min-w-36 py-0" value={filters.sort} onChange={(event) => changePreference({ sort: event.target.value })}>
                      {sortOptions.map((option) => <option key={option} value={option}>{t(`mods.sort.${option}`)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1" aria-label={t("mods.viewLabel")}>
                    {(["list", "grid"] as const).map((view) => (
                      <button
                        key={view}
                        className={`focus-ring min-w-16 rounded-md px-3 py-1.5 text-sm font-bold ${filters.view === view ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
                        type="button"
                        onClick={() => changePreference({ view })}
                      >
                        {t(`mods.view.${view}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.length > 0 ? chips.map((chip) => (
                  <button key={chip.id} className="focus-ring rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-bold hover:border-[var(--accent)]" type="button" onClick={chip.remove}>
                    {chip.label} <span aria-hidden="true">×</span>
                  </button>
                )) : <span className="text-sm text-[var(--muted)]">{t("mods.noActiveFilters")}</span>}
                {chips.length > 0 ? <button className="px-2 py-1 text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={clearFilters}>{t("mods.clearAll")}</button> : null}
              </div>
            </div>

            {visibleMods.length > 0 ? (
              <div className={filters.view === "grid" ? "mt-4 grid gap-4 md:grid-cols-2" : "mt-4 grid gap-4"}>
                {visibleMods.map((mod) => (
                  <ModCard
                    key={mod.siteId}
                    expanded={expandedCards.has(mod.siteId)}
                    favorite={favoriteSlugs.has(mod.siteId)}
                    locale={locale}
                    mod={mod}
                    t={t}
                    view={filters.view}
                    onViewDownloads={() => window.open(`https://modrinth.com/mod/${mod.modrinthProjectId || mod.siteId}/versions`, "_blank", "noopener,noreferrer")}
                    onShare={() => void shareMod(mod)}
                    onToggleExpanded={() => setExpandedCards((current) => toggleSet(current, mod.siteId))}
                    onToggleFavorite={() => toggleFavorite(mod.siteId)}
                  />
                ))}
              </div>
            ) : (
              <EmptyResults filters={filters} t={t} onClear={clearFilters} onSubmit={() => setNotice(t("mods.notices.submitPending"))} />
            )}

            <Pagination
              currentPage={currentPage}
              pageSize={filters.pageSize}
              start={filteredMods.length === 0 ? 0 : pageStart + 1}
              end={Math.min(pageStart + filters.pageSize, filteredMods.length)}
              t={t}
              total={filteredMods.length}
              totalPages={totalPages}
              onPageChange={changePage}
              onPageSizeChange={(pageSize) => changePreference({ pageSize })}
            />
          </section>
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label={t("mods.filtersTitle")}>
          <button className="absolute inset-0 bg-black/45" aria-label={t("common.close")} type="button" onClick={() => setMobileFiltersOpen(false)} />
          <aside className="relative h-full w-[min(90vw,360px)] overflow-y-auto bg-[var(--panel)] shadow-2xl">
            <FilterPanel
              expandedGroups={expandedGroups}
              filters={filters}
              mods={backendMods}
              resultCount={filteredMods.length}
              t={t}
              onClear={clearFilters}
              onClose={() => setMobileFiltersOpen(false)}
              onGroupToggle={toggleGroup}
              onParamChange={replaceParams}
              onToggleList={toggleListParam}
            />
          </aside>
        </div>
      ) : null}

      {notice ? <div className="fixed bottom-5 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-[var(--foreground)] px-4 py-3 text-center text-sm font-bold text-[var(--background)] shadow-xl" role="status">{notice}</div> : null}
      <ModSubmissionModal open={submissionOpen} onClose={() => setSubmissionOpen(false)} />
    </main>
  );
}

function FilterPanel({
  expandedGroups,
  filters,
  mods,
  resultCount,
  t,
  onClear,
  onClose,
  onGroupToggle,
  onParamChange,
  onToggleList,
}: {
  expandedGroups: Set<string>;
  filters: CatalogFilters;
  mods: ModCatalogEntry[];
  resultCount: number;
  t: Translation;
  onClear: () => void;
  onClose: (() => void) | null;
  onGroupToggle: (group: string, open: boolean) => void;
  onParamChange: (updates: Record<string, string | string[] | number | null>) => void;
  onToggleList: (key: string, value: string) => void;
}) {
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showAprilFools, setShowAprilFools] = useState(false);
  const versions = [
    ...commonVersions,
    ...(showAllVersions ? releaseVersions : []),
    ...(showSnapshots ? snapshotVersions : []),
    ...(showAprilFools ? aprilFoolsVersions : []),
  ];

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <h2 className="font-black">{t("mods.filtersTitle")}</h2>
        <div className="flex items-center gap-2">
          <button className="text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={onClear}>{t("mods.clearAll")}</button>
          {onClose ? <button className="button-secondary focus-ring px-2 py-1 text-xs" type="button" onClick={onClose}>{t("common.close")}</button> : null}
        </div>
      </div>

      <FilterGroup group="versions" label={t("mods.groups.versions")} expanded={expandedGroups.has("versions")} onToggle={onGroupToggle}>
        <div className="mb-3 grid grid-cols-2 rounded-lg border border-[var(--line)] p-1">
          {(["any", "all"] as const).map((mode) => (
            <button key={mode} className={`focus-ring rounded-md px-2 py-1.5 text-xs font-bold ${filters.versionMode === mode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`} type="button" onClick={() => onParamChange({ versionMode: mode === "any" ? null : mode })}>
              {t(`mods.versionMode.${mode}`)}
            </button>
          ))}
        </div>
        <OptionList options={versions} selected={filters.versions} label={(item) => item} onToggle={(item) => onToggleList("version", item)} />
        <div className="mt-2 grid gap-1">
          <SmallToggle active={showAllVersions} label={t(showAllVersions ? "mods.showLessVersions" : "mods.showAllVersions")} onClick={() => setShowAllVersions((value) => !value)} />
          <SmallToggle active={showSnapshots} label={t("mods.showSnapshots")} onClick={() => setShowSnapshots((value) => !value)} />
          <SmallToggle active={showAprilFools} label={t("mods.showAprilFools")} onClick={() => setShowAprilFools((value) => !value)} />
        </div>
      </FilterGroup>

      <FilterGroup group="loaders" label={t("mods.groups.loaders")} expanded={expandedGroups.has("loaders")} onToggle={onGroupToggle}>
        <OptionList
          options={loaderOptions}
          selected={filters.loaders}
          label={(item) => item}
          count={(item) => mods.filter((mod) => mod.loaders.includes(item)).length}
          onToggle={(item) => onToggleList("loader", item)}
        />
      </FilterGroup>

      <FilterGroup group="primary" label={t("mods.groups.primary")} expanded={expandedGroups.has("primary")} onToggle={onGroupToggle}>
        <RadioList options={primaryCategoryOptions} selected={filters.primaryCategories[0] ?? ""} label={(item) => t(`mods.categories.${item}`)} onChange={(item) => onParamChange({ primary: item })} />
      </FilterGroup>

      <FilterGroup group="tags" label={t("mods.groups.tags")} expanded={expandedGroups.has("tags")} onToggle={onGroupToggle}>
        <OptionList options={tagOptions} selected={filters.tags} label={(item) => t(`mods.tags.${item}`)} onToggle={(item) => onToggleList("tag", item)} />
      </FilterGroup>

      <FilterGroup group="environment" label={t("mods.groups.environment")} expanded={expandedGroups.has("environment")} onToggle={onGroupToggle}>
        <OptionList options={environmentOptions} selected={filters.environments} label={(item) => t(`mods.environments.${item}`)} onToggle={(item) => onToggleList("environment", item)} />
      </FilterGroup>

      <FilterGroup group="status" label={t("mods.groups.status")} expanded={expandedGroups.has("status")} onToggle={onGroupToggle}>
        <OptionList options={maintenanceOptions} selected={filters.statuses} label={(item) => t(`mods.statuses.${item}`)} onToggle={(item) => onToggleList("status", item)} />
      </FilterGroup>

      <FilterGroup group="source" label={t("mods.groups.source")} expanded={expandedGroups.has("source")} onToggle={onGroupToggle}>
        <OptionList options={sourceOptions} selected={filters.sources} label={(item) => t(`mods.sources.${item}`)} onToggle={(item) => onToggleList("source", item)} />
        <div className="my-3 border-t border-[var(--line)]" />
        <p className="mb-2 text-xs font-bold text-[var(--muted)]">{t("mods.licenseLabel")}</p>
        <OptionList options={licenseOptions} selected={filters.licenses} label={(item) => item} onToggle={(item) => onToggleList("license", item)} />
      </FilterGroup>

      <FilterGroup group="updated" label={t("mods.groups.updated")} expanded={expandedGroups.has("updated")} onToggle={onGroupToggle}>
        <RadioList options={updatedOptions} selected={filters.updated || "all"} label={(item) => t(`mods.updated.${item}`)} onChange={(item) => onParamChange({ updated: item === "all" ? null : item })} />
      </FilterGroup>

      <FilterGroup group="advanced" label={t("mods.groups.advanced")} expanded={expandedGroups.has("advanced")} onToggle={onGroupToggle}>
        <OptionList options={advancedOptions} selected={filters.features} label={(item) => t(`mods.features.${item}`)} onToggle={(item) => onToggleList("feature", item)} />
      </FilterGroup>

      <div className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--panel)] p-4">
        <button className="button-primary focus-ring w-full" type="button" onClick={onClose ?? (() => undefined)}>{t("mods.showResults", { count: resultCount })}</button>
      </div>
    </div>
  );
}

function FilterGroup({ group, label, expanded, onToggle, children }: { group: string; label: string; expanded: boolean; onToggle: (group: string, open: boolean) => void; children: React.ReactNode }) {
  return (
    <details className="border-b border-[var(--line)]" open={expanded} onToggle={(event) => onToggle(group, event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-black hover:bg-[var(--panel-subtle)]">
        {label}<span className="text-[var(--muted)]" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function OptionList<T extends string>({ options, selected, label, count, onToggle }: { options: readonly T[]; selected: readonly string[]; label: (value: T) => string; count?: (value: T) => number; onToggle: (value: T) => void }) {
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

function RadioList<T extends string>({ options, selected, label, onChange }: { options: readonly T[]; selected: string; label: (value: T) => string; onChange: (value: T) => void }) {
  return <div className="grid gap-1">{options.map((option) => <label key={option} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--panel-subtle)]"><input className="h-4 w-4 accent-[var(--accent)]" type="radio" checked={selected === option} onChange={() => onChange(option)} /><span>{label(option)}</span></label>)}</div>;
}

function SmallToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`focus-ring rounded-md px-2 py-1.5 text-left text-xs font-bold ${active ? "bg-[var(--panel-subtle)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={onClick}>{label}</button>;
}

function ModCard({ mod, view, locale, t, favorite, expanded, onToggleFavorite, onViewDownloads, onShare, onToggleExpanded }: {
  mod: ModCatalogEntry;
  view: CatalogView;
  locale: string;
  t: Translation;
  favorite: boolean;
  expanded: boolean;
  onToggleFavorite: () => void;
  onViewDownloads: () => void;
  onShare: () => void;
  onToggleExpanded: () => void;
}) {
  const router = useRouter();
  const displayName = locale.startsWith("zh") ? mod.localizedName : mod.name;
  const secondaryName = locale.startsWith("zh") ? mod.name : mod.localizedName;
  const visibleTags = mod.tags.slice(0, 4);
  const visibleVersions = mod.versions.slice(0, 4);
  const stale = catalogNow - Date.parse(mod.updatedAt) > 730 * 86_400_000;
  const cardClass = view === "list"
    ? "grid gap-4 p-4 lg:grid-cols-[96px_minmax(0,1fr)_190px]"
    : "flex h-full flex-col p-4";

  function openDetails() {
    router.push(`/mods/${mod.siteId}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails();
    }
  }

  return (
    <article className={`surface focus-ring group cursor-pointer rounded-lg transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md ${cardClass}`} role="link" tabIndex={0} onClick={openDetails} onKeyDown={handleKeyDown}>
      <div className={view === "grid" ? "flex items-start gap-3" : "flex items-start gap-3 lg:block"}>
        {mod.icon ? <Image className="aspect-square h-20 w-20 shrink-0 rounded-lg object-cover [image-rendering:auto] lg:h-24 lg:w-24" src={mod.icon} alt={t("mods.card.iconAlt", { name: displayName })} width={96} height={96} /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] text-2xl font-black text-[var(--accent)] lg:h-24 lg:w-24" aria-label={t("mods.card.iconAlt", { name: displayName })}>{displayName.trim().slice(0, 1).toUpperCase() || "M"}</div>}
        {view === "grid" ? <CardTitle mod={mod} displayName={displayName} secondaryName={secondaryName} t={t} /> : null}
        {view === "list" ? <div className="min-w-0 lg:hidden"><CardTitle mod={mod} displayName={displayName} secondaryName={secondaryName} t={t} /></div> : null}
      </div>

      <div className={`min-w-0 ${view === "grid" ? "mt-4 flex-1" : ""}`}>
        {view === "list" ? <div className="hidden lg:block"><CardTitle mod={mod} displayName={displayName} secondaryName={secondaryName} t={t} /></div> : null}
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{modDescription(mod, t)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tag>{t(`mods.categories.${mod.primaryCategory}`)}</Tag>
          {visibleTags.map((tag) => <Tag key={tag}>{t(`mods.tags.${tag}`)}</Tag>)}
          {mod.tags.length > visibleTags.length ? <Tag>+{mod.tags.length - visibleTags.length}</Tag> : null}
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="font-bold text-[var(--muted)]">{t("mods.card.versions")}: </span>
            {expanded ? mod.versions.join("、") : visibleVersions.join("、")}
            {mod.versions.length > visibleVersions.length ? <button className="ml-1 font-bold text-[var(--accent)] hover:underline" type="button" onClick={stopAnd(onToggleExpanded)}>{t(expanded ? "mods.card.hideVersions" : "mods.card.allVersions", { count: mod.versions.length - visibleVersions.length })}</button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1"><span className="font-bold text-[var(--muted)]">{t("mods.card.loaders")}:</span>{mod.loaders.map((loader) => <Tag key={loader}>{loader}</Tag>)}</div>
          <div><span className="font-bold text-[var(--muted)]">{t("mods.card.environment")}: </span>{t(`mods.environments.${mod.environment}`)}</div>
          <div><span className="font-bold text-[var(--muted)]">{t("mods.card.updated")}: </span>{formatDate(mod.updatedAt, locale)}</div>
        </div>
        {stale ? <p className="mt-2 text-xs font-bold text-[var(--warning)]">{t("mods.card.staleWarning")}</p> : null}

        <div className={`mt-3 border-t border-[var(--line)] pt-3 text-xs ${expanded ? "block" : "hidden sm:block"}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span><span className="font-bold text-[var(--muted)]">{mod.team ? t("mods.card.team") : t("mods.card.author")}:</span> {mod.team ?? mod.authors.join("、")}</span>
            {mod.members ? <span className="flex items-center -space-x-1">{mod.members.slice(0, 3).map((member) => <span key={member.name} className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--panel)] bg-[var(--panel-subtle)] text-[10px] font-black" title={`${member.name} · ${t(`mods.roles.${member.roleKey}`)}`}>{member.initials}</span>)}</span> : null}
            <span className="font-semibold text-[var(--muted)]">{mod.license}</span>
          </div>
        </div>
        <button className="mt-3 text-xs font-bold text-[var(--accent)] sm:hidden" type="button" onClick={stopAnd(onToggleExpanded)}>{t(expanded ? "mods.card.lessDetails" : "mods.card.moreDetails")}</button>
      </div>

      <div className={`${view === "grid" ? "mt-4 border-t border-[var(--line)] pt-4" : "border-t border-[var(--line)] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"}`}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Stat label={t("mods.card.downloads")} value={formatCompact(mod.stats.downloads, locale)} />
          <Stat label={t("mods.card.favorites")} value={formatCompact(mod.stats.favorites, locale)} />
          <div className={expanded ? "contents" : "hidden sm:contents"}>
            <Stat label={t("mods.card.rating")} value={mod.stats.rating.toFixed(1)} />
            <Stat label={t("mods.card.comments")} value={formatCompact(mod.stats.comments, locale)} />
          </div>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-[var(--muted)]">{t("mods.card.downloadSource", { source: mod.stats.downloadSource })}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="button-primary focus-ring col-span-2 px-3 py-2 text-sm" type="button" onClick={stopAnd(openDetails)}>{t("mods.card.details")}</button>
          <button className="button-secondary focus-ring px-2 py-2 text-xs" type="button" aria-pressed={favorite} onClick={stopAnd(onToggleFavorite)}>{t(favorite ? "mods.card.favorited" : "mods.card.favorite")}</button>
          <button className="button-secondary focus-ring px-2 py-2 text-xs" type="button" onClick={stopAnd(onViewDownloads)}>{t("mods.card.viewDownloads")}</button>
          <button className="button-secondary focus-ring col-span-2 px-2 py-2 text-xs" type="button" onClick={stopAnd(onShare)}>{t("mods.card.share")}</button>
        </div>
      </div>
    </article>
  );
}

function CardTitle({ mod, displayName, secondaryName, t }: { mod: ModCatalogEntry; displayName: string; secondaryName: string; t: Translation }) {
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 text-lg font-black group-hover:text-[var(--accent)]">[{mod.abbreviation}] {displayName}</h3>{mod.certified ? <Tag accent>{t("mods.card.verified")}</Tag> : null}<Tag>{t(`mods.statuses.${mod.status}`)}</Tag>{mod.claimed ? <Tag>{t("mods.card.claimed")}</Tag> : null}</div>{secondaryName !== displayName ? <p className="mt-1 truncate text-sm font-semibold text-[var(--muted)]">{secondaryName}</p> : null}</div>;
}

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${accent ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-[10px] font-bold text-[var(--muted)]">{label}</span><span className="font-black tabular-nums">{value}</span></div>;
}

function EmptyResults({ filters, t, onClear, onSubmit }: { filters: CatalogFilters; t: Translation; onClear: () => void; onSubmit: () => void }) {
  const incompatibleVersions = filters.versionMode === "all" && filters.versions.length > 1;
  return (
    <div className="mt-4 border-y border-[var(--line)] py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[var(--panel-subtle)] text-2xl font-black text-[var(--muted)]" aria-hidden="true">0</div>
      <h2 className="mt-4 text-xl font-black">{t("mods.empty.title")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{incompatibleVersions ? t("mods.empty.versionSuggestion", { versions: filters.versions.join("、") }) : t("mods.empty.description")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className="button-primary focus-ring" type="button" onClick={onClear}>{t("mods.empty.clear")}</button>
        <button className="button-secondary focus-ring" type="button" onClick={onSubmit}>{t("mods.empty.submit")}</button>
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages, pageSize, start, end, total, t, onPageChange, onPageSizeChange }: { currentPage: number; totalPages: number; pageSize: number; start: number; end: number; total: number; t: Translation; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  const pages = paginationPages(currentPage, totalPages);
  return (
    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1">
          <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={currentPage <= 1} type="button" onClick={() => onPageChange(currentPage - 1)}>{t("mods.pagination.previous")}</button>
          {pages.map((page, index) => page === "ellipsis" ? <span key={`ellipsis-${index}`} className="px-2 text-[var(--muted)]">…</span> : <button key={page} className={`focus-ring h-9 min-w-9 rounded-md border px-2 text-sm font-bold ${page === currentPage ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)]"}`} type="button" onClick={() => onPageChange(page)}>{page}</button>)}
          <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={currentPage >= totalPages} type="button" onClick={() => onPageChange(currentPage + 1)}>{t("mods.pagination.next")}</button>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">{t("mods.pagination.pageSize")}<select className="field h-9 w-24 py-0" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{[20, 40, 60].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-semibold text-[var(--muted)]"><span>{t("mods.pagination.pageSummary", { page: currentPage, pages: totalPages })}</span><span>{t("mods.pagination.itemSummary", { start, end, total })}</span></div>
    </div>
  );
}

function parseFilters(params: URLSearchParams, preferences: CatalogPreferences) {
  const pageSize = [20, 40, 60].includes(Number(params.get("size"))) ? Number(params.get("size")) : preferences.pageSize;
  const view = params.get("view") === "grid" || params.get("view") === "list" ? params.get("view") as CatalogView : preferences.view;
  const sort = sortOptions.includes(params.get("sort") ?? "") ? params.get("sort") ?? preferences.sort : preferences.sort;
  return {
    query: params.get("q")?.trim() ?? "",
    versions: readList(params, "version"),
    versionMode: params.get("versionMode") === "all" ? "all" as const : "any" as const,
    loaders: readList(params, "loader"),
    primaryCategories: readList(params, "primary").slice(0, 1),
    tags: readList(params, "tag"),
    environments: readList(params, "environment"),
    statuses: readList(params, "status"),
    sources: readList(params, "source"),
    licenses: readList(params, "license"),
    updated: params.get("updated") ?? "",
    features: readList(params, "feature") as ModFeature[],
    sort,
    view,
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize,
  };
}

function filterMods(mods: ModCatalogEntry[], filters: CatalogFilters) {
  const query = normalizeSearch(filters.query);
  return mods.filter((mod) => {
    if (query) {
      const searchable = [mod.localizedName, mod.name, mod.abbreviation, mod.modId, ...mod.authors, mod.team ?? "", ...mod.keywords].map(normalizeSearch).join(" ");
      if (!searchable.includes(query)) return false;
    }
    if (filters.versions.length > 0) {
      const matches = filters.versionMode === "all" ? filters.versions.every((item) => mod.versions.includes(item)) : filters.versions.some((item) => mod.versions.includes(item));
      if (!matches) return false;
    }
    if (filters.loaders.length > 0 && !filters.loaders.some((item) => mod.loaders.includes(item))) return false;
    if (filters.primaryCategories.length > 0 && !filters.primaryCategories.includes(mod.primaryCategory)) return false;
    if (filters.tags.length > 0 && !filters.tags.every((item) => mod.tags.includes(item))) return false;
    if (filters.environments.length > 0 && !filters.environments.includes(mod.environment)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(mod.status)) return false;
    if (filters.sources.length > 0 && !filters.sources.includes(mod.sourceStatus)) return false;
    if (filters.licenses.length > 0 && !filters.licenses.includes(mod.license)) return false;
    if (filters.features.length > 0 && !filters.features.every((item) => mod.features[item])) return false;
    if (filters.updated && !matchesUpdatedRange(mod.updatedAt, filters.updated)) return false;
    return true;
  });
}

function sortMods(mods: ModCatalogEntry[], sort: string, query: string) {
  return [...mods].sort((left, right) => {
    if (sort === "updated") return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (sort === "collected") return Date.parse(right.collectedAt) - Date.parse(left.collectedAt);
    if (sort === "downloads") return right.stats.downloads - left.stats.downloads;
    if (sort === "favorites") return right.stats.favorites - left.stats.favorites;
    if (sort === "rating") return right.stats.rating - left.stats.rating;
    if (sort === "views") return right.stats.views - left.stats.views;
    if (sort === "comments") return right.stats.comments - left.stats.comments;
    if (sort === "nameAsc") return left.name.localeCompare(right.name);
    if (sort === "nameDesc") return right.name.localeCompare(left.name);
    if (query) return searchScore(right, query) - searchScore(left, query);
    return right.stats.favorites - left.stats.favorites;
  });
}

function searchScore(mod: ModCatalogEntry, query: string) {
  const normalized = normalizeSearch(query);
  if (normalizeSearch(mod.name) === normalized || normalizeSearch(mod.localizedName) === normalized || normalizeSearch(mod.modId) === normalized) return 100;
  if (normalizeSearch(mod.name).startsWith(normalized) || normalizeSearch(mod.localizedName).startsWith(normalized)) return 60;
  return 10;
}

function matchesUpdatedRange(updatedAt: string, range: string) {
  const days = Math.max(0, (catalogNow - Date.parse(updatedAt)) / 86_400_000);
  if (range === "week") return days <= 7;
  if (range === "month") return days <= 30;
  if (range === "quarter") return days <= 90;
  if (range === "year") return days <= 365;
  if (range === "stale") return days > 365;
  return true;
}

function buildFilterChips(filters: CatalogFilters, t: Translation, update: (key: string, values: string[]) => void): FilterChip[] {
  const groups: Array<[string, string[], (value: string) => string]> = [
    ["version", filters.versions, (value) => value],
    ["loader", filters.loaders, (value) => value],
    ["primary", filters.primaryCategories, (value) => t(`mods.categories.${value}`)],
    ["tag", filters.tags, (value) => t(`mods.tags.${value}`)],
    ["environment", filters.environments, (value) => t(`mods.environments.${value}`)],
    ["status", filters.statuses, (value) => t(`mods.statuses.${value}`)],
    ["source", filters.sources, (value) => t(`mods.sources.${value}`)],
    ["license", filters.licenses, (value) => value],
    ["feature", filters.features, (value) => t(`mods.features.${value}`)],
  ];
  const chips = groups.flatMap(([key, values, label]) => values.map((value) => ({ id: `${key}-${value}`, label: label(value), remove: () => update(key, values.filter((item) => item !== value)) })));
  if (filters.updated) chips.push({ id: `updated-${filters.updated}`, label: t(`mods.updated.${filters.updated}`), remove: () => update("updated", []) });
  return chips;
}

function countSelectedFilters(filters: CatalogFilters) {
  return filters.versions.length + filters.loaders.length + filters.primaryCategories.length + filters.tags.length + filters.environments.length + filters.statuses.length + filters.sources.length + filters.licenses.length + filters.features.length + (filters.updated ? 1 : 0);
}

function readList(params: Pick<URLSearchParams, "get">, key: string) {
  return (params.get(key) ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readPreferences(): CatalogPreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(preferenceStorageKey) ?? "{}") as Partial<CatalogPreferences>;
    return {
      view: value.view === "grid" ? "grid" : "list",
      pageSize: [20, 40, 60].includes(Number(value.pageSize)) ? Number(value.pageSize) : 20,
      sort: sortOptions.includes(value.sort ?? "") ? value.sort ?? "relevance" : "relevance",
    };
  } catch {
    return { view: "list", pageSize: 20, sort: "relevance" };
  }
}

function readStringSet(key: string, fallback: string[] = []) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return new Set(fallback);
    const value = JSON.parse(stored) as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback);
  } catch {
    return new Set(fallback);
  }
}

function toggleSet(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function stopAnd(action: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, " ");
}

function formatCompact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
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

function modDescription(mod: ModCatalogEntry, t: Translation) {
  if (mod.summary) return mod.summary;
  return mod.descriptionKey ? t(mod.descriptionKey) : "";
}
