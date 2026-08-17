"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, apiRequest, backendFetch, isBearerAccessToken } from "../_lib/api";
import { BlueprintListResponse, type BlueprintRequiredMod } from "../_lib/blueprint-api";
import { useAuthSnapshot } from "../_lib/auth";
import { type CatalogSortDirection, type CatalogSortField, coreCatalogSortFields } from "../_lib/catalog-sort";
import { useI18n } from "../_lib/i18n-provider";
import { notifySite } from "../_lib/site-notice";
import { CatalogHero, CatalogSortControl } from "./catalog-list-ui";

export function BlueprintLibrary() {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [sort, setSort] = useState<CatalogSortField>("updated");
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>("desc");
  const [records, setRecords] = useState<BlueprintListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setLoading(true); });
    const params = new URLSearchParams({ limit: "60", q: submittedQuery, sort, order: sortDirection });
    apiRequest<BlueprintListResponse>(`/api/v1/blueprints?${params}`, {}, token)
      .then((result) => { if (!cancelled) setRecords(result); })
      .catch((error) => { if (!cancelled) notifySite(cleanError(error), t("blueprints.title"), "danger"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, sort, sortDirection, submittedQuery, t, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <CatalogHero
        actions={<Link className="button-primary focus-ring" href={token ? "/blueprints/upload" : "/login?next=/blueprints/upload"}>{t("blueprints.upload")}</Link>}
        description={<>{t("blueprints.subtitle")}<span className="mt-1 block">{t("blueprints.uploadHint")}</span></>}
        kicker={t("blueprints.kicker")}
        title={t("blueprints.title")}
      >
          <form className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,auto)_auto]" onSubmit={search}>
            <input className="field h-12" value={query} placeholder={t("blueprints.search")} onChange={(event) => setQuery(event.target.value)} />
            <CatalogSortControl className="min-h-12 lg:flex-nowrap" direction={sortDirection} field={sort} fields={coreCatalogSortFields} onDirectionChange={setSortDirection} onFieldChange={setSort} />
            <button className="button-primary focus-ring h-12 shrink-0 px-6" type="submit">{t("globalCatalog.searchAction")}</button>
          </form>
      </CatalogHero>

      <section className="mx-auto max-w-7xl px-4 py-7">
        {loading ? <p className="py-16 text-center text-[var(--muted)]">{t("common.loading")}</p> : null}
        {!loading && records?.items.length === 0 ? <p className="surface rounded-lg border border-[var(--line)] p-12 text-center text-[var(--muted)]">{t("blueprints.empty")}</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records?.items.map((item) => (
            <article key={item.id} className="surface flex min-h-64 flex-col overflow-hidden rounded-lg border border-[var(--line)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]">
              {item.coverUrl ? <BlueprintCover path={item.coverUrl} token={token} /> : null}
              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3"><span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 font-mono text-xs font-bold uppercase">{item.sourceFormat}</span><span className="text-xs font-bold text-[var(--accent)]">{statusText(t, item.status)}</span></div>
              <h2 className="mt-4 text-xl font-black">{item.title}</h2>
              <code className="mt-1 text-xs text-[var(--muted)]">{item.id}</code>
              <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-[var(--muted)]">{plainText(item.description) || t("blueprints.noIntroduction")}</p>
              <BlueprintRequiredMods compact mods={item.requiredMods} />
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-sm"><div><dt className="text-[var(--muted)]">{t("blueprints.dimensions")}</dt><dd className="mt-1 font-bold">{item.size.join(" × ")}</dd></div><div><dt className="text-[var(--muted)]">{t("blueprints.blocks")}</dt><dd className="mt-1 font-bold">{item.blockCount.toLocaleString()}</dd></div></dl>
<div className="mt-4 flex items-center justify-between gap-3"><span className="truncate text-sm text-[var(--muted)]">{item.uploader.username}</span><Link className="button-secondary focus-ring px-3 py-2 text-sm" href={`/blueprints/${item.id}`}>{t("blueprints.open")}</Link></div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export function BlueprintRequiredMods({ mods = [], compact = false }: { mods?: BlueprintRequiredMod[]; compact?: boolean }) {
  const { t } = useI18n();
  if (!mods.length && compact) return null;
  return <section className={compact ? "mt-4" : "mt-6 border-t border-[var(--line)] pt-5"}>
    <p className="text-xs font-bold uppercase text-[var(--muted)]">{t("blueprints.requiredMods")}</p>
    {mods.length ? <div className="mt-2 flex flex-wrap gap-2">
      {mods.map((mod) => <Link key={mod.projectCode} className="focus-ring rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1.5 text-xs font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={`/mods/${encodeURIComponent(mod.siteId)}`}>
        {mod.secondaryName || mod.primaryName || mod.modId || mod.siteId}
        {mod.modId && mod.modId !== (mod.secondaryName || mod.primaryName) ? <span className="ml-1 font-mono font-normal text-[var(--muted)]">{mod.modId}</span> : null}
      </Link>)}
    </div> : <p className="mt-2 text-sm text-[var(--muted)]">{t("blueprints.noRequiredMods")}</p>}
  </section>;
}

function BlueprintCover({ path, token }: { path: string; token?: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectURL = "";
    const headers = new Headers();
    if (isBearerAccessToken(token)) headers.set("Authorization", `Bearer ${token}`);
    backendFetch(`${API_BASE_URL}${path}`, { credentials: "include", headers })
      .then((response) => response.ok && response.status !== 204 ? response.blob() : null)
      .then((blob) => {
        if (!blob || cancelled) return;
        objectURL = URL.createObjectURL(blob);
        setSource(objectURL);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [path, token]);
  return <div className="relative aspect-[121/75] bg-[var(--panel-subtle)]">{source ? <Image unoptimized fill alt="" className="object-cover" sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" src={source} /> : null}</div>;
}

export function statusText(t: (key: string) => string, status: string) {
  return t(`blueprints.status.${status}`);
}

function plainText(markdown: string) {
  return markdown.replace(/[`*_>#\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanError(error: unknown, fallback = "") {
  return error instanceof Error ? error.message : fallback || String(error);
}
