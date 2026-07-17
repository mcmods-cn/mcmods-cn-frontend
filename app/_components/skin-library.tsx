"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadSkins, SkinKind, SkinListResponse, SkinModel, skinTextureURL, SkinTexture } from "../_lib/skin-api";
import { SkinPreview2D } from "./skin-preview";

const pageSize = 36;

export function SkinLibrary() {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState<"" | SkinKind>("");
  const [model, setModel] = useState<"" | SkinModel>("");
  const [sort, setSort] = useState("latest");
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<SkinListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setLoading(true); setError(""); } });
    loadSkins({ q: submittedQuery, kind, model: kind === "cape" ? "" : model, sort, limit: pageSize, offset }, token || undefined)
      .then((result) => { if (!cancelled) setRecords(result); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("skins.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, model, offset, ready, sort, submittedQuery, t, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query.trim());
  }

  const total = records?.total ?? 0;
  const start = total ? offset + 1 : 0;
  const end = Math.min(total, offset + (records?.items.length ?? 0));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-sm font-bold text-[var(--accent)]">{t("skins.kicker")}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">{t("skins.title")}</h1>
              <p className="mt-2 max-w-3xl text-[var(--muted)]">{t("skins.subtitle")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {token ? <Link className="button-secondary focus-ring" href="/user?section=players">{t("skins.manageProfiles")}</Link> : null}
              <Link className="button-primary focus-ring" href={token ? "/skins/upload" : "/login?next=/skins/upload"}>{t("skins.upload")}</Link>
            </div>
          </div>
          <form className="mt-6 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_170px_170px_auto]" onSubmit={search}>
            <input className="field" value={query} placeholder={t("skins.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            <select className="field" value={kind} onChange={(event) => { setKind(event.target.value as "" | SkinKind); setOffset(0); }}>
              <option value="">{t("skins.allKinds")}</option>
              <option value="skin">{t("skins.kindSkin")}</option>
              <option value="cape">{t("skins.kindCape")}</option>
            </select>
            <select className="field" disabled={kind === "cape"} value={model} onChange={(event) => { setModel(event.target.value as "" | SkinModel); setOffset(0); }}>
              <option value="">{t("skins.allModels")}</option>
              <option value="default">{t("skins.modelDefault")}</option>
              <option value="slim">{t("skins.modelSlim")}</option>
            </select>
            <select className="field" value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}>
              <option value="latest">{t("skins.sortLatest")}</option>
              <option value="downloads">{t("skins.sortDownloads")}</option>
              <option value="name">{t("skins.sortName")}</option>
            </select>
            <button className="button-secondary focus-ring" type="submit">{t("home.searchAction")}</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>{t("skins.results", { start, end, total })}</span>
          <button className="font-bold text-[var(--accent)] hover:underline" type="button" onClick={() => { setOffset(0); setSubmittedQuery(""); setQuery(""); setKind(""); setModel(""); setSort("latest"); }}>{t("skins.resetFilters")}</button>
        </div>
        {error ? <p className="surface rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-4 text-sm font-bold text-[var(--red)]">{error}</p> : null}
        {loading ? <p className="py-20 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
        {!loading && !error && records?.items.length === 0 ? <p className="surface rounded-lg p-12 text-center text-[var(--muted)]">{t("skins.empty")}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {records?.items.map((texture) => <SkinCard key={texture.publicId} locale={locale} texture={texture} />)}
        </div>
        {total > pageSize ? (
          <nav className="mt-7 flex items-center justify-center gap-3" aria-label={t("skins.pagination")}>
            <button className="button-secondary focus-ring" disabled={offset <= 0 || loading} type="button" onClick={() => setOffset((value) => Math.max(0, value - pageSize))}>{t("skins.previous")}</button>
            <span className="text-sm font-bold text-[var(--muted)]">{Math.floor(offset / pageSize) + 1} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button className="button-secondary focus-ring" disabled={offset + pageSize >= total || loading} type="button" onClick={() => setOffset((value) => value + pageSize)}>{t("skins.next")}</button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function SkinCard({ texture, locale }: { texture: SkinTexture; locale: string }) {
  const { t } = useI18n();
  const owner = texture.owner?.displayName || texture.owner?.username || t("skins.anonymous");
  return (
    <article className="surface group flex min-h-80 flex-col overflow-hidden rounded-lg transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-xl">
      <Link className="focus-ring relative block h-52 bg-[var(--panel-subtle)]" href={`/skins/${texture.publicId}`}>
        <SkinPreview2D className="h-full w-full p-4 transition group-hover:scale-[1.03]" kind={texture.kind} label={texture.name} model={texture.model} src={skinTextureURL(texture)} />
        <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-black text-white backdrop-blur">
          {texture.kind === "cape" ? t("skins.kindCape") : texture.model === "slim" ? t("skins.modelSlim") : t("skins.modelDefault")}
        </span>
        {texture.inWardrobe ? <span className="absolute right-3 top-3 rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-black text-white">{t("skins.inWardrobe")}</span> : null}
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
