"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { PointerEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { formatMinecraftLanguages } from "../_lib/minecraft-languages";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { ServerDetail as ServerDetailRecord, ServerHistory, ServerHistoryPoint } from "../_lib/server-api";
import { MarkdownRenderer } from "./markdown-renderer";
import { ServerSubmissionWizard } from "./server-submission-wizard";

type HistoryRange = ServerHistory["range"];
const ranges: HistoryRange[] = ["24h", "7d", "30d", "90d"];

export function ServerDetail({ serverId }: { serverId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawRange = searchParams.get("range");
  const range: HistoryRange = ranges.includes(rawRange as HistoryRange) ? rawRange as HistoryRange : "24h";
  const [record, setRecord] = useState<ServerDetailRecord | null>(null);
  const [history, setHistory] = useState<ServerHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(() => searchParams.has("draft"));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
    });
    apiRequest<ServerDetailRecord>(`/api/v1/servers/${encodeURIComponent(serverId)}`, {}, token)
      .then((result) => { if (!cancelled) setRecord(result); })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("servers.detail.loadFailed"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey, serverId, t, token]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<ServerHistory>(`/api/v1/servers/${encodeURIComponent(serverId)}/history?range=${range}`, {}, token)
      .then((result) => { if (!cancelled) setHistory(result); })
      .catch(() => { if (!cancelled) setHistory(null); });
    return () => { cancelled = true; };
  }, [range, serverId, token]);

  function changeRange(nextRange: HistoryRange) {
    const next = new URLSearchParams(searchParams.toString());
    if (nextRange === "24h") next.delete("range");
    else next.set("range", nextRange);
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-7xl px-4 py-10"><div className="h-80 animate-pulse rounded-xl bg-[var(--panel-subtle)]" /></main>;
  if (error || !record) return <main className="mx-auto min-h-screen max-w-4xl px-4 py-16"><div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-6 font-bold text-[var(--danger)]">{error || t("servers.detail.notFound")}</div></main>;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link className="font-bold text-[var(--accent)]" href="/servers">← {t("servers.detail.back")}</Link>
        {record.reviewStatus !== "approved" ? <div className="mt-5 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm font-bold">{t(`servers.reviewStatus.${record.reviewStatus}`)}</div> : null}

        <header className="mt-5 grid gap-5 border-b border-[var(--line)] pb-7 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
          {record.iconDataUri
            ? <img alt="" className="h-24 w-24 rounded-xl border border-[var(--line)] object-cover [image-rendering:pixelated]" height={96} src={record.iconDataUri} width={96} />
            : <span className="grid h-24 w-24 place-items-center rounded-xl bg-[var(--panel-subtle)] text-4xl font-black text-[var(--muted)]">?</span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{record.name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${record.online ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>
                {t(record.online ? "servers.online" : "servers.offline")}
              </span>
              {record.modded ? <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--accent)]">{record.loader || t("servers.modded")}</span> : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{record.shortDescription || t("servers.noSummary")}</p>
            <p className="mt-2 font-mono text-sm">{record.address}</p>
          </div>
          <div>
            {record.canEdit ? <button className="button-secondary focus-ring mb-3 w-full" type="button" onClick={() => setEditOpen(true)}>{t("common.edit")}</button> : null}
            <div className="grid grid-cols-2 gap-5 text-center sm:grid-cols-1 sm:text-right">
            <span><strong className="block text-2xl">{record.online ? `${record.playersOnline}/${record.playersMax}` : "—"}</strong><small className="text-[var(--muted)]">{t("servers.players")}</small></span>
            <span><strong className="block text-2xl">{typeof record.latencyMs === "number" ? `${record.latencyMs} ms` : "—"}</strong><small className="text-[var(--muted)]">{t("servers.latency")}</small></span>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-8">
            <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{t("servers.detail.playerHistory")}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{t("servers.detail.playerHistoryHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("servers.detail.range")}>
                  {ranges.map((value) => <button key={value} className={`focus-ring rounded-md border px-3 py-2 text-sm font-black ${range === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`} type="button" onClick={() => changeRange(value)}>{t(`servers.ranges.${value}`)}</button>)}
                </div>
              </div>
              <PlayerHistoryChart history={history} locale={locale} />
            </section>

            <section>
              <h2 className="text-2xl font-black">{t("servers.detail.introduction")}</h2>
              <div className="markdown-preview mt-4 border-t border-[var(--line)] pt-5">
                <MarkdownRenderer config={defaultMarkdownConfig} emptyText={t("servers.detail.noIntroduction")} markdown={record.bodyMarkdown} />
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">{t("servers.detail.mods")}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{t(record.modListComplete ? "servers.detail.modListComplete" : "servers.detail.modListInferred")}</p>
                </div>
                <span className="text-sm font-bold text-[var(--muted)]">{record.mods.length}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {record.mods.map((mod) => {
                  const content = (
                    <>
                      {mod.iconUrl ? <img alt="" className="h-10 w-10 rounded object-cover [image-rendering:pixelated]" height={40} src={mod.iconUrl} width={40} /> : <span className="grid h-10 w-10 place-items-center rounded bg-[var(--panel-subtle)] text-lg font-black text-[var(--muted)]">?</span>}
                      <span className="min-w-0"><strong className="block truncate">{mod.modName || mod.id}</strong><small className="block truncate font-mono text-[var(--muted)]">{mod.id}{mod.version ? ` · ${mod.version}` : ""}</small></span>
                    </>
                  );
                  return mod.resolved && mod.modSlug
                    ? <Link key={mod.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={`/mods/${mod.modSlug}`}>{content}</Link>
                    : <div key={mod.id} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--line)] p-3" title={t("servers.detail.uncollectedMod")}>{content}</div>;
                })}
                {!record.mods.length ? <p className="col-span-full rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">{t("servers.detail.noMods")}</p> : null}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <InfoPanel record={record} />
            {record.links.length ? (
              <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
                <h2 className="font-black">{t("servers.detail.links")}</h2>
                <div className="mt-3 grid gap-2">
                  {record.links.map((link, index) => <a key={`${link.url}-${index}`} className="focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-sm font-bold text-[var(--accent)] hover:border-[var(--accent)]" href={link.url} rel="noreferrer noopener" target="_blank">{link.label || t(`servers.linkKinds.${link.kind}`)} ↗</a>)}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
      {editOpen ? (
        <ServerSubmissionWizard
          initialServer={record}
          token={token}
          onClose={() => setEditOpen(false)}
          onSubmitted={() => {
            setEditOpen(false);
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
    </main>
  );
}

function InfoPanel({ record }: { record: ServerDetailRecord }) {
  const { t } = useI18n();
  const rows = [
    [t("servers.version"), record.minecraftVersions.join(" · ") || record.minecraftVersion || "—"],
    [t("servers.detail.language"), formatMinecraftLanguages(record.languages)],
    [t("servers.detail.category"), t(`servers.tags.${record.primaryTag}`)],
    [t("servers.detail.dedicatedClient"), t(record.dedicatedClient ? "common.yes" : "common.no")],
    [t("servers.whitelist"), t(record.hasWhitelist ? "common.yes" : "common.no")],
    [t("servers.onlineMode"), t(record.onlineMode ? "common.yes" : "common.no")],
  ];
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h2 className="font-black">{t("servers.detail.information")}</h2>
      <dl className="mt-3 divide-y divide-[var(--line)]">
        {rows.map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-3 py-3 text-sm"><dt className="font-bold text-[var(--muted)]">{label}</dt><dd className="text-right font-bold">{value}</dd></div>)}
      </dl>
      {record.motd ? <div className="mt-3 rounded-md bg-[var(--panel-subtle)] p-3 text-sm leading-6"><span className="block text-xs font-bold text-[var(--muted)]">MOTD</span>{record.motd}</div> : null}
    </section>
  );
}

function PlayerHistoryChart({ history, locale }: { history: ServerHistory | null; locale: string }) {
  const { t } = useI18n();
  const points = useMemo(() => downsampleHistory(history?.points ?? [], 900), [history?.points]);
  const validPoints = points.filter((point) => point.online && typeof point.playersOnline === "number");
  const maxPlayers = Math.max(1, ...validPoints.map((point) => Math.max(point.playersOnline ?? 0, point.playersMax ?? 0)));
  const chartMax = niceMaximum(maxPlayers);
  const [selected, setSelected] = useState(-1);
  const activeIndex = points.length ? Math.min(selected < 0 ? points.length - 1 : selected, points.length - 1) : -1;
  const active = activeIndex >= 0 ? points[activeIndex] : null;

  if (!history) return <div className="mt-5 h-64 animate-pulse rounded-lg bg-[var(--panel-subtle)]" />;
  if (!points.length) return <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] py-20 text-center text-sm font-bold text-[var(--muted)]">{t("servers.detail.noHistory")}</div>;

  const width = 800;
  const height = 280;
  const margin = { left: 52, right: 18, top: 18, bottom: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const timestamps = points.map((point) => new Date(point.checkedAt).getTime());
  const firstTime = Math.min(...timestamps);
  const lastTime = Math.max(...timestamps);
  const timeSpan = Math.max(1, lastTime - firstTime);
  const x = (point: ServerHistoryPoint) => margin.left + ((new Date(point.checkedAt).getTime() - firstTime) / timeSpan) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - (value / chartMax) * plotHeight;
  const segments = historySegments(points);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(chartMax * ratio));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => firstTime + timeSpan * ratio);

  function chooseFromPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const targetTime = firstTime + Math.max(0, Math.min(1, (svgX - margin.left) / plotWidth)) * timeSpan;
    let closest = 0;
    for (let index = 1; index < timestamps.length; index += 1) {
      if (Math.abs(timestamps[index] - targetTime) < Math.abs(timestamps[closest] - targetTime)) closest = index;
    }
    setSelected(closest);
  }

  return (
    <div className="mt-5">
      <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]">
        <svg
          aria-label={t("servers.detail.chartAria")}
          className="block h-auto min-h-56 w-full touch-pan-y outline-none"
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${width} ${height}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); setSelected(Math.max(0, activeIndex - 1)); }
            if (event.key === "ArrowRight") { event.preventDefault(); setSelected(Math.min(points.length - 1, activeIndex + 1)); }
          }}
          onPointerDown={chooseFromPointer}
          onPointerMove={(event) => { if (event.pointerType === "mouse") chooseFromPointer(event); }}
        >
          {yTicks.map((tick) => <g key={tick}><line stroke="var(--line)" strokeWidth="1" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} /><text fill="var(--muted)" fontSize="12" textAnchor="end" x={margin.left - 9} y={y(tick) + 4}>{tick}</text></g>)}
          {xTicks.map((tick, index) => <text key={tick} fill="var(--muted)" fontSize="11" textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"} x={margin.left + (plotWidth * index) / (xTicks.length - 1)} y={height - 12}>{formatChartTime(tick, locale, history.range)}</text>)}
          {segments.map((segment, index) => {
            const path = segment.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${x(point).toFixed(2)},${y(point.playersOnline ?? 0).toFixed(2)}`).join(" ");
            return <path key={index} d={path} fill="none" stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />;
          })}
          {active ? (
            <>
              <line stroke="var(--accent)" strokeDasharray="4 4" x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotHeight} />
              {active.online && typeof active.playersOnline === "number" ? <circle cx={x(active)} cy={y(active.playersOnline)} fill="var(--panel)" r="5" stroke="var(--accent)" strokeWidth="3" /> : <circle cx={x(active)} cy={margin.top + plotHeight} fill="var(--danger)" r="4" />}
            </>
          ) : null}
        </svg>
      </div>
      <div aria-live="polite" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-bold">
          {active ? `${new Date(active.checkedAt).toLocaleString(locale)} · ${active.online && typeof active.playersOnline === "number" ? t("servers.detail.playersAtTime", { count: active.playersOnline, max: active.playersMax ?? "?" }) : t("servers.offline")}` : "—"}
        </span>
        <span className="text-xs text-[var(--muted)]">{t("servers.detail.updatedAt", { time: new Date(history.generatedAt).toLocaleString(locale) })}</span>
      </div>
    </div>
  );
}

function historySegments(points: ServerHistoryPoint[]) {
  const segments: ServerHistoryPoint[][] = [];
  let current: ServerHistoryPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    const gap = previous ? new Date(point.checkedAt).getTime() - new Date(previous.checkedAt).getTime() > 15 * 60 * 1000 : false;
    if (!point.online || typeof point.playersOnline !== "number" || gap) {
      if (current.length) segments.push(current);
      current = [];
      if (!point.online) continue;
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

function downsampleHistory(points: ServerHistoryPoint[], target: number) {
  if (points.length <= target) return points;
  const stride = Math.ceil(points.length / target);
  const result: ServerHistoryPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const transition = index > 0 && points[index].online !== points[index - 1].online;
    if (index === 0 || index === points.length - 1 || index % stride === 0 || transition) result.push(points[index]);
  }
  return result;
}

function niceMaximum(value: number) {
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function formatChartTime(timestamp: number, locale: string, range: HistoryRange) {
  const date = new Date(timestamp);
  return range === "24h"
    ? date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
}
