"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { ContentMetricActor, ContentMetricReference, ContentMetrics, getContentMetrics, recordContentMetricView } from "../_lib/content-metrics-api";
import { useI18n } from "../_lib/i18n-provider";

const recordedViews = new Set<string>();

export function ContentMetricsPanel({ publicId, pageKey = "detail" }: { publicId: string; pageKey?: string }) {
  const { token, user } = useAuthSnapshot();
  return <ContentMetricsPanelContent key={`${user?.id || "guest"}:${publicId}:${pageKey}:${token}`} publicId={publicId} pageKey={pageKey} />;
}

function ContentMetricsPanelContent({ publicId, pageKey }: { publicId: string; pageKey: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [metrics, setMetrics] = useState<ContentMetrics>();

  useEffect(() => {
    if (!ready || !publicId) return;
    let cancelled = false;
    const day = new Date().toISOString().slice(0, 10);
    const viewKey = `mcmods-content-view:${publicId}:${pageKey}:${day}`;
    let shouldRecord = !recordedViews.has(viewKey);
    try { shouldRecord = shouldRecord && window.sessionStorage.getItem(viewKey) !== "1"; } catch { /* Browser storage may be denied. */ }
    if (shouldRecord) {
      if (recordedViews.size >= 512) recordedViews.delete(recordedViews.values().next().value!);
      recordedViews.add(viewKey);
      try { window.sessionStorage.setItem(viewKey, "1"); } catch { /* Retain in-tab deduplication. */ }
    }
    void (async () => {
      if (shouldRecord) await recordContentMetricView(publicId, pageKey, token).catch(() => undefined);
      const value = await getContentMetrics(publicId, locale, token).catch(() => undefined);
      if (!cancelled && value) setMetrics(value);
    })();
    return () => { cancelled = true; };
  }, [locale, pageKey, publicId, ready, token]);

  const labels = metricLabels(t);
  const formatMetricNumber = (value: number) => formatNumber(value, locale);
  if (!metrics) return null;
  const references = [
    [labels.tutorials, metrics.tutorials],
    [labels.issues, metrics.issues],
    [labels.questions, metrics.discussions],
    [labels.news, metrics.news],
  ] as const;

  return <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-black">{labels.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{labels.updated} {formatDate(metrics.statisticsAsOf, locale)}</p></div>
      {typeof metrics.heatScore === "number" ? <MetricValue label={labels.heat} value={formatMetricNumber(metrics.heatScore)} accent /> : null}
    </div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricValue label={labels.totalViews} value={formatMetricNumber(metrics.totalViews)} hint={metrics.includesChildren && metrics.childViews ? `${labels.direct} ${formatMetricNumber(metrics.directViews)} · ${labels.children} ${formatMetricNumber(metrics.childViews)}` : undefined} />
      <MetricValue label={labels.edits} value={formatMetricNumber(metrics.editCount)} />
      <MetricValue label={labels.created} value={formatDate(metrics.createdAt, locale)} />
      <MetricValue label={labels.lastEdited} value={metrics.lastEditedAt ? formatDate(metrics.lastEditedAt, locale) : labels.notEdited} />
    </dl>
    <div className="mt-5">
      <ActorList actors={metrics.recentEditors} empty={labels.noEditors} locale={locale} title={labels.recentEditors} />
    </div>
    {metrics.editors.length ? <div className="mt-5"><h3 className="text-sm font-black">{labels.projectEditors}</h3><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{metrics.editors.map((editor) => <Link className="focus-ring flex min-w-44 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={editor.url} key={editor.id}><Avatar avatar={editor.avatarUrl} name={editor.name} /><span className="min-w-0"><strong className="block truncate text-sm">{editor.name}</strong><span className="block truncate text-xs text-[var(--muted)]">{editor.role === "developer" ? labels.verifiedDeveloper : labels.editor}</span></span></Link>)}</div></div> : null}
    {metrics.developers.length ? <div className="mt-5"><h3 className="text-sm font-black">{labels.developers}</h3><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{metrics.developers.map((developer) => <Link className="focus-ring flex min-w-44 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={developer.url} key={`${developer.kind}-${developer.id}`}><Avatar avatar={developer.avatarUrl} name={developer.name} /><span className="min-w-0"><strong className="block truncate text-sm">{developer.name}</strong>{developer.role ? <span className="block truncate text-xs text-[var(--muted)]">{developer.role}</span> : null}</span></Link>)}</div></div> : null}
    {references.some(([, items]) => items.length) ? <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 md:grid-cols-2 xl:grid-cols-4">{references.map(([title, items]) => items.length ? <ReferenceList items={items} key={title} title={title} /> : null)}</div> : null}
  </section>;
}

function MetricValue({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return <div className="rounded-lg bg-[var(--panel-subtle)] p-3"><dt className="text-xs font-bold text-[var(--muted)]">{label}</dt><dd className={`mt-1 break-words text-lg font-black ${accent ? "text-[var(--accent)]" : ""}`}>{value}</dd>{hint ? <span className="mt-1 block text-[11px] text-[var(--muted)]">{hint}</span> : null}</div>;
}

function ActorList({ title, actors, empty, locale }: { title: string; actors: ContentMetricActor[]; empty: string; locale: string }) {
  return <div><h3 className="text-sm font-black">{title}</h3>{actors.length ? <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{actors.map((actor) => <Link className="focus-ring flex min-w-40 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={actor.url} key={actor.id}><Avatar avatar={actor.avatarUrl} name={actor.name} /><span className="min-w-0"><strong className="block truncate text-sm">{actor.name}</strong><span className="block truncate text-[11px] text-[var(--muted)]">{formatDate(actor.occurredAt, locale)}{actor.count && actor.count > 1 ? ` · ${actor.count}` : ""}</span></span></Link>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-[var(--line)] p-3 text-xs text-[var(--muted)]">{empty}</p>}</div>;
}

function Avatar({ avatar, name }: { avatar?: string; name: string }) {
  return avatar ? <Image unoptimized alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" height={36} src={avatar} width={36} /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent-soft)] text-xs font-black text-[var(--accent)]">{[...name].slice(0, 2).join("")}</span>;
}

function ReferenceList({ title, items }: { title: string; items: ContentMetricReference[] }) {
  return <div><h3 className="text-sm font-black">{title}</h3><div className="mt-2 grid gap-1">{items.slice(0, 5).map((item) => <Link className="focus-ring truncate rounded px-2 py-1 text-sm text-[var(--accent)] hover:bg-[var(--panel-subtle)] hover:underline" href={item.url} key={item.id} title={item.title}>{item.title}</Link>)}</div></div>;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function metricLabels(t: (key: string) => string) {
  return {
    title: t("contentMetrics.title"),
    updated: t("contentMetrics.updated"),
    heat: t("contentMetrics.heat"),
    totalViews: t("contentMetrics.totalViews"),
    direct: t("contentMetrics.direct"),
    children: t("contentMetrics.children"),
    edits: t("contentMetrics.edits"),
    created: t("contentMetrics.created"),
    lastEdited: t("contentMetrics.lastEdited"),
    notEdited: t("contentMetrics.notEdited"),
    recentEditors: t("contentMetrics.recentEditors"),
    noEditors: t("contentMetrics.noEditors"),
    projectEditors: t("contentMetrics.projectEditors"),
    verifiedDeveloper: t("contentMetrics.verifiedDeveloper"),
    editor: t("contentMetrics.editor"),
    developers: t("contentMetrics.developers"),
    tutorials: t("contentMetrics.tutorials"),
    issues: t("contentMetrics.issues"),
    questions: t("contentMetrics.questions"),
    news: t("contentMetrics.news"),
  };
}
