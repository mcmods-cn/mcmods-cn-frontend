"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type UnresolvedReference = {
  id: string;
  sourceType: string;
  sourceId: string;
  fieldPath: string;
  referenceType: string;
  rawIdentifier: string;
  status: "pending" | "resolved" | "ignored";
  resolvedType?: string;
  resolvedId?: string;
  sourceLabel?: string;
  sourcePublicId?: string;
  createdAt: string;
  resolvedAt?: string;
};

type UnresolvedReferencePage = {
  items: UnresolvedReference[];
  total: number;
  limit: number;
  offset: number;
};

export function AdminUnresolvedReferences({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UnresolvedReferencePage>({ items: [], total: 0, limit: 50, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 50;

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      status,
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (submittedQuery) parameters.set("q", submittedQuery);
    if (type) parameters.set("type", type);
    apiRequest<UnresolvedReferencePage>(`/api/v1/admin/unresolved-references?${parameters}`, { signal: controller.signal }, token)
      .then((value) => {
        setResult(value);
        setError("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [page, status, submittedQuery, token, type]);

  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  return <section className="surface overflow-hidden rounded-lg border border-[var(--line)]">
    <header className="border-b border-[var(--line)] p-5">
      <h2 className="text-xl font-black">{t("admin.unresolved.title")}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("admin.unresolved.description")}</p>
      <form className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_170px_auto]" onSubmit={search}>
        <input className="field" type="search" value={query} placeholder={t("admin.unresolved.search")} onChange={(event) => setQuery(event.target.value)} />
        <select className="field" value={type} onChange={(event) => { setLoading(true); setPage(1); setType(event.target.value); }}>
          <option value="">{t("admin.unresolved.allTypes")}</option>
          {["mod", "minecraft.item", "minecraft.enchantment", "tag", "plugin", "server"].map((item) => <option key={item} value={item}>{t(`admin.unresolved.types.${item}`)}</option>)}
        </select>
        <select className="field" value={status} onChange={(event) => { setLoading(true); setPage(1); setStatus(event.target.value); }}>
          {["pending", "resolved", "ignored", "all"].map((item) => <option key={item} value={item}>{t(`admin.unresolved.statuses.${item}`)}</option>)}
        </select>
        <button className="button-primary focus-ring" type="submit">{t("common.search")}</button>
      </form>
    </header>

    {error ? <p className="m-5 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{error}</p> : null}
    {loading ? <p className="grid min-h-52 place-items-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
    {!loading && !result.items.length ? <p className="grid min-h-52 place-items-center text-sm text-[var(--muted)]">{t("admin.unresolved.empty")}</p> : null}
    {!loading && result.items.length ? <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--panel-subtle)] text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3">{t("admin.unresolved.identifier")}</th>
            <th className="px-4 py-3">{t("admin.unresolved.type")}</th>
            <th className="px-4 py-3">{t("admin.unresolved.source")}</th>
            <th className="px-4 py-3">{t("admin.unresolved.status")}</th>
            <th className="px-4 py-3">{t("admin.unresolved.created")}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item) => <tr className="border-t border-[var(--line)]" key={item.id}>
            <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-lg font-black">?</span><code className="break-all font-bold">{item.rawIdentifier}</code></div></td>
            <td className="px-4 py-3"><span className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold">{t(`admin.unresolved.types.${item.referenceType}`)}</span></td>
            <td className="px-4 py-3"><strong className="block">{item.sourceLabel || item.sourceType}</strong><code className="mt-1 block max-w-sm break-all text-xs text-[var(--muted)]">{item.fieldPath}</code></td>
            <td className="px-4 py-3"><span className={`font-bold ${item.status === "pending" ? "text-[var(--warning)]" : item.status === "resolved" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{t(`admin.unresolved.statuses.${item.status}`)}</span></td>
            <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : null}

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-4">
      <span className="text-sm font-bold text-[var(--muted)]">{t("admin.unresolved.total", { count: result.total })} · {page} / {pages}</span>
      <div className="flex gap-2">
        <button className="button-secondary focus-ring" disabled={loading || page <= 1} type="button" onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }}>{t("common.previous")}</button>
        <button className="button-secondary focus-ring" disabled={loading || page >= pages} type="button" onClick={() => { setLoading(true); setPage((current) => Math.min(pages, current + 1)); }}>{t("common.next")}</button>
      </div>
    </footer>
  </section>;
}
