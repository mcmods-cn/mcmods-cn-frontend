"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { loadCommunityPosts, communityPostCollection, communityPostCoverURL, type CommunityPost } from "../_lib/community-post-api";
import { useI18n } from "../_lib/i18n-provider";
import { backendModToCatalogEntry, type BackendModList, type BackendModRecord } from "../_lib/mod-api";
import { backendModpackToCatalogEntry, type BackendModpackList, type BackendModpackRecord } from "../_lib/modpack-api";
import { localizedSimpleProject, simpleProjectIconURL, type SimpleProjectList, type SimpleProjectRecord } from "../_lib/simple-project-api";

type HomeCategory = { titleKey: string; href: string; meta: string };
type HomeResource = { id: string; name: string; summary: string; href: string; icon: string; typeKey: string; versions: string[]; timestamp: string };
type HomeFeed = { hot: HomeResource[]; recent: HomeResource[]; tutorials: CommunityPost[]; news: CommunityPost[] };

const emptyFeed: HomeFeed = { hot: [], recent: [], tutorials: [], news: [] };
const primaryCategories: HomeCategory[] = [
  { titleKey: "nav.mods", href: "/mods", meta: "MOD" },
  { titleKey: "nav.modpacks", href: "/modpacks", meta: "PACK" },
  { titleKey: "nav.plugins", href: "/plugins", meta: "PLUGIN" },
  { titleKey: "nav.addons", href: "/addons", meta: "ADD-ON" },
  { titleKey: "nav.datapacks", href: "/datapacks", meta: "DATA" },
  { titleKey: "nav.maps", href: "/maps", meta: "MAP" },
  { titleKey: "nav.resourcePacks", href: "/resource-packs", meta: "RP" },
  { titleKey: "nav.shaders", href: "/shaders", meta: "FX" },
  { titleKey: "nav.tutorials", href: "/tutorials", meta: "GUIDE" },
  { titleKey: "nav.news", href: "/news", meta: "NEWS" },
  { titleKey: "nav.discussions", href: "/discussions", meta: "Q&A" },
  { titleKey: "nav.servers", href: "/servers", meta: "SERVER" },
];
const quickLinks = [
  { titleKey: "home.quickSubmit", href: "/mods/new" },
  { titleKey: "home.quickTools", href: "/tools" },
  { titleKey: "home.quickDiscussions", href: "/discussions" },
];

export function HomePage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [feed, setFeed] = useState<HomeFeed>(emptyFeed);
  const [loading, setLoading] = useState(true);
  const [failedSections, setFailedSections] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: "no-store" as RequestCache };
    Promise.allSettled([
      apiRequest<BackendModList>("/api/v1/mods?sort=heat&order=desc&limit=8&offset=0", options),
      apiRequest<BackendModpackList>("/api/v1/modpacks?sort=published&order=desc&limit=4&offset=0", options),
      apiRequest<SimpleProjectList>("/api/v1/content-projects/plugin?sort=published&order=desc&limit=4&offset=0", options),
      loadCommunityPosts("tutorial", { sort: "heat", order: "desc", limit: 6, offset: 0 }, "", controller.signal),
      loadCommunityPosts("news", { sort: "published", order: "desc", limit: 6, offset: 0 }, "", controller.signal),
    ]).then(([mods, modpacks, plugins, tutorials, news]) => {
      if (controller.signal.aborted) return;
      const recent = [
        ...(fulfilled(modpacks)?.items ?? []).map(fromModpack),
        ...(fulfilled(plugins)?.items ?? []).map((item) => fromSimpleProject(item, locale)),
      ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 6);
      setFeed({
        hot: (fulfilled(mods)?.items ?? []).map(fromMod),
        recent,
        tutorials: fulfilled(tutorials)?.items ?? [],
        news: fulfilled(news)?.items ?? [],
      });
      setFailedSections([mods, modpacks, plugins, tutorials, news].filter((result) => result.status === "rejected").length);
      setLoading(false);
    });
    return () => controller.abort();
  }, [locale]);

  const featured = feed.hot[0];
  const hotGrid = useMemo(() => feed.hot.slice(featured ? 1 : 0, featured ? 7 : 6), [featured, feed.hot]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/mods?q=${encodeURIComponent(value)}` : "/mods");
  }

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <section className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--panel)]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,var(--accent-soft),transparent_38%),radial-gradient(circle_at_88%_80%,var(--panel-subtle),transparent_35%)]" />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-9 sm:py-12 lg:py-16">
        <p className="text-sm font-black tracking-wide text-[var(--accent)]">{t("home.kicker")}</p>
        <h1 className="mt-3 max-w-4xl break-all text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{t("home.heroTitle")}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base sm:leading-8">{t("home.heroDescription")}</p>
        <form className="mt-7 flex max-w-3xl flex-col gap-2 sm:flex-row" role="search" onSubmit={search}>
          <label className="sr-only" htmlFor="home-search">{t("home.searchPlaceholder")}</label>
          <input id="home-search" className="field h-12 min-w-0 flex-1" placeholder={t("home.searchPlaceholder")} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="button-primary focus-ring h-12 shrink-0 px-7" type="submit">{t("home.searchAction")}</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">{quickLinks.map((link) => <Link key={link.href} className="button-secondary focus-ring px-3 py-2 text-sm" href={link.href}>{t(link.titleKey)}</Link>)}</div>
      </div>
    </section>

    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:space-y-12 sm:py-10">
      <section aria-busy={loading}>
        <SectionHeader eyebrow={t("home.hotKicker")} title={t("home.hotTitle")} description={t("home.hotDescription")} href="/mods?sort=heat&order=desc" more={t("home.viewMore")} />
        {loading ? <ResourceSkeleton /> : featured ? <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"><FeaturedResource item={featured} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">{hotGrid.map((item) => <ResourceTile item={item} key={item.id} />)}</div></div> : <EmptySection text={t("home.noResources")} />}
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.8fr)]">
        <div>
          <SectionHeader eyebrow={t("home.tutorialKicker")} title={t("home.tutorialTitle")} href="/tutorials?sort=heat&order=desc" more={t("home.viewMore")} />
          {loading ? <ListSkeleton /> : feed.tutorials.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{feed.tutorials.map((item, index) => <CommunityCard featured={index === 0} item={item} key={item.id} />)}</div> : <EmptySection text={t("home.noTutorials")} />}
        </div>
        <div>
          <SectionHeader eyebrow={t("home.newsKicker")} title={t("home.newsTitle")} href="/news?sort=published&order=desc" more={t("home.viewMore")} />
          {loading ? <ListSkeleton compact /> : feed.news.length ? <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">{feed.news.map((item) => <NewsRow item={item} key={item.id} />)}</div> : <EmptySection text={t("home.noNews")} />}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow={t("home.recentKicker")} title={t("home.recentTitle")} description={t("home.recentDescription")} href="/modpacks?sort=published&order=desc" more={t("home.viewMore")} />
        {loading ? <ResourceSkeleton /> : feed.recent.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{feed.recent.map((item) => <ResourceTile item={item} key={`${item.typeKey}-${item.id}`} />)}</div> : <EmptySection text={t("home.noRecent")} />}
      </section>

      <section>
        <SectionHeader eyebrow={t("home.categoryKicker")} title={t("home.categoryTitle")} description={t("home.categoryDescription")} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{primaryCategories.map((item) => <CategoryLink item={item} key={item.href} />)}</div>
      </section>
      {!loading && failedSections > 0 ? <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-bold" role="status">{t("home.partialFailure")}</p> : null}
    </div>
  </main>;
}

function SectionHeader({ eyebrow, title, description, href, more }: { eyebrow: string; title: string; description?: string; href?: string; more?: string }) {
  return <header className="flex items-end justify-between gap-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">{eyebrow}</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h2>{description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}</div>{href ? <Link className="focus-ring shrink-0 rounded-md px-2 py-1 text-sm font-black text-[var(--accent)] hover:bg-[var(--accent-soft)]" href={href}>{more} <span aria-hidden="true">→</span></Link> : null}</header>;
}

function FeaturedResource({ item }: { item: HomeResource }) {
  const { locale, t } = useI18n();
  return <Link className="focus-ring group grid min-h-56 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg sm:grid-cols-[180px_1fr] sm:items-center sm:p-6" href={item.href}><ResourceVisual icon={item.icon} name={item.name} large /><div className="mt-5 min-w-0 sm:mt-0 sm:pl-6"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--accent)]">{t(item.typeKey)}</span>{item.versions.slice(0, 2).map((version) => <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold text-[var(--muted)]" key={version}>{version}</span>)}</div><h3 className="mt-4 text-2xl font-black group-hover:text-[var(--accent)] sm:text-3xl">{item.name}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{item.summary || t("home.resourceFallback")}</p><p className="mt-4 text-xs font-bold text-[var(--muted)]">{formatDate(item.timestamp, locale)}</p></div></Link>;
}

function ResourceTile({ item }: { item: HomeResource }) {
  const { t } = useI18n();
  return <Link className="focus-ring group min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={item.href}><div className="aspect-[4/3] bg-[var(--panel-subtle)] p-4"><ResourceVisual icon={item.icon} name={item.name} /></div><div className="p-3"><span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">{t(item.typeKey)}</span><h3 className="mt-1 line-clamp-2 text-sm font-black leading-5 group-hover:text-[var(--accent)]">{item.name}</h3></div></Link>;
}

function ResourceVisual({ icon, name, large = false }: { icon: string; name: string; large?: boolean }) {
  return <div className={`relative grid h-full place-items-center overflow-hidden rounded-xl bg-[linear-gradient(145deg,var(--accent-soft),var(--panel-subtle))] ${large ? "min-h-40" : ""}`}>{icon ? <Image unoptimized alt="" className="h-full w-full object-contain p-2 [image-rendering:auto]" height={large ? 180 : 120} src={icon} width={large ? 180 : 120} /> : <span aria-hidden="true" className={`${large ? "text-6xl" : "text-4xl"} font-black text-[var(--accent)] opacity-70`}>{resourceInitials(name)}</span>}</div>;
}

function CommunityCard({ item, featured }: { item: CommunityPost; featured: boolean }) {
  const { locale } = useI18n();
  return <Link className={`focus-ring group grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:border-[var(--accent)] ${featured ? "sm:col-span-2 sm:grid-cols-[minmax(180px,.8fr)_1.2fr]" : "grid-cols-[96px_1fr]"}`} href={`/${communityPostCollection(item.kind)}/${item.id}`}><div className={`relative bg-[linear-gradient(145deg,var(--accent-soft),var(--panel-subtle))] ${featured ? "min-h-48" : "min-h-28"}`}>{item.coverUrl ? <Image unoptimized fill alt="" className="object-cover" src={communityPostCoverURL(item.coverUrl)} /> : <span aria-hidden="true" className="grid h-full place-items-center text-3xl font-black text-[var(--accent)] opacity-70">{resourceInitials(item.title)}</span>}</div><div className={featured ? "p-5" : "min-w-0 p-3"}><p className="text-xs font-bold text-[var(--accent)]">{item.category || item.minecraftVersions[0] || "Minecraft"}</p><h3 className={`${featured ? "mt-2 text-xl sm:text-2xl" : "mt-1 text-sm"} line-clamp-2 font-black group-hover:text-[var(--accent)]`}>{item.title}</h3><p className="mt-2 text-xs text-[var(--muted)]">{item.authorName} · {formatDate(item.createdAt, locale)}</p>{featured ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{plainExcerpt(item.bodyMarkdown)}</p> : null}</div></Link>;
}

function NewsRow({ item }: { item: CommunityPost }) {
  const { locale } = useI18n();
  return <Link className="focus-ring group grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0 hover:bg-[var(--panel-subtle)]" href={`/${communityPostCollection(item.kind)}/${item.id}`}><div className="min-w-0"><h3 className="truncate text-sm font-black group-hover:text-[var(--accent)]">{item.title}</h3><p className="mt-1 truncate text-xs text-[var(--muted)]">{item.authorName}</p></div><time className="text-xs font-bold text-[var(--muted)]" dateTime={item.createdAt}>{formatDate(item.createdAt, locale)}</time></Link>;
}

function CategoryLink({ item }: { item: HomeCategory }) {
  const { t } = useI18n();
  return <Link className="focus-ring group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" href={item.href}><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--panel-subtle)] text-[10px] font-black text-[var(--accent)] group-hover:bg-[var(--panel)]">{item.meta}</span><span className="truncate text-sm font-black">{t(item.titleKey)}</span></Link>;
}

function ResourceSkeleton() {
  return <div className="mt-4 grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4" aria-label="loading"><div className="col-span-2 min-h-56 rounded-2xl bg-[var(--panel-subtle)]" />{Array.from({ length: 4 }, (_, index) => <div className="min-h-40 rounded-xl bg-[var(--panel-subtle)]" key={index} />)}</div>;
}

function ListSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className="mt-4 grid animate-pulse gap-3">{Array.from({ length: compact ? 5 : 3 }, (_, index) => <div className={`${compact ? "h-14" : "h-28"} rounded-xl bg-[var(--panel-subtle)]`} key={index} />)}</div>;
}

function EmptySection({ text }: { text: string }) {
  return <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-4 py-10 text-center text-sm font-bold text-[var(--muted)]">{text}</div>;
}

function fromMod(record: BackendModRecord): HomeResource {
  const item = backendModToCatalogEntry(record);
  return { id: record.siteId, name: record.secondaryName || record.primaryName, summary: record.summary, href: `/mods/${record.siteId}`, icon: item.icon, typeKey: "nav.mods", versions: item.versions, timestamp: record.updatedAt || record.createdAt };
}

function fromModpack(record: BackendModpackRecord): HomeResource {
  const item = backendModpackToCatalogEntry(record);
  return { id: record.siteId, name: record.secondaryName || record.primaryName, summary: record.summary, href: `/modpacks/${record.siteId}`, icon: item.icon, typeKey: "nav.modpacks", versions: item.versions, timestamp: record.publishedAt || record.createdAt };
}

function fromSimpleProject(record: SimpleProjectRecord, locale: string): HomeResource {
  const localization = localizedSimpleProject(record, locale);
  return { id: record.siteId, name: localization.name || record.siteId, summary: localization.summary, href: `/plugins/${record.siteId}`, icon: simpleProjectIconURL(record), typeKey: "nav.plugins", versions: record.minecraftVersions, timestamp: record.publishedAt || record.createdAt };
}

function fulfilled<T>(result: PromiseSettledResult<T>) { return result.status === "fulfilled" ? result.value : undefined; }
function resourceInitials(value: string) { return value.trim().slice(0, 2).toUpperCase() || "MC"; }
function plainExcerpt(value: string) { return value.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`\[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150); }
function formatDate(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date); }
