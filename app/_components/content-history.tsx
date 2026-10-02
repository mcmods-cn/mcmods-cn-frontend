"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { loadContentHistory, type ContentHistoryItem, type ContentHistoryPage } from "../_lib/content-history-api";
import { useI18n } from "../_lib/i18n-provider";

export function ContentHistory({ endpoint, backHref, titleKey }: { endpoint: string; backHref: string; titleKey: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [page, setPage] = useState<ContentHistoryPage | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const currentCursor = cursorHistory[cursorHistory.length - 1] || "";
  const items = page?.items ?? [];

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    loadContentHistory(endpoint, token, currentCursor, controller.signal)
		.then((result) => { setPage(result); setMessage(""); })
      .catch((error) => setMessage(error instanceof Error ? error.message : t("contentHistory.loadFailed")));
    return () => controller.abort();
  }, [currentCursor, endpoint, ready, t, token]);

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-5xl">
    <header className="border-b border-[var(--line)] pb-5"><Link className="font-bold text-[var(--accent)] hover:underline" href={backHref}>← {t("contentHistory.back")}</Link><h1 className="mt-3 text-3xl font-black">{t(titleKey)} · {t("contentHistory.title")}</h1><p className="mt-2 text-[var(--muted)]">{t("contentHistory.description")}</p></header>
    {message ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <div className="mt-6 grid gap-3">{items.map((item) => <HistoryRow item={item} locale={locale} key={`${item.origin}:${item.id}`} />)}{!message && !items.length ? <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--line)] font-bold text-[var(--muted)]">{t("contentHistory.empty")}</div> : null}</div>
    {page && (cursorHistory.length > 1 || page.hasMore) ? <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4"><button className="button-secondary focus-ring" disabled={cursorHistory.length <= 1} type="button" onClick={() => { setPage(null); setCursorHistory((history) => history.slice(0, -1)); }}>{t("common.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{t("contentHistory.page", { page: cursorHistory.length })}</span><button className="button-secondary focus-ring" disabled={!page?.hasMore || !page.nextCursor} type="button" onClick={() => { setPage(null); setCursorHistory((history) => [...history, page.nextCursor]); }}>{t("common.next")}</button></div> : null}
  </div></main>;
}

function HistoryRow({ item, locale }: { item: ContentHistoryItem; locale: string }) {
  const { t } = useI18n();
  const source = item.origin === "import" ? t("contentHistory.importSource", { source: item.source || "importer" }) : t("contentHistory.manualSource");
  return <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-lg">#{item.version}</strong><span className={`rounded px-2 py-1 text-xs font-black ${item.current ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>{item.current ? t("contentHistory.current") : t(`contentHistory.statuses.${item.status}`)}</span><span className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{source}</span>{item.sourceNamespace ? <code className="text-xs text-[var(--muted)]">{item.sourceNamespace}</code> : null}</div><time className="text-sm text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="text-[var(--muted)]">{t("contentHistory.submittedBy")}</span>{item.submittedById ? <Link className="font-bold text-[var(--accent)] hover:underline" href={`/user/${item.submittedById}`}>{item.submittedByName || item.submittedById}</Link> : <strong>{item.submittedByName || t("contentHistory.system")}</strong>}</div>
    {item.reason ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.reason}</p> : null}
    <code className="mt-3 block truncate text-xs text-[var(--muted)]" title={item.id}>{item.id}</code>
  </article>;
}
