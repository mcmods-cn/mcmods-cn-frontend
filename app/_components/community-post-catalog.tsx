"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { communityPostCollection, communityPostCoverURL, loadCommunityPosts, type CommunityPost, type CommunityPostKind, type CommunityPostReference } from "../_lib/community-post-api";
import { catalogResourceIconURL } from "../_lib/editor-api";
import { useI18n } from "../_lib/i18n-provider";
import { modExportAssetURL } from "../_lib/mod-export-api";

export function CommunityPostCatalog({ kind }: { kind: CommunityPostKind }) {
  const { t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const pageSize = 24;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadCommunityPosts(kind, { query: submitted, limit: pageSize, offset: (page - 1) * pageSize }, token, controller.signal)
      .then((result) => { if (!cancelled) { setItems(result.items); setTotal(result.total); setMessage(""); } })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; controller.abort(); };
  }, [kind, page, submitted, token]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canCreate = hasPermission(user, `community.${kind}.create`);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1440px]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6"><div><p className="font-bold text-[var(--accent)]">{t("communityPosts.eyebrow")}</p><h1 className="mt-1 text-3xl font-black">{t(`communityPosts.${kind}.title`)}</h1><p className="mt-2 text-[var(--muted)]">{t(`communityPosts.${kind}.description`)}</p></div>{canCreate ? <Link className="button-primary focus-ring" href={`/${communityPostCollection(kind)}/new`}>+ {t(`communityPosts.${kind}.create`)}</Link> : !user ? <Link className="button-secondary focus-ring" href={`/login?next=/${communityPostCollection(kind)}/new`}>{t("communityPosts.loginToCreate")}</Link> : null}</header>
    <form className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(query.trim()); }}><input className="field" type="search" value={query} placeholder={t("communityPosts.search")} onChange={(event) => setQuery(event.target.value)} /><button className="button-primary focus-ring" type="submit">{t("common.search")}</button></form>
    {message ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <CommunityPostCard item={item} key={item.id} />)}</div>
    {!message && !items.length ? <div className="mt-6 grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--line)] text-center font-bold text-[var(--muted)]">{t("communityPosts.empty")}</div> : null}
    {pages > 1 ? <div className="mt-7 flex items-center justify-center gap-3"><button className="button-secondary focus-ring" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</button><span className="font-bold text-[var(--muted)]">{page} / {pages}</span><button className="button-secondary focus-ring" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</button></div> : null}
  </div></main>;
}

export function CommunityPostCard({ item }: { item: CommunityPost }) {
  const { locale, t } = useI18n();
  const href = `/${communityPostCollection(item.kind)}/${item.id}`;
  return <Link className="focus-ring group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={href}>
    <div className="relative aspect-[121/75] overflow-hidden bg-[var(--panel-subtle)]">{item.coverUrl ? <Image unoptimized fill alt="" className="object-cover transition group-hover:scale-[1.02]" src={communityPostCoverURL(item.coverUrl)} /> : <RotatingResourceIcon resources={item.resources} />}</div>
    <div className="p-5"><div className="flex flex-wrap gap-2">{item.minecraftVersions.slice(0, 3).map((version) => <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]" key={version}>{version}</span>)}{item.kind === "issue" && item.severity ? <span className="rounded bg-[var(--warning-soft)] px-2 py-1 text-xs font-bold text-[var(--warning)]">{t(`communityPosts.severity.${item.severity}`)}</span> : null}{item.kind === "discussion" ? <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]">{t(`communityPosts.bounty.status.${item.resolutionStatus || "open"}`)}</span> : null}</div><h2 className="mt-3 line-clamp-2 text-xl font-black group-hover:text-[var(--accent)]">{item.title}</h2><p className="mt-3 text-sm text-[var(--muted)]">{item.authorName} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</p></div>
  </Link>;
}

export function RelatedCommunityPosts({ modId, resourceId, compact = false, kind }: { modId?: string; resourceId?: string; compact?: boolean; kind?: CommunityPostKind }) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [groups, setGroups] = useState<Record<CommunityPostKind, CommunityPost[]>>({ tutorial: [], issue: [], news: [], discussion: [] });
  useEffect(() => {
    const controller = new AbortController();
    const options = { modId, resourceId, limit: compact ? 8 : 12, offset: 0 };
    const requestedKinds: CommunityPostKind[] = kind ? [kind] : ["tutorial", "issue", "news", "discussion"];
    Promise.all(requestedKinds.map(async (requestedKind) => [requestedKind, (await loadCommunityPosts(requestedKind, options, token, controller.signal)).items] as const))
      .then((results) => setGroups({ tutorial: [], issue: [], news: [], discussion: [], ...Object.fromEntries(results) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [compact, kind, modId, resourceId, token]);
  const visibleKinds: CommunityPostKind[] = kind ? [kind] : ["tutorial", "issue", "news", "discussion"];
  if (!visibleKinds.some((value) => groups[value].length)) return <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center font-bold text-[var(--muted)]">{t("communityPosts.empty")}</div>;
  if (compact) return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("communityPosts.related")}</h2><div className="mt-3 grid gap-3">{visibleKinds.map((value) => <RelatedLinkList key={value} title={t(relatedTitleKey(value))} items={groups[value]} />)}</div></section>;
  return <div className="grid gap-8">{visibleKinds.map((value) => <RelatedCardGroup key={value} title={t(relatedTitleKey(value))} items={groups[value]} />)}</div>;
}

function RelatedCardGroup({ title, items }: { title: string; items: CommunityPost[] }) {
  if (!items.length) return null;
  return <section><h2 className="mb-4 text-xl font-black">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <CommunityPostCard item={item} key={item.id} />)}</div></section>;
}

function RelatedLinkList({ title, items }: { title: string; items: CommunityPost[] }) {
  if (!items.length) return null;
  return <div><h3 className="text-sm font-black text-[var(--muted)]">{title}</h3><div className="mt-1 grid">{items.map((item) => <Link className="truncate py-1.5 font-bold hover:text-[var(--accent)] hover:underline" href={`/${communityPostCollection(item.kind)}/${item.id}`} key={item.id} title={item.title}>{item.title}</Link>)}</div></div>;
}

function relatedTitleKey(kind: CommunityPostKind) {
  switch (kind) {
    case "tutorial": return "communityPosts.relatedTutorials";
    case "issue": return "communityPosts.relatedIssues";
    case "news": return "communityPosts.relatedNews";
    case "discussion": return "communityPosts.relatedDiscussions";
  }
}

export function RotatingResourceIcon({ resources, compact = false }: { resources: CommunityPostReference[]; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (resources.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % resources.length), 1000);
    return () => window.clearInterval(timer);
  }, [resources.length]);
  const resource = resources[index % Math.max(1, resources.length)];
  const icon = resourceIcon(resource);
  const fallback = resource?.unresolved ? "?" : (resource?.name || resource?.identifier || "R").trim().slice(0, 2);
  return <div className="grid h-full w-full place-items-center">{icon ? <Image unoptimized alt="" className={compact ? "h-8 w-8 object-contain [image-rendering:pixelated]" : "h-24 w-24 object-contain [image-rendering:pixelated]"} height={compact ? 32 : 96} src={icon} width={compact ? 32 : 96} /> : <strong className={compact ? "text-sm text-[var(--muted)]" : "text-3xl text-[var(--muted)]"}>{fallback}</strong>}</div>;
}

function resourceIcon(resource?: CommunityPostReference) {
  if (!resource) return "";
  if (resource.iconUrl) return catalogResourceIconURL(resource.iconUrl);
  if (resource.revisionId && resource.iconPath) return modExportAssetURL(resource.revisionId, resource.iconPath);
  return "";
}
