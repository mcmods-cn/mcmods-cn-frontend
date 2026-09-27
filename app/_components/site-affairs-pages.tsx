"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import {
  loadAboutPage,
  loadBlackroom,
  loadBlackroomRecord,
  loadSiteChangelog,
  loadSiteChangelogs,
  type BlackroomPage,
  type BlackroomRecord,
  type SiteAffairsPage,
  type SiteChangelog,
	type SiteChangelogPage,
} from "../_lib/site-affairs-api";
import { CommentSection } from "./comment-section";
import { MarkdownRenderer } from "./markdown-renderer";

export function AboutSitePage() {
  const { locale, t } = useI18n();
  const [page, setPage] = useState<SiteAffairsPage>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setError("");
      loadAboutPage(locale).then((value) => { if (!cancelled) setPage(value); }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); });
    });
    return () => { cancelled = true; };
  }, [locale]);
  if (!page) return <PageState message={error || t("common.loading")} error={Boolean(error)} />;
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><article className="mx-auto max-w-5xl">
    <AffairsHeader kicker={t("siteAffairs.title")} title={page.title} />
    {page.locale !== locale ? <p className="mt-4 rounded-lg border border-[var(--warning)] bg-[var(--panel)] px-4 py-3 text-sm font-bold">{t("siteAffairs.fallback", { locale: page.locale })}</p> : null}
    <section className="markdown-preview mt-8"><MarkdownRenderer emptyText="" markdown={page.bodyMarkdown} /></section>
  </article></main>;
}

export function SiteChangelogListPage() {
  const { locale, t } = useI18n();
	const [page, setPage] = useState<SiteChangelogPage>({ items: [], limit: 30, hasMore: false, nextCursor: "" });
	const [pagination, setPagination] = useState({ locale, cursor: "", cursorHistory: [] as string[] });
	const { cursor, cursorHistory } = pagination;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
		if (pagination.locale !== locale) {
			queueMicrotask(() => {
				if (!cancelled) setPagination({ locale, cursor: "", cursorHistory: [] });
			});
			return () => { cancelled = true; };
		}
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true); setError("");
      loadSiteChangelogs(locale, cursor).then((value) => {
        if (cancelled) return;
				setPage(value);
      }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); }).finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
	}, [cursor, locale, pagination.locale]);
	function previousPage() {
		const history = cursorHistory.slice();
		const previousCursor = history.pop() || "";
		setPagination({ locale, cursor: previousCursor, cursorHistory: history });
	}
	function nextPage() {
		if (!page.nextCursor) return;
		setPagination({ locale, cursor: page.nextCursor, cursorHistory: [...cursorHistory, cursor] });
	}
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><section className="mx-auto max-w-5xl">
    <AffairsHeader kicker={t("siteAffairs.title")} title={t("siteAffairs.changelogs")} />
    {error ? <PageMessage message={error} /> : null}
    <div className="mt-7 grid gap-4">{page.items.map((item) => <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5" key={item.id}>
      <time className="text-sm font-bold text-[var(--accent)]" dateTime={item.changeDate}>{formatDate(item.changeDate, locale)}</time>
      <h2 className="mt-2 text-xl font-black"><Link className="hover:text-[var(--accent)] hover:underline" href={`/site-affairs/changelogs/${item.id}`}>{item.title}</Link></h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("siteAffairs.language", { locale: item.locale })}</p>
      <p className="mt-3 line-clamp-3 whitespace-pre-line leading-7 text-[var(--muted)]">{markdownSummary(item.bodyMarkdown)}</p>
    </article>)}</div>
    {!loading && page.items.length === 0 && !error ? <p className="mt-8 text-center font-bold text-[var(--muted)]">{t("siteAffairs.noChangelogs")}</p> : null}
		<div className="mt-6 flex justify-between"><button className="button-secondary focus-ring" disabled={cursorHistory.length === 0 || loading} type="button" onClick={previousPage}>{t("common.previous")}</button><button className="button-secondary focus-ring" disabled={!page.hasMore || !page.nextCursor || loading} type="button" onClick={nextPage}>{t("common.next")}</button></div>
  </section></main>;
}

export function SiteChangelogDetailPage({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const [item, setItem] = useState<SiteChangelog>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadSiteChangelog(id, locale).then((value) => { if (!cancelled) setItem(value); }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); });
    return () => { cancelled = true; };
  }, [id, locale]);
  if (!item) return <PageState message={error || t("common.loading")} error={Boolean(error)} />;
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><article className="mx-auto max-w-5xl">
    <Link className="font-bold text-[var(--accent)] hover:underline" href="/site-affairs/changelogs">← {t("siteAffairs.changelogs")}</Link>
    <h1 className="mt-5 text-3xl font-black sm:text-4xl">{item.title}</h1>
    <p className="mt-3 text-sm text-[var(--muted)]">{formatDate(item.changeDate, locale)} · {t("siteAffairs.language", { locale: item.locale })}</p>
    {item.locale !== locale ? <p className="mt-4 rounded-lg border border-[var(--warning)] px-4 py-3 text-sm font-bold">{t("siteAffairs.fallback", { locale: item.locale })}</p> : null}
    <section className="markdown-preview mt-8"><MarkdownRenderer emptyText="" markdown={item.bodyMarkdown} /></section>
  </article></main>;
}

export function BlackroomListPage() {
  const { t } = useI18n();
  const [page, setPage] = useState<BlackroomPage>({ items: [], limit: 30, hasMore: false, nextCursor: "" });
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true); setError("");
      loadBlackroom(cursor).then((value) => { if (!cancelled) setPage(value); }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); }).finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [cursor]);
  function previousPage() { const history = cursorHistory.slice(); const previousCursor = history.pop() || ""; setCursorHistory(history); setCursor(previousCursor); }
  function nextPage() { if (!page.nextCursor) return; setCursorHistory([...cursorHistory, cursor]); setCursor(page.nextCursor); }
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><section className="mx-auto max-w-6xl">
    <AffairsHeader kicker={t("siteAffairs.title")} title={t("siteAffairs.blackroom")} />
    {error ? <PageMessage message={error} /> : null}
    <div className="mt-7 grid gap-4 md:grid-cols-2">{page.items.map((item) => <BlackroomCard item={item} key={item.id} />)}</div>
    {!loading && page.items.length === 0 && !error ? <p className="mt-8 text-center font-bold text-[var(--muted)]">{t("siteAffairs.noBans")}</p> : null}
    <div className="mt-6 flex justify-between"><button className="button-secondary focus-ring" disabled={cursorHistory.length === 0 || loading} type="button" onClick={previousPage}>{t("common.previous")}</button><button className="button-secondary focus-ring" disabled={!page.hasMore || !page.nextCursor || loading} type="button" onClick={nextPage}>{t("common.next")}</button></div>
  </section></main>;
}

export function BlackroomDetailPage({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const [item, setItem] = useState<BlackroomRecord>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadBlackroomRecord(id).then((value) => { if (!cancelled) setItem(value); }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); });
    return () => { cancelled = true; };
  }, [id]);
  if (!item) return <PageState message={error || t("common.loading")} error={Boolean(error)} />;
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><article className="mx-auto max-w-5xl">
    <Link className="font-bold text-[var(--accent)] hover:underline" href="/site-affairs/blackroom">← {t("siteAffairs.blackroom")}</Link>
    <section className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6"><div className="flex items-center gap-4">
      {item.avatarUrl ? <img alt="" className="h-16 w-16 rounded-full object-cover" src={item.avatarUrl} /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--panel-subtle)] text-2xl font-black">{item.username.slice(0, 1)}</span>}
      <div><h1 className="text-3xl font-black">{item.username}</h1><Link className="text-sm text-[var(--accent)] hover:underline" href={`/user/${item.userId}`}>{t("siteAffairs.userProfile")}</Link></div>
    </div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><Meta label={t("siteAffairs.reason")} value={item.customReason || item.reasonCode} /><Meta label={t("siteAffairs.status")} value={banStatus(item, t)} /><Meta label={t("siteAffairs.startsAt")} value={new Date(item.startsAt).toLocaleString(locale)} /><Meta label={t("siteAffairs.endsAt")} value={item.endsAt ? new Date(item.endsAt).toLocaleString(locale) : t("siteAffairs.permanent")} /></dl></section>
    <section className="mt-8"><h2 className="text-2xl font-black">{t("siteAffairs.publicRecord")}</h2><div className="markdown-preview mt-4"><MarkdownRenderer emptyText={t("siteAffairs.noPublicRecord")} markdown={item.publicRecordMarkdown || ""} /></div></section>
    <CommentSection targetKey={item.id} targetType="ban_record" />
  </article></main>;
}

function BlackroomCard({ item }: { item: BlackroomRecord }) {
  const { t } = useI18n();
  return <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="flex gap-4">
    {item.avatarUrl ? <img alt="" className="h-14 w-14 rounded-full object-cover" src={item.avatarUrl} /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--panel-subtle)] text-xl font-black">{item.username.slice(0, 1)}</span>}
    <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-black">{item.username}</h2><p className="mt-1 text-sm text-[var(--muted)]">{item.customReason || item.reasonCode}</p><p className="mt-2 font-bold text-[var(--accent)]">{banStatus(item, t)}</p></div>
  </div><Link className="button-secondary focus-ring mt-4 block text-center" href={`/site-affairs/blackroom/${item.id}`}>{t("siteAffairs.viewRecord")}</Link></article>;
}

function banStatus(item: BlackroomRecord, t: (key: string, params?: Record<string, string | number>) => string) {
  if (item.status === "released") return t("siteAffairs.released");
  if (item.status === "permanent") return t("siteAffairs.permanent");
	if (item.status === "unknown") return t("siteAffairs.unknownStatus");
  if (!item.endsAt) return t("siteAffairs.permanent");
  const remaining = Math.max(0, new Date(item.endsAt).getTime() - Date.now());
  if (remaining <= 0) return t("siteAffairs.released");
  const hours = Math.ceil(remaining / 3_600_000);
  return hours >= 24 ? t("siteAffairs.daysRemaining", { count: Math.ceil(hours / 24) }) : t("siteAffairs.hoursRemaining", { count: hours });
}

function AffairsHeader({ kicker, title }: { kicker: string; title: string }) { return <header className="border-b border-[var(--line)] pb-6"><p className="font-black text-[var(--accent)]">{kicker}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h1></header>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>; }
function PageMessage({ message }: { message: string }) { return <p className="mt-6 rounded-lg border border-[var(--red)] p-4 font-bold text-[var(--red)]" role="alert">{message}</p>; }
function PageState({ message, error }: { message: string; error: boolean }) { return <main className={`grid min-h-[65vh] place-items-center p-6 font-bold ${error ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>{message}</main>; }
function formatDate(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale); }
function markdownSummary(value: string) { return value.replace(/[`#>*_~\[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 260); }
function errorMessage(value: unknown) { return value instanceof Error ? value.message : String(value); }
