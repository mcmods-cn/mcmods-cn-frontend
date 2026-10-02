"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { type CatalogSortField, normalizeCatalogSortDirection, normalizeCatalogSortField } from "../_lib/catalog-sort";
import {
  readCatalogList as readList,
  readStoredStringSet as readStringSet,
  type CatalogFilterChip as FilterChip,
  type CatalogPreferences,
  type CatalogTranslation as Translation,
  type CatalogView,
  useCatalogControls,
} from "../_lib/catalog-state";
import { BackendModList, backendModToCatalogEntry, type MinecraftVersionConfig } from "../_lib/mod-api";
import { BackendModpackList, backendModpackToCatalogEntry, modpackCategoryOptions } from "../_lib/modpack-api";
import {
  advancedOptions,
  environmentOptions,
  licenseOptions,
  maintenanceOptions,
  ModCatalogEntry,
  ModFeature,
  primaryCategoryOptions,
  sourceOptions,
  tagOptions,
  updatedOptions,
} from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { loadFavoriteMembershipSummary } from "../_lib/favorite-api";
import { FavoritePickerModal } from "./favorite-picker-modal";
import { ProjectSubmissionModal } from "./project-submission-modal";
import {
  CatalogEmptyState,
  CatalogHero,
  CatalogFilterGroup,
  CatalogFilterPanel,
  CatalogFilterSidebar,
  CatalogMobileFilterDrawer,
  CatalogOptionList,
  CatalogPagination,
  CatalogRadioList,
  CatalogSortControl,
} from "./catalog-list-ui";
import { CatalogMinecraftVersionFilter } from "./catalog-minecraft-version-filter";
import { CatalogContainedModFilter } from "./catalog-contained-mod-filter";
import { useMinecraftVersionConfig } from "./minecraft-version-picker";

type CatalogFilters = ReturnType<typeof parseFilters>;

const filterParams = ["version", "versionMode", "loader", "primary", "tag", "mods", "environment", "status", "source", "license", "updated", "feature"];
const defaultExpandedGroups = ["versions", "containedMods", "loaders", "primary", "tags", "environment", "status", "source", "updated"];
const expandedStorageKey = "mcmods-mod-filter-groups";
const catalogReferenceTime = Date.now();
const modSortFields: CatalogSortField[] = ["published", "updated", "heat", "views", "relevance", "downloads", "favorites", "rating", "comments", "name"];

export function ModCatalog({ projectType = "mod" }: { projectType?: "mod" | "modpack" }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const [favoriteSlugs, setFavoriteSlugs] = useState(() => new Set<string>());
  const [expandedCards, setExpandedCards] = useState(() => new Set<string>());
  const [backendMods, setBackendMods] = useState<ModCatalogEntry[]>([]);
  const [backendTotal, setBackendTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [favoriteTarget, setFavoriteTarget] = useState<ModCatalogEntry | null>(null);
  const minecraftVersionConfig = useMinecraftVersionConfig();
  const isModpack = projectType === "modpack";
  const basePath = isModpack ? "/modpacks" : "/mods";
  const preferenceStorageKey = `mcmods-${projectType}-catalog-preferences`;
  const favoriteStorageKey = `mcmods-favorite-${projectType}s`;
  const {
    paramsKey, preferences, expandedGroups, mobileFiltersOpen, setMobileFiltersOpen,
    queryDraft, setQueryDraft, notice, setNotice, replaceParams, toggleListParam, clearFilters,
    submitSearch, changePreference, toggleGroup, changePage,
  } = useCatalogControls<CatalogSortField>({
    preferenceStorageKey,
    expandedStorageKey,
    filterParams,
    defaultExpandedGroups,
    sortOptions: modSortFields,
    defaultSort: "relevance",
    onPageChange: () => resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  });

  const filters = useMemo(() => parseFilters(new URLSearchParams(paramsKey), preferences, isModpack), [isModpack, paramsKey, preferences]);
  const totalPages = Math.max(1, Math.ceil(backendTotal / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const pageStart = (currentPage - 1) * filters.pageSize;
  const visibleMods = backendMods;
  const selectedFilterCount = countSelectedFilters(filters);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setFavoriteSlugs(readStringSet(favoriteStorageKey));
    });
    return () => { cancelled = true; };
  }, [favoriteStorageKey]);

  useEffect(() => {
    if (!token) return;
    const entityPublicIds = backendMods.map((item) => item.uniqueId);
    if (!entityPublicIds.length) {
      queueMicrotask(() => setFavoriteSlugs(new Set()));
      return;
    }
    let cancelled = false;
    loadFavoriteMembershipSummary(token, projectType, entityPublicIds)
      .then((summary) => {
        if (cancelled) return;
        setFavoriteSlugs(new Set(summary.entityPublicIds));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [backendMods, projectType, token]);

  useEffect(() => {
	let cancelled = false;
	queueMicrotask(() => { if (!cancelled) setLoading(true); });
	const requestParams = new URLSearchParams(paramsKey);
	requestParams.delete("page");
	requestParams.delete("size");
	requestParams.delete("view");
	requestParams.set("sort", filters.sort);
	requestParams.set("order", filters.sortDirection);
	requestParams.set("limit", String(filters.pageSize));
	requestParams.set("offset", String((filters.page - 1) * filters.pageSize));
	apiRequest<BackendModList | BackendModpackList>(`${isModpack ? "/api/v1/modpacks" : "/api/v1/mods"}?${requestParams}`, {}, token)
      .then((result) => {
        if (!cancelled) {
          setBackendMods(isModpack
            ? (result as BackendModpackList).items.map(backendModpackToCatalogEntry)
            : (result as BackendModList).items.map(backendModToCatalogEntry));
          setBackendTotal(result.total);
          setMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBackendMods([]);
          setBackendTotal(0);
          setMessage(error instanceof Error ? error.message : t("mods.empty.description"));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
	}, [filters.page, filters.pageSize, filters.sort, filters.sortDirection, isModpack, paramsKey, reload, t, token]);

  function toggleFavorite(siteId: string) {
    if (token) {
      const target = backendMods.find((item) => item.siteId === siteId);
      if (target) setFavoriteTarget(target);
      return;
    }
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
    const url = `${window.location.origin}${basePath}/${mod.siteId}`;
    try {
      if (navigator.share) await navigator.share({ title: mod.name, url });
      else await navigator.clipboard.writeText(url);
      setNotice(t("mods.notices.linkCopied"));
    } catch {
      // Closing the native share sheet is not an error the page needs to surface.
    }
  }

  const chips = buildFilterChips(filters, t, isModpack, (key, values) => replaceParams({ [key]: values }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <CatalogHero
        actions={<>{!isModpack ? <><Link className="button-secondary focus-ring" href="/mods-tag">{t("globalCatalog.tags.short")}</Link><Link className="button-secondary focus-ring" href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link></> : null}<button className="button-primary focus-ring" type="button" onClick={() => setSubmissionOpen(true)}>{t(isModpack ? "modpacks.submit" : "mods.submit")}</button></>}
        description={t(isModpack ? "modpacks.description" : "mods.description")}
        kicker={t(isModpack ? "modpacks.kicker" : "mods.kicker")}
        title={t(isModpack ? "modpacks.title" : "mods.title")}
        total={t(isModpack ? "modpacks.total" : "mods.total", { count: backendTotal })}
      >
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}>
            <input
              className="field h-12"
              value={queryDraft}
              placeholder={t(isModpack ? "modpacks.searchPlaceholder" : "mods.searchPlaceholder")}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <button className="button-primary focus-ring h-12 px-6" type="submit">{t("mods.search")}</button>
          </form>
      </CatalogHero>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <button className="button-secondary focus-ring" type="button" onClick={() => setMobileFiltersOpen(true)}>
            {t("mods.filterButton", { count: selectedFilterCount })}
          </button>
          <span className="text-sm font-semibold text-[var(--muted)]">{t("mods.results", { count: backendTotal })}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
          <CatalogFilterSidebar>
            <FilterPanel
              expandedGroups={expandedGroups}
              filters={filters}
              minecraftVersionConfig={minecraftVersionConfig}
              isModpack={isModpack}
              token={token}
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
                <div>
                  <h2 className="text-xl font-black">
                    {filters.query
                      ? t("mods.queryResults", { query: filters.query, count: backendTotal })
                      : t("mods.results", { count: backendTotal })}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CatalogSortControl
                    direction={filters.sortDirection}
                    field={filters.sort}
                    fields={modSortFields}
                    onDirectionChange={(sortDirection) => changePreference({ sortDirection })}
                    onFieldChange={(sort) => changePreference({ sort })}
                  />
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

            {loading ? <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</div> : null}
            {message ? <div className="mt-4 rounded-lg border border-[var(--red)] bg-[var(--panel)] p-4"><p className="font-bold text-[var(--red)]">{message}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => setReload((value) => value + 1)}>{t("common.refresh")}</button></div> : null}
            {!loading && !message && visibleMods.length > 0 ? (
              <div className={filters.view === "grid" ? "mt-4 grid gap-4 md:grid-cols-2" : "mt-4 grid gap-4"}>
                {visibleMods.map((mod) => (
                  <ModCard
                    key={mod.siteId}
                    expanded={expandedCards.has(mod.siteId)}
                    favorite={favoriteSlugs.has(mod.uniqueId)}
                    locale={locale}
                    mod={mod}
                    t={t}
                    view={filters.view}
                    basePath={basePath}
                    onViewDownloads={() => window.open(`https://modrinth.com/${isModpack ? "modpack" : "mod"}/${mod.modrinthProjectId || mod.siteId}/versions`, "_blank", "noopener,noreferrer")}
                    onShare={() => void shareMod(mod)}
                    onToggleExpanded={() => setExpandedCards((current) => toggleSet(current, mod.siteId))}
                    onToggleFavorite={() => toggleFavorite(mod.siteId)}
                  />
                ))}
              </div>
            ) : !loading && !message ? (
              <CatalogEmptyState
                clearLabel={t("mods.empty.clear")}
                description={filters.versionMode === "all" && filters.versions.length > 1
                  ? t("mods.empty.versionSuggestion", { versions: filters.versions.join("、") })
                  : t("mods.empty.description")}
                title={t("mods.empty.title")}
                onClear={clearFilters}
              />
            ) : null}

            <CatalogPagination
              currentPage={currentPage}
              pageSize={filters.pageSize}
              totalPages={totalPages}
              labels={{
                previous: t("mods.pagination.previous"),
                next: t("mods.pagination.next"),
                pageSize: t("mods.pagination.pageSize"),
                pageSummary: t("mods.pagination.pageSummary", { page: currentPage, pages: totalPages }),
                itemSummary: t("mods.pagination.itemSummary", {
                  start: backendTotal === 0 ? 0 : pageStart + 1,
                  end: Math.min(pageStart + visibleMods.length, backendTotal),
                  total: backendTotal,
                }),
              }}
              onPageChange={changePage}
              onPageSizeChange={(pageSize) => changePreference({ pageSize })}
            />
          </section>
        </div>
      </div>

      <CatalogMobileFilterDrawer open={mobileFiltersOpen} title={t("mods.filtersTitle")} onClose={() => setMobileFiltersOpen(false)}>
        <FilterPanel
          expandedGroups={expandedGroups}
          filters={filters}
          minecraftVersionConfig={minecraftVersionConfig}
          isModpack={isModpack}
          token={token}
          resultCount={backendTotal}
          t={t}
          onClear={clearFilters}
          onClose={() => setMobileFiltersOpen(false)}
          onGroupToggle={toggleGroup}
          onParamChange={replaceParams}
          onToggleList={toggleListParam}
        />
      </CatalogMobileFilterDrawer>
      {favoriteTarget && token ? <FavoritePickerModal entityType={projectType} entityPublicId={favoriteTarget.uniqueId} title={favoriteTarget.name} token={token} onClose={() => setFavoriteTarget(null)} onSaved={(selected) => {
        setFavoriteSlugs((current) => { const next = new Set(current); if (selected) next.add(favoriteTarget.uniqueId); else next.delete(favoriteTarget.uniqueId); return next; });
        setNotice(t(selected ? "mods.notices.favorited" : "mods.notices.unfavorited"));
        setFavoriteTarget(null);
      }} /> : null}

      {notice ? <div className="fixed bottom-5 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-[var(--foreground)] px-4 py-3 text-center text-sm font-bold text-[var(--background)] shadow-xl" role="status">{notice}</div> : null}
      <ProjectSubmissionModal open={submissionOpen} projectType={projectType} onClose={() => setSubmissionOpen(false)} />
    </main>
  );
}

function FilterPanel({
  expandedGroups,
  filters,
  minecraftVersionConfig,
  isModpack,
  token,
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
  minecraftVersionConfig: MinecraftVersionConfig;
  isModpack: boolean;
  token: string;
  resultCount: number;
  t: Translation;
  onClear: () => void;
  onClose: (() => void) | null;
  onGroupToggle: (group: string, open: boolean) => void;
  onParamChange: (updates: Record<string, string | string[] | number | null>) => void;
  onToggleList: (key: string, value: string) => void;
}) {
  return (
    <CatalogFilterPanel
      clearLabel={t("mods.clearAll")}
      closeLabel={t("common.close")}
      showResultsLabel={onClose ? t("mods.showResults", { count: resultCount }) : undefined}
      title={t("mods.filtersTitle")}
      onClear={onClear}
      onClose={onClose ?? undefined}
      onShowResults={onClose ?? undefined}
    >

      <CatalogFilterGroup group="versions" label={t("mods.groups.versions")} expanded={expandedGroups.has("versions")} onToggle={onGroupToggle}>
        <CatalogMinecraftVersionFilter
          config={minecraftVersionConfig}
          values={filters.versions}
          versionMode={filters.versionMode}
          onChange={(versions) => onParamChange({ version: versions })}
          onVersionModeChange={(mode) => onParamChange({ versionMode: mode === "any" ? null : mode })}
        />
      </CatalogFilterGroup>

      {isModpack ? <CatalogFilterGroup group="containedMods" label={t("modpacks.filters.containedMods")} expanded={expandedGroups.has("containedMods")} onToggle={onGroupToggle}>
        <CatalogContainedModFilter
          buttonLabel={t("modpacks.filters.selectMods")}
          emptyLabel={t("modpacks.filters.noMods")}
          token={token}
          values={filters.mods}
          onChange={(mods) => onParamChange({ mods })}
        />
      </CatalogFilterGroup> : null}

      <CatalogFilterGroup group="loaders" label={t("mods.groups.loaders")} expanded={expandedGroups.has("loaders")} onToggle={onGroupToggle}>
        <CatalogOptionList
          options={minecraftVersionConfig.loaders.map((loader) => loader.code)}
          selected={filters.loaders}
          label={(item) => item}
          onToggle={(item) => onToggleList("loader", item)}
        />
      </CatalogFilterGroup>

      {!isModpack ? <CatalogFilterGroup group="primary" label={t("mods.groups.primary")} expanded={expandedGroups.has("primary")} onToggle={onGroupToggle}>
        <CatalogRadioList options={primaryCategoryOptions} selected={filters.primaryCategories[0] ?? ""} label={(item) => t(`mods.categories.${item}`)} onChange={(item) => onParamChange({ primary: item })} />
      </CatalogFilterGroup> : null}

      <CatalogFilterGroup group="tags" label={t(isModpack ? "modpacks.editor.categories" : "mods.groups.tags")} expanded={expandedGroups.has("tags")} onToggle={onGroupToggle}>
        <CatalogOptionList options={isModpack ? modpackCategoryOptions : tagOptions} selected={filters.tags} label={(item) => t(isModpack ? `modpacks.categories.${item}` : `mods.tags.${item}`)} onToggle={(item) => onToggleList("tag", item)} />
      </CatalogFilterGroup>

      <CatalogFilterGroup group="environment" label={t("mods.groups.environment")} expanded={expandedGroups.has("environment")} onToggle={onGroupToggle}>
        <CatalogOptionList options={environmentOptions} selected={filters.environments} label={(item) => t(`mods.environments.${item}`)} onToggle={(item) => onToggleList("environment", item)} />
      </CatalogFilterGroup>

      <CatalogFilterGroup group="status" label={t("mods.groups.status")} expanded={expandedGroups.has("status")} onToggle={onGroupToggle}>
        <CatalogOptionList options={maintenanceOptions} selected={filters.statuses} label={(item) => t(`mods.statuses.${item}`)} onToggle={(item) => onToggleList("status", item)} />
      </CatalogFilterGroup>

      <CatalogFilterGroup group="source" label={t("mods.groups.source")} expanded={expandedGroups.has("source")} onToggle={onGroupToggle}>
        <CatalogOptionList options={sourceOptions} selected={filters.sources} label={(item) => t(`mods.sources.${item}`)} onToggle={(item) => onToggleList("source", item)} />
        <div className="my-3 border-t border-[var(--line)]" />
        <p className="mb-2 text-xs font-bold text-[var(--muted)]">{t("mods.licenseLabel")}</p>
        <CatalogOptionList options={licenseOptions} selected={filters.licenses} label={(item) => item} onToggle={(item) => onToggleList("license", item)} />
      </CatalogFilterGroup>

      <CatalogFilterGroup group="updated" label={t("mods.groups.updated")} expanded={expandedGroups.has("updated")} onToggle={onGroupToggle}>
        <CatalogRadioList options={updatedOptions} selected={filters.updated || "all"} label={(item) => t(`mods.updated.${item}`)} onChange={(item) => onParamChange({ updated: item === "all" ? null : item })} />
      </CatalogFilterGroup>

      <CatalogFilterGroup group="advanced" label={t("mods.groups.advanced")} expanded={expandedGroups.has("advanced")} onToggle={onGroupToggle}>
        <CatalogOptionList options={advancedOptions} selected={filters.features} label={(item) => t(`mods.features.${item}`)} onToggle={(item) => onToggleList("feature", item)} />
      </CatalogFilterGroup>
    </CatalogFilterPanel>
  );
}

function ModCard({ mod, view, locale, t, favorite, expanded, basePath, onToggleFavorite, onViewDownloads, onShare, onToggleExpanded }: {
  mod: ModCatalogEntry;
  view: CatalogView;
  locale: string;
  t: Translation;
  favorite: boolean;
  expanded: boolean;
  basePath: string;
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
  const stale = catalogReferenceTime - Date.parse(mod.updatedAt) > 730 * 86_400_000;
  const cardClass = view === "list"
    ? "grid gap-4 p-4 lg:grid-cols-[96px_minmax(0,1fr)_190px]"
    : "flex h-full flex-col p-4";

  function openDetails() {
    router.push(`${basePath}/${mod.siteId}`);
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
        {mod.icon ? <Image unoptimized className="aspect-square h-20 w-20 shrink-0 rounded-lg object-cover [image-rendering:auto] lg:h-24 lg:w-24" src={mod.icon} alt={t("mods.card.iconAlt", { name: displayName })} width={96} height={96} /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] text-2xl font-black text-[var(--accent)] lg:h-24 lg:w-24" aria-label={t("mods.card.iconAlt", { name: displayName })}>{displayName.trim().slice(0, 1).toUpperCase() || "M"}</div>}
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
        {mod.links?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{mod.links.slice(0, 5).map((link, index) => <a className="focus-ring rounded-md border border-[var(--line)] px-2 py-1 text-[11px] font-bold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]" href={link.url} key={`${link.type}-${index}`} rel="noreferrer" target="_blank" title={link.note || t(`mods.submission.linkTypes.${link.type}`)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{t(`mods.submission.linkTypes.${link.type}`)}</a>)}</div> : null}

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


function parseFilters(params: URLSearchParams, preferences: CatalogPreferences<CatalogSortField>, isModpack: boolean) {
  const pageSize = [20, 40, 60].includes(Number(params.get("size"))) ? Number(params.get("size")) : preferences.pageSize;
  const view = params.get("view") === "grid" || params.get("view") === "list" ? params.get("view") as CatalogView : preferences.view;
  const rawSort = params.get("sort");
  const normalizedSort = normalizeCatalogSortField(rawSort, preferences.sort);
  const sort = modSortFields.includes(normalizedSort) ? normalizedSort : preferences.sort;
  const sortDirection = normalizeCatalogSortDirection(params.get("order"), preferences.sortDirection, sort);
  return {
    query: params.get("q")?.trim() ?? "",
    versions: readList(params, "version"),
    versionMode: params.get("versionMode") === "all" ? "all" as const : "any" as const,
    loaders: readList(params, "loader"),
    mods: isModpack ? readList(params, "mods") : [],
    primaryCategories: readList(params, "primary").slice(0, 1),
    tags: readList(params, "tag"),
    environments: readList(params, "environment"),
    statuses: readList(params, "status"),
    sources: readList(params, "source"),
    licenses: readList(params, "license"),
    updated: params.get("updated") ?? "",
    features: readList(params, "feature") as ModFeature[],
    sort,
    sortDirection,
    view,
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize,
  };
}

function buildFilterChips(filters: CatalogFilters, t: Translation, isModpack: boolean, update: (key: string, values: string[]) => void): FilterChip[] {
  const groups: Array<[string, string[], (value: string) => string]> = [
    ["version", filters.versions, (value) => value],
    ["loader", filters.loaders, (value) => value],
    ["primary", filters.primaryCategories, (value) => t(`mods.categories.${value}`)],
    ["tag", filters.tags, (value) => t(isModpack ? `modpacks.categories.${value}` : `mods.tags.${value}`)],
    ...(isModpack ? [["mods", filters.mods, (value: string) => t("modpacks.filters.containedModChip", { mod: value })] as [string, string[], (value: string) => string]] : []),
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
  return filters.versions.length + filters.loaders.length + filters.primaryCategories.length + filters.tags.length + filters.mods.length + filters.environments.length + filters.statuses.length + filters.sources.length + filters.licenses.length + filters.features.length + (filters.updated ? 1 : 0);
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

function formatCompact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function modDescription(mod: ModCatalogEntry, t: Translation) {
  if (mod.summary) return mod.summary;
  return mod.descriptionKey ? t(mod.descriptionKey) : "";
}
