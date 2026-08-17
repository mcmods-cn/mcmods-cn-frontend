"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { type CatalogSortDirection, type CatalogSortField, coreCatalogSortFields } from "../_lib/catalog-sort";
import { CreatorKind, CreatorSummary, creatorHref } from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { CatalogHero, CatalogSortControl } from "./catalog-list-ui";

const creatorSortFields: CatalogSortField[] = [...coreCatalogSortFields, "relevance", "name"];

export function CreatorCatalog() {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [kind, setKind] = useState<"" | CreatorKind>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSortField>("name");
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>("asc");
  const [items, setItems] = useState<CreatorSummary[]>([]);
  const [counts, setCounts] = useState({ author: 0, team: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (kind) params.set("kind", kind);
      if (query.trim()) params.set("query", query.trim());
      params.set("sort", sort);
      params.set("order", sortDirection);
      apiRequest<{ items: CreatorSummary[]; counts?: { author: number; team: number } }>(`/api/v1/creators?${params}`, {}, token || undefined)
        .then((result) => {
          if (!cancelled) {
            setItems(result.items);
            if (result.counts) {
              setCounts(result.counts);
            } else if (!kind) {
              setCounts({
                author: result.items.filter((item) => item.kind === "author").length,
                team: result.items.filter((item) => item.kind === "team").length,
              });
            }
            setMessage("");
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(error instanceof Error ? error.message : t("creators.loadFailed"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, query, sort, sortDirection, t, token]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <CatalogHero
        actions={token ? <Link className="button-primary focus-ring" href="/authors/new">+ {t("creators.create")}</Link> : null}
        description={t("creators.description")}
        kicker={t("creators.kicker")}
        title={t("creators.title")}
      >
          <div className="grid gap-2 lg:grid-cols-[auto_minmax(260px,1fr)_minmax(280px,auto)]">
            <div className="flex h-12 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--background)] p-1">
              <FilterButton active={kind === ""} onClick={() => setKind("")}>{t("creators.allKinds")}</FilterButton>
              <FilterButton active={kind === "author"} onClick={() => setKind("author")}>{t("creators.kinds.author")} {counts.author}</FilterButton>
              <FilterButton active={kind === "team"} onClick={() => setKind("team")}>{t("creators.kinds.team")} {counts.team}</FilterButton>
            </div>
            <input className="field h-12" value={query} placeholder={t("creators.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            <CatalogSortControl className="min-h-12 lg:flex-nowrap" direction={sortDirection} field={sort} fields={creatorSortFields} onDirectionChange={setSortDirection} onFieldChange={setSort} />
          </div>
      </CatalogHero>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {message ? <p className="mt-4 rounded-lg border border-[var(--red)] p-4 font-bold text-[var(--red)]">{message}</p> : null}
        {loading ? <p className="py-16 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
        {!loading && !items.length ? <p className="py-16 text-center text-[var(--muted)]">{t("creators.noResults")}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((creator) => (
            <Link className="focus-ring group flex min-w-0 gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg" href={creatorHref(creator)} key={creator.publicId}>
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] text-2xl font-black text-[var(--accent)]">
                {creator.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-full w-full object-cover" src={creator.avatarUrl} />
                ) : creator.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-lg font-black group-hover:text-[var(--accent)]">{creator.name}</span>
                  {creator.claimed ? <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t("creators.claimed")}</span> : null}
                  {creator.reviewStatus && creator.reviewStatus !== "approved" ? <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold">{t(`creators.reviewStatuses.${creator.reviewStatus}`)}</span> : null}
                </span>
                <span className="mt-1 block font-mono text-xs text-[var(--muted)]">{creator.publicId}</span>
                <span className="mt-4 block text-sm font-semibold text-[var(--muted)]">
                  {t(`creators.kinds.${creator.kind}`)} · {t("creators.workCount", { count: creator.workCount })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`focus-ring whitespace-nowrap rounded-md px-4 py-2 text-sm font-black ${active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={onClick}>{children}</button>;
}
