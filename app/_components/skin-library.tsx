"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { type CatalogSortDirection, type CatalogSortField } from "../_lib/catalog-sort";
import { useI18n } from "../_lib/i18n-provider";
import { loadSkins, SkinKind, SkinListResponse, SkinModel, skinTextureURL, SkinTexture } from "../_lib/skin-api";
import { SkinPreview2D } from "./skin-preview";
import { CatalogHero, CatalogSortControl } from "./catalog-list-ui";

const pageSize = 36;
const skinSortFields: CatalogSortField[] = ["published", "updated", "heat", "views", "downloads", "name"];

export function SkinLibrary() {
  const { token, user } = useAuthSnapshot();
  return <SkinLibraryContent key={`${user?.id || "guest"}:${token}`} />;
}

function SkinLibraryContent() {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState<"" | SkinKind>("");
  const [model, setModel] = useState<"" | SkinModel>("");
  const [sort, setSort] = useState<CatalogSortField>("published");
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>("desc");
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [records, setRecords] = useState<SkinListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setLoading(true); setError(""); } });
    const cursor = cursorHistory[cursorHistory.length - 1] || "";
    loadSkins({ q: submittedQuery, kind, model: kind === "cape" ? "" : model, sort, order: sortDirection, limit: pageSize, cursor }, token || undefined)
      .then((result) => { if (!cancelled) setRecords(result); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("skins.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cursorHistory, kind, loadAttempt, model, ready, sort, sortDirection, submittedQuery, t, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    setCursorHistory([""]);
    setSubmittedQuery(query.trim());
  }

  const start = records?.items.length ? (cursorHistory.length - 1) * pageSize + 1 : 0;
  const end = start ? start + (records?.items.length ?? 0) - 1 : 0;
  const showPagination = cursorHistory.length > 1 || Boolean(records?.hasMore);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <CatalogHero
        actions={<>{token ? <Link className="button-secondary focus-ring" href="/user?section=players">{t("skins.manageProfiles")}</Link> : null}<Link className="button-primary focus-ring" href={token ? "/skins/upload" : "/login?next=/skins/upload"}>{t("skins.upload")}</Link></>}
        description={t("skins.subtitle")}
        kicker={t("skins.kicker")}
        title={t("skins.title")}
      >
          <form className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_150px_150px_minmax(280px,auto)_auto]" onSubmit={search}>
            <input aria-label={t("skins.searchPlaceholder")} className="field h-12" type="search" value={query} placeholder={t("skins.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label={t("skins.kind")} className="field h-12" value={kind} onChange={(event) => { setKind(event.target.value as "" | SkinKind); setCursorHistory([""]); }}>
              <option value="">{t("skins.allKinds")}</option>
              <option value="skin">{t("skins.kindSkin")}</option>
              <option value="cape">{t("skins.kindCape")}</option>
            </select>
            <select aria-label={t("skins.model")} className="field h-12" disabled={kind === "cape"} value={model} onChange={(event) => { setModel(event.target.value as "" | SkinModel); setCursorHistory([""]); }}>
              <option value="">{t("skins.allModels")}</option>
              <option value="default">{t("skins.modelDefault")}</option>
              <option value="slim">{t("skins.modelSlim")}</option>
            </select>
            <CatalogSortControl className="min-h-12 lg:flex-nowrap" direction={sortDirection} field={sort} fields={skinSortFields} onDirectionChange={(value) => { setSortDirection(value); setCursorHistory([""]); }} onFieldChange={(value) => { setSort(value); setCursorHistory([""]); }} />
            <button className="button-primary focus-ring h-12 px-6" type="submit">{t("home.searchAction")}</button>
          </form>
      </CatalogHero>

      <section className="mx-auto max-w-7xl px-4 py-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>{t("skins.cursorResults", { start, end })}</span>
          <button className="font-bold text-[var(--accent)] hover:underline" type="button" onClick={() => { setCursorHistory([""]); setSubmittedQuery(""); setQuery(""); setKind(""); setModel(""); setSort("published"); setSortDirection("desc"); }}>{t("skins.resetFilters")}</button>
        </div>
        {error ? <div className="surface rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-4 text-sm font-bold text-[var(--red)]"><p role="alert">{error}</p><button className="button-secondary focus-ring mt-2" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
        {loading ? <p className="py-20 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
        {!loading && !error && records?.items.length === 0 ? <p className="surface rounded-lg p-12 text-center text-[var(--muted)]">{t("skins.empty")}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {records?.items.map((texture) => <SkinCard key={texture.publicId} locale={locale} texture={texture} />)}
        </div>
        {showPagination ? (
          <nav className="mt-7 flex items-center justify-center gap-3" aria-label={t("skins.pagination")}>
            <button className="button-secondary focus-ring" disabled={cursorHistory.length <= 1 || loading} type="button" onClick={() => setCursorHistory((history) => history.slice(0, -1))}>{t("skins.previous")}</button>
            <span className="text-sm font-bold text-[var(--muted)]">{t("skins.cursorPage", { page: cursorHistory.length })}</span>
            <button className="button-secondary focus-ring" disabled={!records?.hasMore || !records.nextCursor || loading} type="button" onClick={() => setCursorHistory((history) => [...history, records?.nextCursor || ""])}>{t("skins.next")}</button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function SkinCard({ texture, locale }: { texture: SkinTexture; locale: string }) {
  const { t } = useI18n();
  const owner = texture.owner?.username || t("skins.anonymous");
  return (
    <article className="surface group flex min-h-80 flex-col overflow-hidden rounded-lg transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-xl">
      <Link className="focus-ring relative block h-52 bg-[var(--panel-subtle)]" href={`/skins/${texture.publicId}`}>
        <SkinPreview2D className="h-full w-full p-4 transition group-hover:scale-[1.03]" kind={texture.kind} label={texture.name} model={texture.model} src={skinTextureURL(texture)} />
        <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-black text-white backdrop-blur">
          {texture.kind === "cape" ? t("skins.kindCape") : texture.model === "slim" ? t("skins.modelSlim") : t("skins.modelDefault")}
        </span>
        {texture.inWardrobe ? <span className="absolute right-3 top-3 rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-black text-[var(--on-accent)]">{t("skins.inWardrobe")}</span> : null}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="truncate text-lg font-black"><Link className="hover:text-[var(--accent)]" href={`/skins/${texture.publicId}`}>{texture.name}</Link></h2>
        <code className="mt-1 text-xs text-[var(--muted)]">{texture.publicId}</code>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {texture.tags.slice(0, 4).map((tag) => <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-[11px] font-bold text-[var(--muted)]" key={tag}>#{tag}</span>)}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">
          <span className="min-w-0 truncate">{owner}<span className="mt-1 block">{formatDate(texture.createdAt, locale)}</span></span>
          <span className="shrink-0 font-bold">↓ {Math.max(0, texture.downloads || 0).toLocaleString(locale)}</span>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
