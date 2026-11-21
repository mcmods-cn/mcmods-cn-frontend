"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { apiRequest } from "../_lib/api";
import { loadCommunityPosts, communityPostCollection, communityPostCoverURL, type CommunityPostSummary } from "../_lib/community-post-api";
import { useI18n } from "../_lib/i18n-provider";
import { backendModToCatalogEntry, type BackendModList, type BackendModRecord } from "../_lib/mod-api";
import { backendModpackToCatalogEntry, type BackendModpackCard, type BackendModpackList } from "../_lib/modpack-api";
import { localizedSimpleProject, simpleProjectIconURL, type SimpleProjectCard, type SimpleProjectList } from "../_lib/simple-project-api";

type HomeCategory = { titleKey: string; href: string };
type HomeResource = { id: string; name: string; summary: string; href: string; icon: string; typeKey: string; versions: string[]; timestamp: string };

const categories = {
  mods: { titleKey: "nav.mods", href: "/mods" },
  modpacks: { titleKey: "nav.modpacks", href: "/modpacks" },
  plugins: { titleKey: "nav.plugins", href: "/plugins" },
  addons: { titleKey: "nav.addons", href: "/addons" },
  datapacks: { titleKey: "nav.datapacks", href: "/datapacks" },
  maps: { titleKey: "nav.maps", href: "/maps" },
  resourcePacks: { titleKey: "nav.resourcePacks", href: "/resource-packs" },
  shaders: { titleKey: "nav.shaders", href: "/shaders" },
  tutorials: { titleKey: "nav.tutorials", href: "/tutorials" },
  news: { titleKey: "nav.news", href: "/news" },
  discussions: { titleKey: "nav.discussions", href: "/discussions" },
  servers: { titleKey: "nav.servers", href: "/servers" },
};
const searchCategories = [categories.mods, categories.modpacks, categories.tutorials, categories.servers];
const quickLinks = [
  { titleKey: "home.quickSubmit", href: "/mods/new" },
  { titleKey: "nav.tools", href: "/tools" },
  { titleKey: "nav.discussions", href: "/discussions" },
];

async function loadHotMods(signal: AbortSignal) {
  const result = await apiRequest<BackendModList>("/api/v1/mods?sort=heat&order=desc&limit=7&offset=0", { signal, cache: "no-store" });
  return (result.items ?? []).map(fromMod);
}
async function loadModpacks(signal: AbortSignal) {
  const result = await apiRequest<BackendModpackList>("/api/v1/modpacks?sort=published&order=desc&limit=4&offset=0", { signal, cache: "no-store" });
  return (result.items ?? []).map(fromModpack);
}
async function loadPlugins(signal: AbortSignal, locale: string) {
  const result = await apiRequest<SimpleProjectList>(`/api/v1/content-projects/plugin?sort=published&order=desc&limit=4&offset=0&locale=${encodeURIComponent(locale)}`, { signal, cache: "no-store" });
  return (result.items ?? []).map((item) => fromSimpleProject(item, locale));
}
async function loadTutorials(signal: AbortSignal) {
  return (await loadCommunityPosts("tutorial", { sort: "heat", order: "desc", limit: 6 }, "", signal)).items;
}
async function loadNews(signal: AbortSignal) {
  return (await loadCommunityPosts("news", { sort: "published", order: "desc", limit: 6 }, "", signal)).items;
}

type HomeList<T> = { items: T[]; status: "loading" | "ready" | "failed"; retry: () => void };

function useHomeList<T>(locale: string, load: (signal: AbortSignal, locale: string) => Promise<T[]>): HomeList<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ locale: string; attempt: number; items: T[]; status: "ready" | "failed" }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal, locale).then((items) => {
      if (!controller.signal.aborted) setResult({ locale, attempt, items, status: "ready" });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ locale, attempt, items: [], status: "failed" });
    });
    return () => controller.abort();
  }, [load, locale, attempt]);
  const current = result?.locale === locale && result.attempt === attempt ? result : undefined;
  return { items: current?.items ?? [], status: current?.status ?? "loading", retry: () => setAttempt((previous) => previous + 1) };
}

export function HomePage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(categories.mods);
  const hot = useHomeList(locale, loadHotMods);
  const modpacks = useHomeList(locale, loadModpacks);
  const plugins = useHomeList(locale, loadPlugins);
  const tutorials = useHomeList(locale, loadTutorials);
  const news = useHomeList(locale, loadNews);
  const [featured, ...hotGrid] = hot.items;
  const recent = [...modpacks.items, ...plugins.items].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 6);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `${category.href}?q=${encodeURIComponent(value)}` : category.href);
  }

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <section className="border-b border-[var(--line)] bg-[linear-gradient(115deg,var(--accent-soft),var(--panel)_52%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-9">
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">{t("home.heroTitle")}</h1>
        <form className="mt-4 grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]" role="search" onSubmit={search}>
          <label className="sr-only" htmlFor="home-category">{t("home.searchCategory")}</label>
          <select id="home-category" className="field col-span-2 h-11 w-fit max-w-full sm:col-span-1" value={category.href} onChange={(event) => setCategory(searchCategories.find((item) => item.href === event.target.value) ?? categories.mods)}>
            {searchCategories.map((item) => <option key={item.href} value={item.href}>{t(item.titleKey)}</option>)}
          </select>
          <label className="sr-only" htmlFor="home-search">{t("home.searchPlaceholder")}</label>
          <input id="home-search" className="field h-11 min-w-0" placeholder={t("home.searchPlaceholder")} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="button-primary focus-ring h-11 px-5" type="submit">{t("home.searchAction")}</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{quickLinks.map((link) => <Link key={link.href} className="focus-ring inline-flex min-h-11 items-center rounded px-1 text-sm font-bold text-[var(--accent)] hover:underline" href={link.href}>{t(link.titleKey)}</Link>)}</div>
      </div>
    </section>

    <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-6 sm:space-y-9 sm:py-8">
      <FeedSection title={t("home.hotTitle")} href="/mods?sort=heat&order=desc" sources={[hot]} empty={t("home.noResources")} skeleton={<ResourceSkeleton />}>
        {featured && <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <FeaturedResource item={featured} />
          {hotGrid.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">{hotGrid.map((item) => <ResourceTile item={item} key={item.id} />)}</div>}
        </div>}
      </FeedSection>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.8fr)]">
        <FeedSection title={t("home.tutorialTitle")} href="/tutorials?sort=heat&order=desc" sources={[tutorials]} empty={t("home.noTutorials")} skeleton={<ListSkeleton />}>
          {tutorials.items.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{tutorials.items.map((item, index) => <CommunityCard featured={index === 0} item={item} key={item.id} />)}</div>}
        </FeedSection>
        <FeedSection title={t("home.newsTitle")} href="/news?sort=published&order=desc" sources={[news]} empty={t("home.noNews")} skeleton={<ListSkeleton compact />}>
          {news.items.length > 0 && <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">{news.items.map((item) => <NewsRow item={item} key={item.id} />)}</div>}
        </FeedSection>
      </div>

      <FeedSection title={t("home.recentTitle")} links={<><BrowseLink href="/modpacks?sort=published&order=desc">{t("nav.modpacks")}</BrowseLink><BrowseLink href="/plugins?sort=published&order=desc">{t("nav.plugins")}</BrowseLink></>} sources={[modpacks, plugins]} empty={t("home.noRecent")} skeleton={<ResourceSkeleton />}>
        {recent.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{recent.map((item) => <ResourceTile item={item} key={`${item.typeKey}-${item.id}`} />)}</div>}
      </FeedSection>

      <section aria-labelledby="home-categories">
        <h2 className="text-xl font-black sm:text-2xl" id="home-categories">{t("home.categoryTitle")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{Object.values(categories).map((item) => <CategoryLink item={item} key={item.href} />)}</div>
      </section>
    </div>
  </main>;
}

function BrowseLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="focus-ring inline-flex min-h-11 items-center rounded px-1 text-sm font-bold text-[var(--accent)] hover:underline" href={href}>{children}<span aria-hidden="true" className="ml-1">→</span></Link>;
}

function FeedSection({ title, href, links, sources, empty, skeleton, children }: {
  title: string; href?: string; links?: ReactNode; sources: HomeList<unknown>[]; empty: string; skeleton: ReactNode; children: ReactNode;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const pending = sources.some((source) => source.status === "loading");
  const failed = sources.filter((source) => source.status === "failed");
  const hasItems = sources.some((source) => source.items.length > 0);
  return <section aria-labelledby={titleId} aria-busy={pending}>
    <header className="flex flex-wrap items-center justify-between gap-x-3">
      <h2 className="text-xl font-black sm:text-2xl" id={titleId}>{title}</h2>
      <div className="flex flex-wrap gap-x-3">{href && <BrowseLink href={href}>{t("home.viewMore")}</BrowseLink>}{links}</div>
    </header>
    {hasItems ? children : pending ? skeleton : failed.length === 0 && <EmptySection text={empty} />}
    {failed.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1 text-sm">
      <span role="status">{t("home.sectionUnavailable")}</span>
      <button type="button" className="focus-ring min-h-11 rounded px-2 font-bold underline" onClick={() => failed.forEach((source) => source.retry())}>{t("common.retry")}</button>
    </div>}
  </section>;
}

function FeaturedResource({ item }: { item: HomeResource }) {
  const { locale, t } = useI18n();
  return <Link className="focus-ring group grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--accent)] sm:grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] sm:gap-5 sm:p-5" href={item.href}><ResourceVisual icon={item.icon} name={item.name} large /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--accent)]">{t(item.typeKey)}</span>{item.versions.slice(0, 2).map((version) => <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold text-[var(--muted)]" key={version}>{version}</span>)}</div><h3 className="mt-2 break-words text-lg font-black group-hover:text-[var(--accent)] sm:text-2xl">{item.name}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{item.summary || t("home.resourceFallback")}</p><p className="mt-2 text-xs font-bold text-[var(--muted)]">{formatDate(item.timestamp, locale)}</p></div></Link>;
}

function ResourceTile({ item }: { item: HomeResource }) {
  const { t } = useI18n();
  return <Link className="focus-ring group min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={item.href}><div className="aspect-[4/3] bg-[var(--panel-subtle)] p-4"><ResourceVisual icon={item.icon} name={item.name} /></div><div className="p-3"><span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">{t(item.typeKey)}</span><h3 className="mt-1 line-clamp-2 text-sm font-black leading-5 group-hover:text-[var(--accent)]">{item.name}</h3></div></Link>;
}

function ResourceVisual({ icon, name, large = false }: { icon: string; name: string; large?: boolean }) {
  return <div className={`relative grid place-items-center overflow-hidden rounded-xl bg-[linear-gradient(145deg,var(--accent-soft),var(--panel-subtle))] ${large ? "aspect-square w-full self-center" : "h-full"}`}>{icon ? <Image unoptimized alt="" className="h-full w-full object-contain p-2 [image-rendering:auto]" height={large ? 180 : 120} src={icon} width={large ? 180 : 120} /> : <span aria-hidden="true" className={`${large ? "text-2xl sm:text-5xl" : "text-4xl"} font-black text-[var(--accent)] opacity-70`}>{resourceInitials(name)}</span>}</div>;
}

function CommunityCard({ item, featured }: { item: CommunityPostSummary; featured: boolean }) {
  const { locale } = useI18n();
  return <Link className={`focus-ring group grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:border-[var(--accent)] ${featured ? "sm:col-span-2 sm:grid-cols-[minmax(180px,.8fr)_1.2fr]" : "grid-cols-[96px_1fr]"}`} href={`/${communityPostCollection(item.kind)}/${item.id}`}><div className={`relative bg-[linear-gradient(145deg,var(--accent-soft),var(--panel-subtle))] ${featured ? "min-h-48" : "min-h-28"}`}>{item.coverUrl ? <Image unoptimized fill alt="" className="object-cover" src={communityPostCoverURL(item.coverUrl)} /> : <span aria-hidden="true" className="grid h-full place-items-center text-3xl font-black text-[var(--accent)] opacity-70">{resourceInitials(item.title)}</span>}</div><div className={featured ? "p-5" : "min-w-0 p-3"}><p className="text-xs font-bold text-[var(--accent)]">{item.category || item.minecraftVersions[0] || "Minecraft"}</p><h3 className={`${featured ? "mt-2 text-xl sm:text-2xl" : "mt-1 text-sm"} line-clamp-2 font-black group-hover:text-[var(--accent)]`}>{item.title}</h3><p className="mt-2 text-xs text-[var(--muted)]">{item.authorName} · {formatDate(item.createdAt, locale)}</p>{featured ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{plainExcerpt(item.summary)}</p> : null}</div></Link>;
}

function NewsRow({ item }: { item: CommunityPostSummary }) {
  const { locale } = useI18n();
  return <Link className="focus-ring group grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0 hover:bg-[var(--panel-subtle)]" href={`/${communityPostCollection(item.kind)}/${item.id}`}><div className="min-w-0"><h3 className="truncate text-sm font-black group-hover:text-[var(--accent)]">{item.title}</h3><p className="mt-1 truncate text-xs text-[var(--muted)]">{item.authorName}</p></div><time className="text-xs font-bold text-[var(--muted)]" dateTime={item.createdAt}>{formatDate(item.createdAt, locale)}</time></Link>;
}

function CategoryLink({ item }: { item: HomeCategory }) {
  const { t } = useI18n();
  return <Link className="focus-ring group flex min-h-11 min-w-0 items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" href={item.href}><span className="truncate text-sm font-black">{t(item.titleKey)}</span></Link>;
}

function ResourceSkeleton() {
  return <div className="mt-4 grid motion-safe:animate-pulse grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true"><div className="col-span-2 min-h-56 rounded-2xl bg-[var(--panel-subtle)]" />{Array.from({ length: 4 }, (_, index) => <div className="min-h-40 rounded-xl bg-[var(--panel-subtle)]" key={index} />)}</div>;
}

function ListSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className="mt-4 grid motion-safe:animate-pulse gap-3">{Array.from({ length: compact ? 5 : 3 }, (_, index) => <div className={`${compact ? "h-14" : "h-28"} rounded-xl bg-[var(--panel-subtle)]`} key={index} />)}</div>;
}

function EmptySection({ text }: { text: string }) {
  return <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-4 py-10 text-center text-sm font-bold text-[var(--muted)]">{text}</div>;
}

function fromMod(record: BackendModRecord): HomeResource {
  const item = backendModToCatalogEntry(record);
  return { id: record.siteId, name: record.secondaryName || record.primaryName, summary: record.summary, href: `/mods/${record.siteId}`, icon: item.icon, typeKey: "nav.mods", versions: item.versions, timestamp: record.updatedAt || record.createdAt };
}

function fromModpack(record: BackendModpackCard): HomeResource {
  const item = backendModpackToCatalogEntry(record);
  return { id: record.siteId, name: record.secondaryName || record.primaryName, summary: record.summary, href: `/modpacks/${record.siteId}`, icon: item.icon, typeKey: "nav.modpacks", versions: item.versions, timestamp: record.publishedAt || record.createdAt };
}

function fromSimpleProject(record: SimpleProjectCard, locale: string): HomeResource {
  const localization = localizedSimpleProject(record, locale);
  return { id: record.siteId, name: localization.name || record.siteId, summary: localization.summary, href: `/plugins/${record.siteId}`, icon: simpleProjectIconURL(record), typeKey: "nav.plugins", versions: record.minecraftVersions, timestamp: record.publishedAt || record.createdAt };
}

function resourceInitials(value: string) { return value.trim().slice(0, 2).toUpperCase() || "MC"; }
function plainExcerpt(value: string) { return value.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`\[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150); }
function formatDate(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date); }
