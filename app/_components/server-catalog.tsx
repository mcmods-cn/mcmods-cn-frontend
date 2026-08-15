"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { formatMinecraftLanguages } from "../_lib/minecraft-languages";
import {
  ServerCatalogItem,
  ServerCatalogResponse,
  serverPrimaryTags,
} from "../_lib/server-api";
import {
  CatalogEmptyState,
  CatalogFilterGroup,
  CatalogFilterPanel,
  CatalogFilterSidebar,
  CatalogMobileFilterDrawer,
  CatalogOptionList,
  CatalogRadioList,
  CatalogPagination,
} from "./catalog-list-ui";
import {
  modIdentifierFromResource,
  ModResourceSelectionField,
  unresolvedModResource,
} from "./editor/mod-resource-picker";
import { MinecraftLanguagePicker } from "./minecraft-language-picker";
import { MinecraftVersionPicker } from "./minecraft-version-picker";

const serverPageSizes = [20, 40, 60];
const serverSortOptions = ["heat", "updated", "nameAsc", "nameDesc"] as const;

export function ServerCatalog() {
  const { t } = useI18n();
  const { token, user, ready } = useAuthSnapshot();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");
  const [result, setResult] = useState<ServerCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const requestedPageSize = Number(searchParams.get("size"));
  const pageSize = serverPageSizes.includes(requestedPageSize) ? requestedPageSize : serverPageSizes[0];

  const canCreate = ready && hasPermission(user, "server.create");
  const activeFilterCount = useMemo(
    () => ["tag", "language", "version", "mods", "modded", "online", "whitelist", "onlineMode"].filter((key) => searchParams.has(key)).length,
    [searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
    });
    const query = new URLSearchParams(paramsKey);
    query.delete("size");
    query.set("limit", String(pageSize));
    apiRequest<ServerCatalogResponse>(`/api/v1/servers?${query.toString()}`, {}, token)
      .then((response) => {
        if (!cancelled) setResult(response);
      })
      .catch((reason) => {
        if (!cancelled) {
          setResult(null);
          setError(reason instanceof Error ? reason.message : t("servers.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageSize, paramsKey, t, token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQueryDraft(searchParams.get("q") ?? "");
    });
    return () => { cancelled = true; };
  }, [searchParams]);

  function replaceParams(updates: Record<string, string | number | null>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage && !("page" in updates)) next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    replaceParams({ q: queryDraft.trim() || null });
  }

  function clearFilters() {
    replaceParams({
      tag: null,
      language: null,
      version: null,
      mods: null,
      modded: null,
      online: null,
      whitelist: null,
      onlineMode: null,
    });
  }

  const filters = (onClose?: () => void) => (
    <ServerFilters
      resultCount={result?.total ?? 0}
      onClear={clearFilters}
      onClose={onClose}
      onChange={replaceParams}
      params={searchParams}
    />
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-7xl px-4 py-7 lg:py-9">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--accent)]">{t("servers.kicker")}</p>
              <h1 className="mt-1 text-3xl font-black md:text-4xl">{t("servers.title")}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("servers.intro")}</p>
            </div>
            {canCreate ? (
              <Link
                className="button-primary focus-ring"
                href="/servers/new"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("servers.addServer")}
              </Link>
            ) : null}
          </header>
          <form className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="server-search">{t("servers.search")}</label>
            <input
              className="field h-12"
              id="server-search"
              placeholder={t("servers.searchPlaceholder")}
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <button className="button-primary focus-ring h-12 px-6" type="submit">{t("common.search")}</button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <button className="button-secondary focus-ring" type="button" onClick={() => setMobileFiltersOpen(true)}>
            {t("servers.filters.button", { count: activeFilterCount })}
          </button>
          <span className="text-sm font-semibold text-[var(--muted)]">
            {loading ? t("common.loading") : t("servers.resultCount", { count: result?.total ?? 0 })}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
          <CatalogFilterSidebar>{filters()}</CatalogFilterSidebar>
          <section className="min-w-0">
            <div className="border-b border-[var(--line)] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">
                  {searchParams.get("q")
                    ? t("servers.queryResults", { query: searchParams.get("q") ?? "", count: result?.total ?? 0 })
                    : t("servers.resultCount", { count: result?.total ?? 0 })}
                </h2>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="server-catalog-sort">{t("servers.sortLabel")}</label>
                  <select className="field h-10 min-w-36 py-0" id="server-catalog-sort" value={searchParams.get("sort") ?? "heat"} onChange={(event) => replaceParams({ sort: event.target.value })}>
                    {serverSortOptions.map((sort) => <option key={sort} value={sort}>{t(`servers.sort.${sort}`)}</option>)}
                  </select>
                  {!canCreate && ready ? <p className="text-xs text-[var(--muted)]">{t(user ? "servers.permissionRequired" : "servers.loginToSubmit")}</p> : null}
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {activeFilterCount ? t("servers.activeFilters", { count: activeFilterCount }) : t("servers.noActiveFilters")}
              </p>
            </div>

            {error ? <div className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-5 font-bold text-[var(--danger)]">{error}</div> : null}
            {loading ? <div className="mt-4"><ServerListSkeleton /></div> : null}
            {!loading && result?.items.length ? (
              <div className="mt-4 grid gap-4">
                {result.items.map((server) => <ServerCard key={server.id} server={server} />)}
              </div>
            ) : null}
            {!loading && !error && result?.items.length === 0 ? (
              <CatalogEmptyState
                clearLabel={t("servers.clearFilters")}
                description={t("servers.emptyHint")}
                title={t("servers.empty")}
                onClear={clearFilters}
              />
            ) : null}
            {result ? (
              <CatalogPagination
                currentPage={result.page}
                labels={{
                  previous: t("common.previous"),
                  next: t("common.next"),
                  pageSize: t("servers.pageSize"),
                  pageSummary: t("servers.pageSummary", { page: result.page, pages: result.pages }),
                  itemSummary: t("servers.itemSummary", {
                    start: result.total === 0 ? 0 : (result.page - 1) * result.limit + 1,
                    end: result.total === 0 ? 0 : Math.min(result.page * result.limit, result.total),
                    total: result.total,
                  }),
                }}
                pageSize={pageSize}
                pageSizes={serverPageSizes}
                totalPages={Math.max(1, result.pages)}
                onPageChange={(page) => replaceParams({ page }, false)}
                onPageSizeChange={(size) => replaceParams({ size })}
              />
            ) : null}
          </section>
        </div>
      </div>

      <CatalogMobileFilterDrawer open={mobileFiltersOpen} title={t("servers.filters.title")} onClose={() => setMobileFiltersOpen(false)}>
        {filters(() => setMobileFiltersOpen(false))}
      </CatalogMobileFilterDrawer>
    </main>
  );
}

function ServerFilters({
  params,
  resultCount,
  onChange,
  onClear,
  onClose,
}: {
  params: URLSearchParams;
  resultCount: number;
  onChange: (updates: Record<string, string | number | null>) => void;
  onClear: () => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const modFilterValue = params.get("mods") ?? "";
  const modIdentifiers = parseModIdentifiers(modFilterValue);
  const [selectedMods, setSelectedMods] = useState<CatalogResourceRef[]>(
    () => modIdentifiers.map(unresolvedModResource),
  );
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedMods((current) => parseModIdentifiers(modFilterValue).map((identifier) =>
        current.find((resource) => modIdentifierFromResource(resource) === identifier)
        ?? unresolvedModResource(identifier)));
    });
    return () => { cancelled = true; };
  }, [modFilterValue]);
  const selectedStatuses = [
    ...(params.get("online") === "true" ? ["online"] : []),
    ...(params.get("modded") === "true" ? ["modded"] : []),
  ];
  return (
    <CatalogFilterPanel
      clearLabel={t("servers.clearFilters")}
      closeLabel={t("common.close")}
      showResultsLabel={onClose ? t("servers.showResults", { count: resultCount }) : undefined}
      title={t("servers.filters.title")}
      onClear={onClear}
      onClose={onClose}
      onShowResults={onClose}
    >
      <CatalogFilterGroup label={t("servers.filters.category")}>
        <CatalogRadioList
          options={["", ...serverPrimaryTags]}
          selected={params.get("tag") ?? ""}
          label={(tag) => tag ? t(`servers.tags.${tag}`) : t("common.all")}
          onChange={(tag) => onChange({ tag: tag || null })}
        />
      </CatalogFilterGroup>
      <CatalogFilterGroup label={t("servers.filters.status")}>
        <CatalogOptionList
          options={["online", "modded"]}
          selected={selectedStatuses}
          label={(status) => t(status === "online" ? "servers.online" : "servers.modded")}
          onToggle={(status) => onChange({ [status]: params.get(status) === "true" ? null : "true" })}
        />
      </CatalogFilterGroup>
      <CatalogFilterGroup label={t("servers.filters.version")}>
        <MinecraftVersionPicker
          multiple={false}
          values={params.get("version") ? [params.get("version") ?? ""] : []}
          onChange={(versions) => onChange({ version: versions[0] || null })}
        />
      </CatalogFilterGroup>
      <CatalogFilterGroup label={t("servers.filters.mods")}>
        <ModResourceSelectionField
          buttonLabel={t("servers.filters.selectMods")}
          emptyLabel={t("servers.filters.noMods")}
          token=""
          value={selectedMods}
          onChange={(resources) => {
            setSelectedMods(resources);
            const identifiers = resources.map(modIdentifierFromResource).filter(Boolean);
            onChange({ mods: identifiers.length ? identifiers.join(",") : null });
          }}
        />
      </CatalogFilterGroup>
      <CatalogFilterGroup label={t("servers.filters.language")}>
        <MinecraftLanguagePicker
          allowEmpty
          emptyLabel={t("common.all")}
          multiple={false}
          title={t("servers.filters.selectLanguage")}
          values={params.get("language") ? [params.get("language") ?? ""] : []}
          onChange={(values) => onChange({ language: values[0] ?? null })}
        />
      </CatalogFilterGroup>
      <CatalogFilterGroup label={t("servers.filters.rules")}>
        <div className="grid gap-2">
          <TriStateFilter label={t("servers.whitelist")} param="whitelist" params={params} onChange={onChange} />
          <TriStateFilter label={t("servers.onlineMode")} param="onlineMode" params={params} onChange={onChange} />
        </div>
      </CatalogFilterGroup>
    </CatalogFilterPanel>
  );
}

function TriStateFilter({ label, param, params, onChange }: { label: string; param: string; params: URLSearchParams; onChange: (updates: Record<string, string | null>) => void }) {
  const { t } = useI18n();
  return (
    <label className="grid grid-cols-[1fr_100px] items-center gap-3 text-sm font-bold">
      {label}
      <select className="field py-2" value={params.get(param) ?? ""} onChange={(event) => onChange({ [param]: event.target.value || null })}>
        <option value="">{t("common.all")}</option>
        <option value="true">{t("common.yes")}</option>
        <option value="false">{t("common.no")}</option>
      </select>
    </label>
  );
}

function ServerCard({ server }: { server: ServerCatalogItem }) {
  const { t } = useI18n();
  return (
    <Link className="group grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center" href={`/servers/${server.id}`}>
      {server.iconDataUri
        ? <img alt="" className="h-[72px] w-[72px] rounded-lg border border-[var(--line)] object-cover [image-rendering:pixelated]" height={72} src={server.iconDataUri} width={72} />
        : <span className="grid h-[72px] w-[72px] place-items-center rounded-lg bg-[var(--panel-subtle)] text-3xl font-black text-[var(--muted)]">?</span>}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-black group-hover:text-[var(--accent)]">{server.name}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${server.online ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>
            {t(server.online ? "servers.online" : "servers.offline")}
          </span>
          {server.modded ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-black text-[var(--accent)]">{server.loader || t("servers.modded")}</span> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{server.shortDescription || t("servers.noSummary")}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--muted)]">
          <span>{t(`servers.tags.${server.primaryTag}`)}</span>
          <span>{formatMinecraftLanguages(server.languages)}</span>
          <span>{server.minecraftVersions.slice(0, 3).join(" · ")}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-1 sm:text-right">
        <span><strong className="block text-lg">{server.online ? `${server.playersOnline}/${server.playersMax}` : "—"}</strong><small className="text-[var(--muted)]">{t("servers.players")}</small></span>
        <span><strong className={`block text-lg ${latencyClass(server.latencyMs)}`}>{typeof server.latencyMs === "number" ? `${server.latencyMs} ms` : "—"}</strong><small className="text-[var(--muted)]">{t("servers.latency")}</small></span>
      </div>
    </Link>
  );
}

function latencyClass(latency?: number) {
  if (typeof latency !== "number") return "text-[var(--muted)]";
  if (latency < 100) return "text-[var(--success)]";
  if (latency < 250) return "text-[var(--warning)]";
  return "text-[var(--danger)]";
}

function ServerListSkeleton() {
  return <div className="grid gap-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-[var(--panel-subtle)]" />)}</div>;
}

function parseModIdentifiers(value: string | null) {
  return [...new Set((value ?? "")
    .split(",")
    .map((identifier) => identifier.trim().toLowerCase())
    .filter(Boolean))];
}
