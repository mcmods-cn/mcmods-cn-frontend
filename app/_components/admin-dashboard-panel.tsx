"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type SiteMetricPoint = {
  date: string;
  activeUsers: number;
  views: number;
  actions: number;
  newUsers: number;
  reviewSubmissions: number;
};

export type AdminDashboardData = {
  cards: Array<{ label: string; value: number; tone: string }>;
  overview: {
    onlineUsers: number;
    monthlyActiveUsers: number;
    totalUsers: number;
    totalProjects: number;
    approvedProjects: number;
    pendingReviews: number;
    viewsToday: number;
    actionsToday: number;
    trend: SiteMetricPoint[];
    updatedAt: string;
  };
};

type ProjectSummary = {
  id: string;
  type: string;
  name: string;
  url: string;
  reviewStatus: string;
  views: number;
  editCount: number;
  heat: number;
  rating: number;
  favorites: number;
  comments: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string;
};

type ProjectMetricPoint = {
  date: string;
  views: number;
  heat: number;
  favorites: number;
  comments: number;
  ratings: number;
  downloads: number;
};

type ProjectList = { items: ProjectSummary[]; total: number; limit: number; offset: number };
type ProjectDetail = { project: ProjectSummary; trend: ProjectMetricPoint[]; days: number };
type SiteMetric = "activeUsers" | "views" | "actions" | "newUsers";
type ProjectMetric = "heat" | "views" | "favorites" | "comments" | "ratings" | "downloads";

const emptyOverview: AdminDashboardData["overview"] = {
  onlineUsers: 0,
  monthlyActiveUsers: 0,
  totalUsers: 0,
  totalProjects: 0,
  approvedProjects: 0,
  pendingReviews: 0,
  viewsToday: 0,
  actionsToday: 0,
  trend: [],
  updatedAt: "",
};

const projectTypes = ["", "mod", "modpack", "plugin", "addon", "datapack", "map", "resource_pack", "shader_pack", "minecraft_server"];

export function AdminDashboardPanel({ initialData, token, features }: {
  initialData: AdminDashboardData;
  token: string;
  features: Record<string, boolean>;
}) {
  const { locale, t } = useI18n();
  const [refreshedDashboard, setRefreshedDashboard] = useState<AdminDashboardData | null>(null);
  const [siteMetric, setSiteMetric] = useState<SiteMetric>("activeUsers");
  const [projects, setProjects] = useState<ProjectList>({ items: [], total: 0, limit: 30, offset: 0 });
  const [query, setQuery] = useState("");
  const [projectType, setProjectType] = useState("");
  const [projectOffset, setProjectOffset] = useState(0);
  const [selectedID, setSelectedID] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectMetric, setProjectMetric] = useState<ProjectMetric>("heat");
  const [days, setDays] = useState(30);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void apiRequest<AdminDashboardData>("/api/v1/admin/dashboard", { cache: "no-store" }, token)
        .then((value) => { if (!cancelled) setRefreshedDashboard(value); })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingProjects(true);
      const parameters = new URLSearchParams({ limit: "40", offset: String(projectOffset) });
      if (query.trim()) parameters.set("q", query.trim());
      if (projectType) parameters.set("type", projectType);
      void apiRequest<ProjectList>(`/api/v1/admin/dashboard/projects?${parameters}`, {}, token)
        .then((result) => {
          if (cancelled) return;
          setProjects(result);
          setError("");
          setSelectedID((current) => current || result.items[0]?.id || "");
        })
        .catch(() => { if (!cancelled) setError(t("admin.dashboard.projectsLoadFailed")); })
        .finally(() => { if (!cancelled) setLoadingProjects(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [projectOffset, projectType, query, t, token]);

  useEffect(() => {
    if (!selectedID) return;
    let cancelled = false;
    void apiRequest<ProjectDetail>(`/api/v1/admin/dashboard/projects/${encodeURIComponent(selectedID)}?days=${days}`, {}, token)
      .then((result) => { if (!cancelled) { setProjectDetail(result); setError(""); } })
      .catch(() => { if (!cancelled) setError(t("admin.dashboard.projectLoadFailed")); });
    const currentURL = new URL(window.location.href);
    currentURL.searchParams.set("project", selectedID);
    window.history.replaceState(null, "", currentURL);
    return () => { cancelled = true; };
  }, [days, selectedID, t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const projectFromURL = new URL(window.location.href).searchParams.get("project") ?? "";
      if (projectFromURL) setSelectedID(projectFromURL);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dashboard = refreshedDashboard ?? initialData;
  const overview = dashboard.overview ?? emptyOverview;
  const siteMetrics: Array<{ key: SiteMetric; label: string }> = [
    { key: "activeUsers", label: t("admin.dashboard.activeUsers") },
    { key: "views", label: t("admin.dashboard.views") },
    { key: "actions", label: t("admin.dashboard.actions") },
    { key: "newUsers", label: t("admin.dashboard.newUsers") },
  ];
  const projectMetrics: Array<{ key: ProjectMetric; label: string }> = [
    { key: "heat", label: t("admin.dashboard.heat") },
    { key: "views", label: t("admin.dashboard.dailyViews") },
    { key: "favorites", label: t("admin.dashboard.favorites") },
    { key: "comments", label: t("admin.dashboard.comments") },
    { key: "ratings", label: t("admin.dashboard.ratings") },
    { key: "downloads", label: t("admin.dashboard.downloads") },
  ];
  const updatedAt = overview.updatedAt ? new Date(overview.updatedAt) : null;
  const stale = clock > 0 && updatedAt ? clock - updatedAt.getTime() > 120_000 : false;

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard icon="●" label={t("admin.dashboard.onlineUsers")} value={overview.onlineUsers} hint={t("admin.dashboard.onlineHint")} tone="green" locale={locale} />
        <DashboardCard icon="↗" label={t("admin.dashboard.monthlyActiveUsers")} value={overview.monthlyActiveUsers} hint={t("admin.dashboard.monthlyActiveHint")} tone="blue" locale={locale} />
        <DashboardCard icon="◆" label={t("admin.dashboard.totalProjects")} value={overview.totalProjects} hint={t("admin.dashboard.approvedProjects", { count: overview.approvedProjects })} tone="violet" locale={locale} />
        <DashboardCard icon="!" label={t("admin.dashboard.pendingReviews")} value={overview.pendingReviews} hint={t("admin.dashboard.reviewHint")} tone="red" locale={locale} />
        <DashboardCard icon="◎" label={t("admin.dashboard.totalUsers")} value={overview.totalUsers} hint={t("admin.dashboard.siteTotal")} tone="blue" locale={locale} />
        <DashboardCard icon="◉" label={t("admin.dashboard.viewsToday")} value={overview.viewsToday} hint={t("admin.dashboard.today")} tone="green" locale={locale} />
        <DashboardCard icon="⌁" label={t("admin.dashboard.actionsToday")} value={overview.actionsToday} hint={t("admin.dashboard.today")} tone="violet" locale={locale} />
        <div className="surface rounded-xl p-4">
          <p className="text-sm font-black">{t("admin.dashboard.systemState")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(features).slice(0, 8).map(([key, enabled]) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`} key={key}>{key}</span>)}
          </div>
        </div>
      </section>

      <section className="surface rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-black">{t("admin.dashboard.siteTrend")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.dashboard.lastThirtyDays")}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${stale ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{stale ? t("admin.dashboard.dataStale") : t("admin.dashboard.liveData")}{updatedAt ? ` · ${updatedAt.toLocaleTimeString(locale)}` : ""}</span>
        </div>
        <MetricTabs items={siteMetrics} value={siteMetric} onChange={(value) => setSiteMetric(value as SiteMetric)} />
        <LineChart points={overview.trend.map((point) => ({ date: point.date, value: point[siteMetric] }))} label={siteMetrics.find((item) => item.key === siteMetric)?.label ?? ""} locale={locale} />
      </section>

      <section className="grid min-h-[560px] gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="surface min-w-0 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{t("admin.dashboard.projects")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.dashboard.projectCount", { count: projects.total })}</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px] xl:grid-cols-1 2xl:grid-cols-[1fr_180px]">
            <input className="field" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setProjectOffset(0); setSelectedID(""); }} placeholder={t("admin.dashboard.searchProjects")} />
            <select className="field" value={projectType} onChange={(event) => { setProjectType(event.target.value); setProjectOffset(0); setSelectedID(""); }}>{projectTypes.map((type) => <option value={type} key={type || "all"}>{type ? t(`admin.dashboard.projectTypes.${type}`) : t("admin.dashboard.allTypes")}</option>)}</select>
          </div>
          <div className="mt-3 max-h-[470px] space-y-2 overflow-y-auto pr-1">
            {loadingProjects ? <p className="py-12 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
            {!loadingProjects && projects.items.length === 0 ? <p className="py-12 text-center text-sm font-bold text-[var(--muted)]">{t("admin.dashboard.noProjects")}</p> : null}
            {projects.items.map((project) => <button className={`focus-ring w-full rounded-lg border p-3 text-left transition ${selectedID === project.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:bg-[var(--panel-subtle)]"}`} key={project.id} type="button" onClick={() => setSelectedID(project.id)}><div className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block truncate">{project.name}</strong><span className="mt-1 block truncate font-mono text-xs text-[var(--muted)]">{t(`admin.dashboard.projectTypes.${project.type}`)} · {project.id}</span></span><span className="shrink-0 text-right"><strong className="block text-[var(--accent)]">{formatNumber(project.heat, locale)}</strong><span className="text-[10px] text-[var(--muted)]">{t("admin.dashboard.heat")}</span></span></div></button>)}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
            <button className="button-secondary focus-ring" disabled={projectOffset === 0 || loadingProjects} type="button" onClick={() => { setSelectedID(""); setProjectOffset((current) => Math.max(0, current - projects.limit)); }}>{t("common.previous")}</button>
            <span className="text-xs font-bold text-[var(--muted)]">{projects.total === 0 ? "0" : `${projects.offset + 1}–${Math.min(projects.offset + projects.items.length, projects.total)} / ${projects.total}`}</span>
            <button className="button-secondary focus-ring" disabled={projectOffset + projects.limit >= projects.total || loadingProjects} type="button" onClick={() => { setSelectedID(""); setProjectOffset((current) => current + projects.limit); }}>{t("common.next")}</button>
          </div>
        </div>

        <div className="surface min-w-0 rounded-xl p-4 sm:p-5">
          {error ? <p className="mb-4 rounded-lg bg-red-100 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}
          {!selectedID || !projectDetail ? <div className="grid min-h-80 place-items-center text-center text-sm font-bold text-[var(--muted)]">{t("admin.dashboard.selectProject")}</div> : <ProjectAnalytics detail={projectDetail} days={days} metric={projectMetric} metrics={projectMetrics} locale={locale} onDaysChange={setDays} onMetricChange={(value) => setProjectMetric(value as ProjectMetric)} t={t} />}
        </div>
      </section>
    </div>
  );
}

function ProjectAnalytics({ detail, days, metric, metrics, locale, onDaysChange, onMetricChange, t }: {
  detail: ProjectDetail;
  days: number;
  metric: ProjectMetric;
  metrics: Array<{ key: ProjectMetric; label: string }>;
  locale: string;
  onDaysChange: (value: number) => void;
  onMetricChange: (value: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const project = detail.project;
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-[var(--accent)]">{t(`admin.dashboard.projectTypes.${project.type}`)}</p><h2 className="mt-1 truncate text-2xl font-black">{project.name}</h2><p className="mt-1 font-mono text-xs text-[var(--muted)]">{project.id} · {project.reviewStatus}</p></div><Link className="button-secondary focus-ring" href={project.url}>{t("admin.dashboard.openProject")}</Link></div>
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label={t("admin.dashboard.totalViews")} value={formatNumber(project.views, locale)} /><MiniMetric label={t("admin.dashboard.heat")} value={formatNumber(project.heat, locale)} /><MiniMetric label={t("admin.dashboard.editCount")} value={formatNumber(project.editCount, locale)} /><MiniMetric label={t("admin.dashboard.rating")} value={project.rating ? project.rating.toFixed(2) : "—"} /></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><MetricTabs items={metrics} value={metric} onChange={onMetricChange} compact /><select className="field w-auto min-w-32" value={days} onChange={(event) => onDaysChange(Number(event.target.value))}>{[7, 30, 90, 365].map((value) => <option value={value} key={value}>{t("admin.dashboard.days", { count: value })}</option>)}</select></div>
    <LineChart points={detail.trend.map((point) => ({ date: point.date, value: point[metric] }))} label={metrics.find((item) => item.key === metric)?.label ?? ""} locale={locale} />
    <p className="mt-3 text-xs text-[var(--muted)]">{t("admin.dashboard.projectUpdated", { time: new Date(project.updatedAt).toLocaleString(locale) })}</p>
  </div>;
}

function DashboardCard({ icon, label, value, hint, tone, locale }: { icon: string; label: string; value: number; hint: string; tone: string; locale: string }) {
  const tones: Record<string, string> = { green: "bg-emerald-100 text-emerald-800", blue: "bg-sky-100 text-sky-800", violet: "bg-violet-100 text-violet-800", red: "bg-red-100 text-red-800" };
  return <div className="surface rounded-xl p-4"><div className="flex items-center gap-3"><span aria-hidden="true" className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${tones[tone] ?? tones.green}`}>{icon}</span><span className="text-sm font-bold text-[var(--muted)]">{label}</span></div><strong className="mt-4 block text-3xl font-black tabular-nums">{formatNumber(value, locale)}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[var(--panel-subtle)] p-3"><span className="block text-xs font-bold text-[var(--muted)]">{label}</span><strong className="mt-1 block text-xl font-black tabular-nums">{value}</strong></div>;
}

function MetricTabs({ items, value, onChange, compact = false }: { items: Array<{ key: string; label: string }>; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return <div className={`${compact ? "" : "mt-4"} flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[var(--panel-subtle)] p-1`} role="tablist">{items.map((item) => <button aria-selected={value === item.key} className={`focus-ring whitespace-nowrap rounded-md px-3 py-2 text-xs font-black ${value === item.key ? "bg-[var(--panel)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`} key={item.key} role="tab" type="button" onClick={() => onChange(item.key)}>{item.label}</button>)}</div>;
}

function LineChart({ points, label, locale }: { points: Array<{ date: string; value: number }>; label: string; locale: string }) {
  const geometry = useMemo(() => {
    const width = 900;
    const height = 260;
    const padding = { left: 54, right: 30, top: 28, bottom: 42 };
    const values = points.map((point) => Number.isFinite(point.value) ? point.value : 0);
    const maximum = Math.max(1, ...values);
    const minimum = Math.min(0, ...values);
    const range = Math.max(1, maximum - minimum);
    const coordinates = points.map((point, index) => ({
      x: padding.left + (points.length <= 1 ? 0 : index / (points.length - 1)) * (width - padding.left - padding.right),
      y: padding.top + (1 - (point.value - minimum) / range) * (height - padding.top - padding.bottom),
      ...point,
    }));
    return { width, height, padding, maximum, minimum, coordinates, path: coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ") };
  }, [points]);
  if (points.length === 0) return <div className="mt-4 grid h-64 place-items-center text-sm font-bold text-[var(--muted)]">—</div>;
  const last = geometry.coordinates.at(-1)!;
  return <div className="mt-4 overflow-x-auto"><svg className="h-auto min-w-[620px] w-full" role="img" aria-label={label} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
    {[0, 0.5, 1].map((ratio) => { const y = geometry.padding.top + ratio * (geometry.height - geometry.padding.top - geometry.padding.bottom); const value = geometry.maximum - ratio * (geometry.maximum - geometry.minimum); return <g key={ratio}><line stroke="var(--line)" strokeDasharray="4 6" x1={geometry.padding.left} x2={geometry.width - geometry.padding.right} y1={y} y2={y} /><text fill="var(--muted)" fontSize="12" textAnchor="end" x={geometry.padding.left - 9} y={y + 4}>{formatNumber(value, locale)}</text></g>; })}
    <path d={`${geometry.path} L${last.x},${geometry.height - geometry.padding.bottom} L${geometry.coordinates[0].x},${geometry.height - geometry.padding.bottom} Z`} fill="var(--accent-soft)" opacity="0.55" />
    <path d={geometry.path} fill="none" stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    {geometry.coordinates.map((point, index) => index % Math.max(1, Math.ceil(points.length / 6)) === 0 || index === points.length - 1 ? <text fill="var(--muted)" fontSize="11" key={point.date} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} x={point.x} y={geometry.height - 14}>{new Date(`${point.date}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric" })}</text> : null)}
    <circle cx={last.x} cy={last.y} fill="var(--panel)" r="5" stroke="var(--accent)" strokeWidth="3" />
    <g transform={`translate(${Math.max(geometry.padding.left, last.x - 150)},${Math.max(4, last.y - 28)})`}><rect fill="var(--foreground)" height="24" rx="6" width="145" /><text fill="var(--background)" fontSize="12" fontWeight="700" x="8" y="16">{label}: {formatNumber(last.value, locale)}</text></g>
  </svg></div>;
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(value);
}
