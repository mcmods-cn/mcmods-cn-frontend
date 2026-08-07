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

type ShowcasePayload = {
  projects: ShowcaseItem[];
  uploads: ShowcaseItem[];
  posts: ShowcaseItem[];
  contributions: {
    from: string;
    to: string;
    total: number;
    days: Array<{ date: string; count: number }>;
  };
};

export function UserProfileOverview({ userId, token }: { userId: string; token?: string }) {
  const { t } = useI18n();
  const [showcase, setShowcase] = useState<ShowcasePayload | null>(null);
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [favoriteItems, setFavoriteItems] = useState<FavoriteCollectionItem[]>([]);
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

  if (!showcase && !message) return <section className="surface p-5 text-sm text-[var(--muted)]">{t("common.loading")}</section>;
  if (!showcase) return <section className="surface p-5 text-sm text-[var(--danger)]">{message || t("user.showcaseLoadFailed")}</section>;

  return (
    <div className="grid gap-4">
      <ShowcaseSection description={t("user.projectsDescription")} empty={t("user.noProjects")} items={showcase.projects} title={t("user.projectsAndResources")} />
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
      <ContributionHeatmap contribution={showcase.contributions} />
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

function ContributionHeatmap({ contribution }: { contribution: ShowcasePayload["contributions"] }) {
  const { locale, t } = useI18n();
  const cells = useMemo(() => contributionCells(contribution), [contribution]);
  const active = cells.filter((cell) => cell.count > 0);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">{t("user.contributionsInLastYear", { count: contribution.total })}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("user.contributionsDescription")}</p>
        </div>
        <span className="text-xs font-bold text-[var(--muted)]">{contribution.from} – {contribution.to}</span>
      </div>
      <div className="mt-5 overflow-x-auto pb-2" role="region" aria-label={t("user.contributionChartLabel")} tabIndex={0}>
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" style={{ gridAutoColumns: "12px" }}>
          {cells.map((cell) => {
            if (cell.padding) return <span aria-hidden="true" className="h-3 w-3" key={cell.key} />;
            const label = t("user.contributionDateLabel", { count: cell.count, date: formatter.format(dateFromKey(cell.date)) });
            if (cell.count > 0) return <button aria-label={label} className={`h-3 w-3 rounded-sm p-0 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)] ${contributionTone(cell.count)}`} key={cell.key} title={label} type="button" />;
            return <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${contributionTone(0)}`} key={cell.key} title={label} />;
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--muted)]"><span>{t("user.less")}</span>{[0, 1, 3, 5, 8].map((count) => <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${contributionTone(count)}`} key={count} />)}<span>{t("user.more")}</span></div>
      <ul className="sr-only">{active.map((cell) => <li key={cell.date}>{t("user.contributionDateLabel", { count: cell.count, date: formatter.format(dateFromKey(cell.date)) })}</li>)}</ul>
    </section>
  );
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

function entityTypeLabel(entityType: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const key = entityType === "resource_pack" ? "resourcePack" : entityType === "shader_pack" ? "shaderPack" : entityType;
  return t(`user.showcaseTypes.${key}`);
}

function roleLabel(role: string, t: (key: string, params?: Record<string, string | number>) => string) {
  return t(`user.showcaseRoles.${role}`);
}
