"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { favoriteItemHref, FavoriteCollection, FavoriteCollectionItem, loadPublicFavoriteCollections, loadPublicFavoriteItems } from "../_lib/favorite-api";
import { useI18n } from "../_lib/i18n-provider";
import { CatalogResourceIconValue } from "./catalog-resource-icon";

type ShowcaseItem = {
  entityType: string;
  publicId: string;
  name: string;
  summary: string;
  iconUrl: string;
  href: string;
  roles: string[];
  updatedAt: string;
};

type ContributionActivity = {
  id: string;
  entityType: string;
  action: "created" | "edited";
  name: string;
  href: string;
  occurredAt: string;
};

type ContributionsPayload = {
  year: number;
  from: string;
  to: string;
  total: number;
  days: Array<{ date: string; count: number }>;
  years: number[];
  recentActivity: ContributionActivity[];
  recentActivityTruncated: boolean;
};

type ShowcasePayload = {
  claimedAuthors: ShowcaseItem[];
  developerProjects: ShowcaseItem[];
  editorProjects: ShowcaseItem[];
  uploads: ShowcaseItem[];
  posts: ShowcaseItem[];
  contributions: ContributionsPayload;
};

export function UserProfileOverview({ userId, token }: { userId: string; token?: string }) {
  const { t } = useI18n();
  const [showcase, setShowcase] = useState<ShowcasePayload | null>(null);
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [favoriteItems, setFavoriteItems] = useState<FavoriteCollectionItem[]>([]);
  const [contribution, setContribution] = useState<ContributionsPayload | null>(null);
  const [contributionLoading, setContributionLoading] = useState(false);
  const [contributionMessage, setContributionMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      apiRequest<ShowcasePayload>(`/api/v1/users/${userId}/showcase`, {}, token),
      loadPublicFavoriteCollections(userId, token),
    ]).then(([showcaseResult, collectionsResult]) => {
      if (cancelled) return;
      if (showcaseResult.status === "fulfilled") {
        setShowcase(showcaseResult.value);
        setContribution(showcaseResult.value.contributions);
        setMessage("");
      } else {
        setMessage(showcaseResult.reason instanceof Error ? showcaseResult.reason.message : t("user.showcaseLoadFailed"));
      }
      if (collectionsResult.status === "fulfilled") {
        setCollections(collectionsResult.value);
        setSelectedCollection((current) => current || collectionsResult.value[0]?.id || "");
      }
    });
    return () => { cancelled = true; };
  }, [t, token, userId]);

  useEffect(() => {
    if (!selectedCollection) return;
    let cancelled = false;
    void loadPublicFavoriteItems(userId, selectedCollection, token).then((items) => {
      if (!cancelled) setFavoriteItems(items);
    }).catch(() => {
      if (!cancelled) setFavoriteItems([]);
    });
    return () => { cancelled = true; };
  }, [selectedCollection, token, userId]);

  async function selectContributionYear(year: number) {
    if (!contribution || contribution.year === year || contributionLoading) return;
    setContributionLoading(true);
    setContributionMessage("");
    try {
      const result = await apiRequest<ContributionsPayload>(
        `/api/v1/users/${encodeURIComponent(userId)}/contributions?year=${year}`,
        {},
        token,
      );
      setContribution(result);
    } catch (error) {
      setContributionMessage(error instanceof Error ? error.message : t("user.contributionLoadFailed"));
    } finally {
      setContributionLoading(false);
    }
  }

  if (!showcase && !message) return <section className="surface p-5 text-sm text-[var(--muted)]">{t("common.loading")}</section>;
  if (!showcase) return <section className="surface p-5 text-sm text-[var(--danger)]">{message || t("user.showcaseLoadFailed")}</section>;

  return (
    <div className="grid gap-4">
      <ShowcaseSection description={t("user.claimedAuthorsDescription")} empty={t("user.noClaimedAuthors")} items={showcase.claimedAuthors} title={t("user.claimedAuthors")} />
      <ShowcaseSection description={t("user.developerProjectsDescription")} empty={t("user.noDeveloperProjects")} items={showcase.developerProjects} title={t("user.developerProjects")} />
      <ShowcaseSection description={t("user.editorProjectsDescription")} empty={t("user.noEditorProjects")} items={showcase.editorProjects} title={t("user.editorProjects")} />
      <ShowcaseSection description={t("user.uploadsDescription")} empty={t("user.noUploads")} items={showcase.uploads} title={t("user.uploads")} />
      <ShowcaseSection description={t("user.postsDescription")} empty={t("user.noPosts")} items={showcase.posts} title={t("user.communityPosts")} />
      {collections.length ? (
        <section className="surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">{t("favorites.publicCollections")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("favorites.publicCollectionsDescription")}</p>
            </div>
            <select className="field max-w-xs" value={selectedCollection} onChange={(event) => setSelectedCollection(event.target.value)}>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.isDefault ? t("favorites.defaultFolder") : collection.name} ({collection.itemCount})</option>)}
            </select>
          </div>
          {favoriteItems.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{favoriteItems.map((item) => <FavoriteCard item={item} key={`${item.entityType}:${item.entityKey}`} />)}</div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t("favorites.empty")}</p>}
        </section>
      ) : null}
      <ContributionHeatmap
        contribution={contribution ?? showcase.contributions}
        loading={contributionLoading}
        message={contributionMessage}
        onYearChange={(year) => void selectContributionYear(year)}
      />
    </div>
  );
}

function ShowcaseSection({ description, empty, items, title }: { description: string; empty: string; items: ShowcaseItem[]; title: string }) {
  return (
    <section className="surface p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      {items.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{items.map((item) => <ShowcaseCard item={item} key={`${item.entityType}:${item.publicId}`} />)}</div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{empty}</p>}
    </section>
  );
}

function ShowcaseCard({ item }: { item: ShowcaseItem }) {
  const { t } = useI18n();
  return (
    <Link className="focus-ring flex min-w-0 gap-4 rounded-lg border border-[var(--line)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={item.href}>
      <CatalogResourceIconValue className="h-14 w-14" fallbackName={item.name} value={item.iconUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="min-w-0 truncate text-[var(--accent)]">{item.name}</strong>
          <small className="rounded-full bg-[var(--panel-subtle)] px-2 py-1 font-bold text-[var(--muted)]">{entityTypeLabel(item.entityType, t)}</small>
        </span>
        {item.summary ? <span className="mt-2 line-clamp-2 block text-sm leading-6 text-[var(--muted)]">{item.summary}</span> : null}
        <span className="mt-3 flex flex-wrap gap-2">{item.roles.map((role) => <small className="rounded-full border border-[var(--line)] px-2 py-1 font-bold" key={role}>{roleLabel(role, t)}</small>)}</span>
      </span>
    </Link>
  );
}

function FavoriteCard({ item }: { item: FavoriteCollectionItem }) {
  const name = item.metadata.primaryName || item.metadata.secondaryName || item.metadata.title || item.entityKey;
  return <Link className="focus-ring flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={favoriteItemHref(item)}><CatalogResourceIconValue className="h-11 w-11" fallbackName={name} value={item.metadata.iconUrl || ""} /><span className="min-w-0"><strong className="block truncate">{name}</strong><small className="mt-1 block truncate text-[var(--muted)]">{item.entityKey}</small></span></Link>;
}

function ContributionHeatmap({ contribution, loading, message, onYearChange }: {
  contribution: ContributionsPayload;
  loading: boolean;
  message: string;
  onYearChange: (year: number) => void;
}) {
  const { locale, t } = useI18n();
  const cells = useMemo(() => contributionCells(contribution), [contribution]);
  const active = cells.filter((cell) => cell.count > 0);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const monthLabels = useMemo(() => contributionMonthLabels(contribution, locale), [contribution, locale]);
  const activityGroups = useMemo(() => groupContributionActivities(contribution.recentActivity, locale), [contribution.recentActivity, locale]);
  const weekCount = Math.ceil(cells.length / 7);
  const chartWidth = Math.max(12, weekCount * 15 - 3);
  const currentYear = new Date().getUTCFullYear();
  const title = contribution.year === currentYear
    ? t("user.contributionsInLastYear", { count: contribution.total })
    : t("user.contributionsInYear", { count: contribution.total, year: contribution.year });
  const chartLabel = contribution.year === currentYear
    ? t("user.contributionChartLabel")
    : t("user.contributionChartLabelYear", { year: contribution.year });
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("user.contributionsDescription")}</p>
        </div>
        <span className="text-xs font-bold text-[var(--muted)]">{contribution.from} – {contribution.to}</span>
      </div>
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[112px_minmax(0,1fr)]">
        <nav aria-label={t("user.contributionYears")} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {contribution.years.map((year) => <button
            aria-pressed={year === contribution.year}
            className={`focus-ring min-w-24 rounded-lg px-3 py-2 text-left text-sm font-bold transition ${year === contribution.year ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"}`}
            disabled={loading}
            key={year}
            type="button"
            onClick={() => onYearChange(year)}
          >{year}</button>)}
        </nav>
        <div className="min-w-0">
          {message ? <p className="mb-3 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{message}</p> : null}
          <div className={`overflow-x-auto pb-2 transition-opacity ${loading ? "opacity-50" : ""}`} role="region" aria-busy={loading} aria-label={chartLabel} tabIndex={0}>
            <div className="w-max">
              <div className="relative mb-2 h-5" style={{ width: `${chartWidth}px` }}>
                {monthLabels.map((month) => <span className="absolute top-0 whitespace-nowrap text-xs font-semibold text-[var(--muted)]" key={month.key} style={{ left: `${month.week * 15}px` }}>{month.label}</span>)}
              </div>
              <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" style={{ gridAutoColumns: "12px" }}>
                {cells.map((cell) => {
                  if (cell.padding) return <span aria-hidden="true" className="h-3 w-3" key={cell.key} />;
                  const label = t("user.contributionDateLabel", { count: cell.count, date: formatter.format(dateFromKey(cell.date)) });
                  if (cell.count > 0) return <button aria-label={label} className={`h-3 w-3 rounded-sm p-0 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)] ${contributionTone(cell.count)}`} key={cell.key} title={label} type="button" />;
                  return <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${contributionTone(0)}`} key={cell.key} title={label} />;
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--muted)]"><span>{t("user.less")}</span>{[0, 1, 3, 5, 8].map((count) => <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${contributionTone(count)}`} key={count} />)}<span>{t("user.more")}</span></div>
        </div>
      </div>
      <div className="mt-8 border-t border-[var(--line)] pt-6">
        <h3 className="text-lg font-black">{t("user.recentContributionActivity")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("user.recentContributionActivityDescription")}</p>
        {activityGroups.length ? <div className="mt-5 grid gap-6">{activityGroups.map((group) => <section key={group.key}>
          <div className="flex items-center gap-4"><h4 className="shrink-0 text-sm font-black">{group.label}</h4><span aria-hidden="true" className="h-px flex-1 bg-[var(--line)]" /></div>
          <div className="ml-3 mt-3 grid border-l-2 border-[var(--line)] pl-6">{group.items.map((item) => <ContributionActivityRow item={item} key={item.id} />)}</div>
        </section>)}</div> : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t("user.noRecentContributionActivity")}</p>}
        {contribution.recentActivityTruncated ? <p className="mt-3 text-xs text-[var(--muted)]">{t("user.recentContributionActivityTruncated")}</p> : null}
      </div>
      <ul className="sr-only">{active.map((cell) => <li key={cell.date}>{t("user.contributionDateLabel", { count: cell.count, date: formatter.format(dateFromKey(cell.date)) })}</li>)}</ul>
    </section>
  );
}

function ContributionActivityRow({ item }: { item: ContributionActivity }) {
  const { locale, t } = useI18n();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.occurredAt));
  const name = item.href
    ? <Link className="font-bold text-[var(--accent)] hover:underline" href={item.href}>{item.name}</Link>
    : <strong>{item.name}</strong>;
  return <div className="relative grid gap-1 border-b border-[var(--line)] py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
    <span aria-hidden="true" className="absolute -left-[35px] top-4 grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--line)] bg-[var(--panel)] text-xs font-black text-[var(--accent)]">{item.action === "created" ? "+" : "✎"}</span>
    <p className="min-w-0 text-sm"><span>{t(item.action === "created" ? "user.contributionCreated" : "user.contributionEdited")}</span>{" "}{name}<span className="ml-2 text-xs text-[var(--muted)]">{entityTypeLabel(item.entityType, t)}</span></p>
    <time className="text-xs font-semibold text-[var(--muted)]" dateTime={item.occurredAt}>{date}</time>
  </div>;
}

function contributionCells(contribution: ShowcasePayload["contributions"]) {
  const counts = new Map(contribution.days.map((day) => [day.date, day.count]));
  const from = dateFromKey(contribution.from);
  const to = dateFromKey(contribution.to);
  const cells: Array<{ key: string; date: string; count: number; padding?: boolean }> = [];
  for (let index = 0; index < from.getUTCDay(); index += 1) cells.push({ key: `padding-${index}`, date: "", count: 0, padding: true });
  for (let cursor = from; cursor <= to; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const date = cursor.toISOString().slice(0, 10);
    cells.push({ key: date, date, count: counts.get(date) || 0 });
  }
  return cells;
}

function contributionMonthLabels(contribution: ContributionsPayload, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const from = dateFromKey(contribution.from);
  const to = dateFromKey(contribution.to);
  const padding = from.getUTCDay();
  const labels: Array<{ key: string; label: string; week: number }> = [];
  let previousMonth = -1;
  let dayIndex = 0;
  for (let cursor = from; cursor <= to; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const month = cursor.getUTCMonth();
    if (month !== previousMonth) {
      labels.push({
        key: cursor.toISOString().slice(0, 7),
        label: formatter.format(cursor),
        week: Math.floor((padding + dayIndex) / 7),
      });
      previousMonth = month;
    }
    dayIndex += 1;
  }
  return labels;
}

function groupContributionActivities(items: ContributionActivity[], locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const groups = new Map<string, { key: string; label: string; items: ContributionActivity[] }>();
  for (const item of items) {
    const date = new Date(item.occurredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const group = groups.get(key) ?? { key, label: formatter.format(date), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function contributionTone(count: number) {
  if (count <= 0) return "border border-[var(--line)] bg-[var(--panel-subtle)]";
  if (count === 1) return "bg-[color-mix(in_srgb,var(--accent)_35%,var(--panel))]";
  if (count <= 3) return "bg-[color-mix(in_srgb,var(--accent)_55%,var(--panel))]";
  if (count <= 6) return "bg-[color-mix(in_srgb,var(--accent)_75%,var(--panel))]";
  return "bg-[var(--accent)]";
}

const showcaseTypeAliases: Record<string, string> = {
  community_post: "communityPost",
  minecraft_server: "server",
  project_changelog: "changelog",
  recipe_type: "recipeType",
  recipe_template: "recipeTemplate",
  resource_pack: "resourcePack",
  shader_pack: "shaderPack",
};
const showcaseDirectTypes = new Set(["author", "mod", "modpack", "plugin", "map", "datapack", "addon", "blueprint", "skin", "tutorial", "issue", "news", "discussion", "resource", "recipe", "tag"]);

function entityTypeLabel(entityType: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const key = showcaseTypeAliases[entityType] ?? (showcaseDirectTypes.has(entityType) ? entityType : "other");
  return t(`user.showcaseTypes.${key}`);
}

function roleLabel(role: string, t: (key: string, params?: Record<string, string | number>) => string) {
  return t(`user.showcaseRoles.${role}`);
}
