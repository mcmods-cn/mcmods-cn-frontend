"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { modpackIconURL, modpackModIconURL, type BackendModpackRecord } from "../_lib/modpack-api";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { useI18n } from "../_lib/i18n-provider";
import { CommentSection } from "./comment-section";
import { RelatedCommunityPosts } from "./community-post-catalog";
import { CreatorIdentityAvatar, CreatorTeamMemberGroup } from "./creator-identity";
import { MarkdownRenderer } from "./markdown-renderer";
import { ProjectGallery } from "./mod-detail";
import { ProjectDownloads } from "./project-downloads";
import { ReviewAwareEditAction } from "./review-edit-lock";
import { RatingPanel } from "./rating-panel";
import { ProjectChangelog } from "./project-changelog";
import { ContentMetricsPanel } from "./content-metrics-panel";
import { ProjectFollowButton } from "./project-follow-button";
import { ProjectEditorApplicationButton } from "./project-editor-application";

type ModpackTab = "introduction" | "mods" | "downloads" | "changelog" | "gallery" | "discussion" | "tutorial" | "issues" | "news";

export function ModpackDetailLoader({ siteId }: { siteId: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const [record, setRecord] = useState<BackendModpackRecord>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    apiRequest<BackendModpackRecord>(`/api/v1/modpacks/${encodeURIComponent(siteId)}`, {}, token)
      .then((value) => { if (!cancelled) setRecord(value); })
      .catch((error) => { if (!cancelled && error instanceof ApiError && error.status === 404) setNotFound(true); });
    return () => { cancelled = true; };
  }, [ready, siteId, token]);

  if (record) return <ModpackDetail record={record} />;
  return <main className="grid min-h-[60vh] place-items-center px-4 text-center"><h1 className="text-2xl font-black">{notFound ? t("modpacks.detail.notFound") : t("common.loading")}</h1></main>;
}

function ModpackDetail({ record }: { record: BackendModpackRecord }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<ModpackTab>();
  const tab = selectedTab ?? (searchParams.get("tab") === "changelog" ? "changelog" : "introduction");
  const displayName = locale.startsWith("zh") && record.secondaryName ? record.secondaryName : record.primaryName;
  const secondaryName = displayName === record.primaryName ? record.secondaryName : record.primaryName;
  const versions = [...new Set(record.compatibilities.flatMap((item) => item.versions))];
  const loaders = record.compatibilities.map((item) => item.loader);

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-[1440px] px-4 py-7 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href="/modpacks">{t("modpacks.detail.back")}</Link><div className="flex flex-wrap gap-2"><Link className="button-secondary focus-ring" href={`/modpacks/${record.siteId}/history`}>{t("mods.detail.history")}</Link><ProjectEditorApplicationButton canEdit={Boolean(record.canEdit)} projectId={record.id} projectName={displayName} projectType="modpack" returnPath={`/modpacks/${record.siteId}`} /><ReviewAwareEditAction canEdit={Boolean(record.canEdit)} editHref={`/modpacks/${record.siteId}/edit`} entityType="modpack" publicId={record.id} /></div></div>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row"><ProjectIcon icon={modpackIconURL(record)} name={displayName} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">{record.abbreviation ? `[${record.abbreviation}] ` : ""}{displayName}</h1>{record.reviewStatus === "pending" ? <Badge>{t("mods.detail.pendingReview")}</Badge> : null}</div>{secondaryName && secondaryName !== displayName ? <p className="mt-1 font-semibold text-[var(--muted)]">{secondaryName}</p> : null}<p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)] sm:text-base">{record.summary}</p></div></div>
    </div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
      <div className="mb-4"><ProjectFollowButton publicId={record.id} /></div>
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("mods.detail.compatibility")}</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Detail label={t("mods.card.loaders")} value={loaders.join("、")} /><Detail label={t("mods.card.versions")} value={versions.join("、")} /><Detail label={t("mods.card.environment")} value={t(`mods.environments.${record.environment}`)} /><Detail label={t("modpacks.editor.packType")} value={t(`modpacks.packTypes.${record.packType || "native"}`)} /><Detail label={t("modpacks.editor.packagingMethod")} value={t(`modpacks.packagingMethods.${record.packagingMethod || "other"}`)} /><Detail label={t("modpacks.editor.categories")} value={record.tags.map((category) => t(`modpacks.categories.${category}`)).join("、")} /></div></section>
      <nav className="mt-5 flex overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]" aria-label={t("modpacks.detail.sections")}>{(["introduction", "mods", "downloads", "changelog", "gallery", "discussion", "tutorial", "issues", "news"] as ModpackTab[]).map((item) => <button key={item} className={`focus-ring min-w-36 border-r border-[var(--line)] px-4 py-4 text-left last:border-r-0 ${tab === item ? "text-[var(--accent)]" : "text-[var(--muted)]"}`} type="button" onClick={() => setSelectedTab(item)}><strong className="block whitespace-nowrap">{t(`modpacks.detail.tabs.${item}`)}</strong><span className={`mt-2 block h-0.5 ${tab === item ? "bg-[var(--accent)]" : "bg-transparent"}`} /></button>)}</nav>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0">
        {tab === "introduction" ? <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText={record.summary} markdown={record.bodyMarkdown} /></section> : null}
        {tab === "mods" ? <ModpackMods record={record} /> : null}
        {tab === "downloads" ? <ProjectDownloads projectType="modpack" projectId={record.id} projectName={displayName} token={token} suggestedVersions={versions} suggestedLoaders={loaders} /> : null}
        {tab === "changelog" ? <ProjectChangelog targetId={record.id} targetType="modpack" /> : null}
        {tab === "gallery" ? <ProjectGallery images={record.galleryImages} emptyText={t("mods.detail.emptyGallery")} /> : null}
        {tab === "discussion" ? <RelatedCommunityPosts kind="discussion" modId={record.id} /> : null}
        {tab === "tutorial" ? <RelatedCommunityPosts kind="tutorial" modId={record.id} /> : null}
        {tab === "issues" ? <RelatedCommunityPosts kind="issue" modId={record.id} /> : null}
        {tab === "news" ? <RelatedCommunityPosts kind="news" modId={record.id} /> : null}
      </div><aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit"><section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.detail.projectInfo")}</h2><div className="mt-4 grid gap-3"><Detail label={t("mods.detail.siteId")} value={record.siteId} /><Detail label={t("mods.detail.uniqueId")} value={record.id} /><Detail label={t("modpacks.detail.modCount")} value={String(record.mods.length)} /><Detail label={t("mods.detail.license")} value={record.license} /></div></section><ProjectLinks links={record.links} /><CreatorSection record={record} /></aside></div>
      <ContentMetricsPanel publicId={record.id} />
      <RatingPanel targetId={record.id} targetName={displayName} targetType="modpack" />
      <CommentSection targetKey={record.id} targetType="modpack" />
    </div>
  </main>;
}

function ModpackMods({ record }: { record: BackendModpackRecord }) {
  const { t } = useI18n();
  if (!record.mods.length) return <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-center font-bold text-[var(--muted)]">{t("modpacks.detail.noMods")}</div>;
  return <div className="grid gap-3 sm:grid-cols-2">{record.mods.map((mod, index) => {
    const name = mod.modName || mod.identifier || mod.providerProjectId || mod.fileName || t("modpacks.detail.unknownMod");
    const content = <><ResourceIcon icon={modpackModIconURL(mod)} name={name} resolved={mod.resolved} /><span className="min-w-0 flex-1"><strong className="block truncate">{name}</strong><span className="mt-1 block truncate text-xs text-[var(--muted)]">{mod.identifier || `${mod.provider}: ${mod.providerProjectId}`}</span><span className="mt-1 block text-xs font-semibold text-[var(--muted)]">{mod.clientRequired ? t("modpacks.detail.clientRequired") : ""}{mod.clientRequired && mod.serverRequired ? " · " : ""}{mod.serverRequired ? t("modpacks.detail.serverRequired") : ""}</span></span></>;
    return mod.resolved && mod.modSiteId ? <Link className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 hover:border-[var(--accent)]" href={`/mods/${mod.modSiteId}`} key={`${mod.provider}-${mod.providerProjectId}-${index}`}>{content}</Link> : <article className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3" key={`${mod.provider}-${mod.providerProjectId}-${index}`}>{content}</article>;
  })}</div>;
}

function ResourceIcon({ icon, name, resolved }: { icon?: string; name: string; resolved: boolean }) {
  if (icon) return <Image alt="" className="h-12 w-12 shrink-0 rounded-md object-contain" height={48} src={icon} width={48} />;
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] font-black text-[var(--muted)]">{resolved ? [...name].slice(0, 2).join("") : "?"}</span>;
}

function ProjectIcon({ icon, name }: { icon: string; name: string }) {
  return icon ? <Image alt="" className="h-24 w-24 shrink-0 rounded-lg border border-[var(--line)] object-cover sm:h-28 sm:w-28" height={112} src={icon} width={112} /> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] text-3xl font-black text-[var(--accent)] sm:h-28 sm:w-28">{[...name].slice(0, 2).join("")}</div>;
}

function CreatorSection({ record }: { record: BackendModpackRecord }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.detail.team")}</h2><div className="mt-4 grid gap-3">{record.authors.length ? record.authors.map((creator, index) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3" key={creator.creatorId || index}><div className="flex items-center gap-3"><CreatorIdentityAvatar creator={creator} /><span className="min-w-0"><strong className="block truncate">{creator.name}</strong><span className="text-xs text-[var(--muted)]">{creator.role}</span></span></div>{creator.kind === "team" && creator.members?.length ? <div className="mt-3"><CreatorTeamMemberGroup members={creator.members} /></div> : null}</article>) : <p className="text-sm text-[var(--muted)]">{t("mods.detail.notProvided")}</p>}</div></section>;
}

function ProjectLinks({ links }: { links: BackendModpackRecord["links"] }) {
  const { t } = useI18n();
  if (!links.length) return null;
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.submission.sections.links")}</h2><div className="mt-3 grid gap-2">{links.map((link, index) => <a className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={link.url} key={`${link.type}-${index}`} rel="noreferrer" target="_blank" title={link.note}>{t(`mods.submission.linkTypes.${link.type}`)}</a>)}</div></section>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="grid gap-1"><span className="text-sm font-bold text-[var(--muted)]">{label}</span><span className="break-words text-sm font-semibold">{value || "—"}</span></div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-md border border-[var(--warning)] px-2 py-1 text-xs font-bold text-[var(--warning)]">{children}</span>; }
