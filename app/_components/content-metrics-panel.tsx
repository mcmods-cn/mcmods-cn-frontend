"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { ContentMetricActor, ContentMetricReference, ContentMetrics, getContentMetrics, recordContentMetricView } from "../_lib/content-metrics-api";
import { useI18n } from "../_lib/i18n-provider";

export function ContentMetricsPanel({ publicId, pageKey = "detail" }: { publicId: string; pageKey?: string }) {
  const { locale } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [metrics, setMetrics] = useState<ContentMetrics>();

  useEffect(() => {
    if (!ready || !publicId) return;
    let cancelled = false;
    const day = new Date().toISOString().slice(0, 10);
    const viewKey = `mcmods-content-view:${publicId}:${pageKey}:${day}`;
    const shouldRecord = window.sessionStorage.getItem(viewKey) !== "1";
    if (shouldRecord) window.sessionStorage.setItem(viewKey, "1");
    void (async () => {
      if (shouldRecord) await recordContentMetricView(publicId, pageKey, token).catch(() => undefined);
      const value = await getContentMetrics(publicId, locale, token).catch(() => undefined);
      if (!cancelled && value) setMetrics(value);
    })();
    return () => { cancelled = true; };
  }, [locale, pageKey, publicId, ready, token]);

  const labels = useMemo(() => metricLabels(locale), [locale]);
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
      {typeof metrics.heatScore === "number" ? <MetricValue label={labels.heat} value={formatNumber(metrics.heatScore)} accent /> : null}
    </div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricValue label={labels.totalViews} value={formatNumber(metrics.totalViews)} hint={metrics.includesChildren && metrics.childViews ? `${labels.direct} ${formatNumber(metrics.directViews)} · ${labels.children} ${formatNumber(metrics.childViews)}` : undefined} />
      <MetricValue label={labels.edits} value={formatNumber(metrics.editCount)} />
      <MetricValue label={labels.created} value={formatDate(metrics.createdAt, locale)} />
      <MetricValue label={labels.lastEdited} value={metrics.lastEditedAt ? formatDate(metrics.lastEditedAt, locale) : labels.notEdited} />
    </dl>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <ActorList actors={metrics.recentEditors} empty={labels.noEditors} locale={locale} title={labels.recentEditors} />
      <ActorList actors={metrics.recentViewers} empty={labels.noViewers} locale={locale} title={labels.recentViewers} />
    </div>
    {metrics.editors.length ? <div className="mt-5"><h3 className="text-sm font-black">{labels.projectEditors}</h3><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{metrics.editors.map((editor) => <Link className="focus-ring flex min-w-44 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={editor.url} key={editor.id}><Avatar avatar={editor.avatarUrl} name={editor.name} /><span className="min-w-0"><strong className="block truncate text-sm">{editor.name}</strong><span className="block truncate text-xs text-[var(--muted)]">{editor.role === "owner" ? labels.owner : labels.editor}</span></span></Link>)}</div></div> : null}
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

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function metricLabels(locale: string) {
  if (locale.toLowerCase().startsWith("zh")) return {
    title: "资料统计", updated: "统计截至", heat: "项目热度", totalViews: "总浏览量", direct: "本页", children: "子资料",
    edits: "编辑次数", created: "创建时间", lastEdited: "最后编辑时间", notEdited: "暂无已通过的编辑",
    recentEditors: "最近参与编辑的人", recentViewers: "最近浏览的用户", noEditors: "暂时没有编辑记录。", noViewers: "暂时没有已登录用户的浏览记录。",
    projectEditors: "资料编辑者", owner: "所有者", editor: "编辑者", developers: "开发者", tutorials: "相关教程", issues: "相关 BUG / 特性", questions: "相关问题", news: "相关新闻",
  };
  return {
    title: "Content statistics", updated: "Statistics as of", heat: "Project heat", totalViews: "Total views", direct: "Direct", children: "Child content",
    edits: "Edits", created: "Created", lastEdited: "Last edited", notEdited: "No approved edits yet",
    recentEditors: "Recent editors", recentViewers: "Recent signed-in viewers", noEditors: "No edit history yet.", noViewers: "No signed-in viewers yet.",
    projectEditors: "Project editors", owner: "Owner", editor: "Editor", developers: "Developers", tutorials: "Tutorials", issues: "Bugs / features", questions: "Questions", news: "News",
  };
}
