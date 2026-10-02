"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { type CatalogSortDirection, normalizeCatalogSortDirection } from "./catalog-sort";

export type CatalogView = "list" | "grid";

export type CatalogPreferences<TSort extends string = string> = {
  view: CatalogView;
  pageSize: number;
  sort: TSort;
  sortDirection: CatalogSortDirection;
};

export type CatalogTranslation = (key: string, params?: Record<string, string | number>) => string;

export type CatalogFilterChip = {
  id: string;
  label: string;
  remove: () => void;
};

export type CatalogParamValue = string | string[] | number | null;

type CatalogControlOptions<TSort extends string> = {
  preferenceStorageKey: string;
  expandedStorageKey: string;
  filterParams: readonly string[];
  defaultExpandedGroups: readonly string[];
  sortOptions: readonly TSort[];
  defaultSort: TSort;
  defaultSortDirection?: CatalogSortDirection;
  onPageChange: () => void;
};

export function useCatalogControls<TSort extends string>(options: CatalogControlOptions<TSort>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preferences, setPreferences] = useState<CatalogPreferences<TSort>>({
    view: "list",
    pageSize: 20,
    sort: options.defaultSort,
    sortDirection: options.defaultSortDirection ?? "desc",
  });
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(options.defaultExpandedGroups));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");
  const [notice, setNotice] = useState("");
  const paramsKey = searchParams.toString();
  const defaultExpandedGroupsKey = JSON.stringify(options.defaultExpandedGroups);
  const filterParamsKey = JSON.stringify(options.filterParams);
  const sortOptionsKey = JSON.stringify(options.sortOptions);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPreferences(readCatalogPreferences(
        options.preferenceStorageKey,
        JSON.parse(sortOptionsKey) as TSort[],
        options.defaultSort,
        options.defaultSortDirection ?? "desc",
      ));
      setExpandedGroups(readStoredStringSet(
        options.expandedStorageKey,
        JSON.parse(defaultExpandedGroupsKey) as string[],
      ));
    });
    return () => { cancelled = true; };
  }, [defaultExpandedGroupsKey, options.defaultSort, options.defaultSortDirection, options.expandedStorageKey, options.preferenceStorageKey, sortOptionsKey]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQueryDraft(new URLSearchParams(paramsKey).get("q") ?? "");
    });
    return () => { cancelled = true; };
  }, [paramsKey]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileFiltersOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const replaceParams = useCallback((updates: Record<string, CatalogParamValue>, resetPage = true) => {
    const next = new URLSearchParams(paramsKey);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) next.delete(key);
      else next.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    if (resetPage && !("page" in updates)) next.delete("page");
    const query = next.toString();
    if (query === paramsKey) return;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [paramsKey, pathname, router]);

  const toggleListParam = useCallback((key: string, value: string) => {
    const current = readCatalogList(new URLSearchParams(paramsKey), key);
    replaceParams({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }, [paramsKey, replaceParams]);

  const clearFilters = useCallback(() => {
    const filterParams = JSON.parse(filterParamsKey) as string[];
    replaceParams(Object.fromEntries(filterParams.map((key) => [key, null])));
  }, [filterParamsKey, replaceParams]);

  const submitSearch = useCallback((event: FormEvent) => {
    event.preventDefault();
    replaceParams({ q: queryDraft.trim() || null });
  }, [queryDraft, replaceParams]);

  const changePreference = useCallback((next: Partial<CatalogPreferences<TSort>>) => {
    const value = { ...preferences, ...next };
    setPreferences(value);
    window.localStorage.setItem(options.preferenceStorageKey, JSON.stringify(value));
    replaceParams({
      ...(next.view ? { view: next.view } : {}),
      ...(next.pageSize ? { size: next.pageSize } : {}),
      ...(next.sort ? { sort: next.sort } : {}),
      ...(next.sortDirection ? { order: next.sortDirection } : {}),
    });
  }, [options.preferenceStorageKey, preferences, replaceParams]);

  const toggleGroup = useCallback((group: string, open: boolean) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (open) next.add(group);
      else next.delete(group);
      window.localStorage.setItem(options.expandedStorageKey, JSON.stringify([...next]));
      return next;
    });
  }, [options.expandedStorageKey]);

  const changePage = useCallback((page: number) => {
    replaceParams({ page }, false);
    window.requestAnimationFrame(options.onPageChange);
  }, [options.onPageChange, replaceParams]);

  return {
    searchParams,
    paramsKey,
    preferences,
    expandedGroups,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    queryDraft,
    setQueryDraft,
    notice,
    setNotice,
    replaceParams,
    toggleListParam,
    clearFilters,
    submitSearch,
    changePreference,
    toggleGroup,
    changePage,
  };
}

export function readCatalogList(params: Pick<URLSearchParams, "get">, key: string) {
  return (params.get(key) ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readCatalogPreferences<TSort extends string>(
  storageKey: string,
  sortOptions: readonly TSort[],
  defaultSort: TSort,
  defaultSortDirection: CatalogSortDirection,
): CatalogPreferences<TSort> {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<CatalogPreferences<TSort>>;
    const sort = value.sort && sortOptions.includes(value.sort) ? value.sort : defaultSort;
    return {
      view: value.view === "grid" ? "grid" : "list",
      pageSize: [20, 40, 60].includes(Number(value.pageSize)) ? Number(value.pageSize) : 20,
      sort,
      sortDirection: normalizeCatalogSortDirection(value.sortDirection, defaultSortDirection, sort),
    };
  } catch {
    return { view: "list", pageSize: 20, sort: defaultSort, sortDirection: defaultSortDirection };
  }
}

export function readStoredStringSet(key: string, fallback: string[] = []) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return new Set(fallback);
    const value = JSON.parse(stored) as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback);
  } catch {
    return new Set(fallback);
  }
}
