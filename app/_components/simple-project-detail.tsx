"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { useI18n } from "../_lib/i18n-provider";
import { largeProjectIconURL, largeProjectPath, localizedSimpleProject, simpleProjectConfig, simpleProjectIconURL, type SimpleProjectRecord, type SimpleProjectType } from "../_lib/simple-project-api";
import { CommentSection } from "./comment-section";
import { RelatedCommunityPosts } from "./community-post-catalog";
import { CreatorIdentityAvatar, CreatorTeamMemberGroup } from "./creator-identity";
import { MarkdownRenderer } from "./markdown-renderer";
import { ProjectGallery } from "./mod-detail";
import { ProjectDownloads } from "./project-downloads";
import { ProjectChangelog } from "./project-changelog";
import { ReviewAwareEditAction } from "./review-edit-lock";
import { RatingPanel } from "./rating-panel";
import { ContentMetricsPanel } from "./content-metrics-panel";
import { ProjectAutoUpdateSettings } from "./project-auto-update-settings";
import { UnifiedReportButton, type ReportTargetType } from "./unified-report-dialog";
import { ProjectFollowButton } from "./project-follow-button";
import { ProjectEditorApplicationButton } from "./project-editor-application";

type ProjectTab = "introduction" | "downloads" | "changelog" | "gallery" | "discussion" | "tutorial" | "issues" | "news";

export function SimpleProjectDetailLoader({ projectType, siteId }: { projectType: SimpleProjectType; siteId: string }) {
  const { ready, token, user } = useAuthSnapshot();
  const { t } = useI18n();
  const [result, setResult] = useState<{ scope: string; value?: SimpleProjectRecord; error?: string; notFound?: boolean }>();
  const [reload, setReload] = useState(0);
  const scope = JSON.stringify([projectType, siteId, token, user?.id, reload]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const controller = new AbortController();
    apiRequest<SimpleProjectRecord>(`/api/v1/content-projects/${projectType}/${encodeURIComponent(siteId)}`, { signal: controller.signal }, token).then((value) => {
      if (!cancelled) setResult({ scope, value });
    }).catch((error) => {
      if (!cancelled) setResult({ scope, notFound: error instanceof ApiError && error.status === 404, error: error instanceof Error ? error.message : t("common.error") });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [projectType, ready, scope, siteId, t, token]);
  if (!ready || result?.scope !== scope) return <main className="grid min-h-[60vh] place-items-center px-4 text-center"><h1 className="text-2xl font-black">{t("common.loading")}</h1></main>;
  if (!result.value) return <main className="grid min-h-[60vh] place-items-center px-4 text-center"><div role="alert"><h1 className="text-2xl font-black">{result.notFound ? t("largeProjects.detail.notFound") : result.error}</h1>{!result.notFound ? <button className="button-secondary focus-ring mt-4" type="button" onClick={() => setReload((value) => value + 1)}>{t("common.retry")}</button> : null}</div></main>;
  return <SimpleProjectDetail key={scope} record={result.value} />;
}
function SimpleProjectDetail({ record }: { record: SimpleProjectRecord }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<ProjectTab>();
  const tab = selectedTab ?? (searchParams.get("tab") === "changelog" ? "changelog" : "introduction");
  const config = simpleProjectConfig(record.projectType);
  const localization = localizedSimpleProject(record, locale);
  const name = localization.name || record.siteId;
  const information = useMemo(() => projectInformation(record), [record]);

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-[1440px] px-4 py-7 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={config.path}>← {t("largeProjects.detail.back")}</Link><div className="flex flex-wrap gap-2"><Link className="button-secondary focus-ring" href={`${config.path}/${record.siteId}/history`}>{t("mods.detail.history")}</Link><UnifiedReportButton targetAuthor={record.authors.map((item) => item.name).filter(Boolean).join("、")} targetId={record.id} targetSummary={name} targetType={reportTypeForProject(record.projectType)} /><ProjectEditorApplicationButton canEdit={Boolean(record.canEdit)} projectId={record.id} projectName={name} projectType={record.projectType} returnPath={`${config.path}/${record.siteId}`} /><ReviewAwareEditAction canEdit={Boolean(record.canEdit)} editHref={`${config.path}/${record.siteId}/edit`} entityType={record.projectType} publicId={record.id} /></div></div>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row"><ProjectIcon icon={simpleProjectIconURL(record)} name={name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">{record.abbreviation ? `[${record.abbreviation}] ` : ""}{name}</h1>{record.reviewStatus === "pending" ? <span className="rounded border border-[var(--warning)] px-2 py-1 text-xs font-black text-[var(--warning)]">{t("mods.detail.pendingReview")}</span> : null}</div><p className="mt-2 font-mono text-xs text-[var(--muted)]">{record.id} · {record.siteId}</p><p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)] sm:text-base">{localization.summary}</p></div></div>
    </div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
      <div className="mb-4"><ProjectFollowButton publicId={record.id} /></div>
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("mods.detail.compatibility")}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label={t("largeProjects.fields.minecraftVersions")} value={record.minecraftVersions.join("、")} /><Detail label={t("largeProjects.fields.loaders")} value={record.loaders.map((value) => t(`largeProjects.options.${value}`)).join("、")} />{information.map((item) => <Detail key={item.label} label={t(item.label)} value={item.values.map((value) => t(`largeProjects.options.${value}`)).join("、")} />)}</div></section>
      <nav className="mt-5 flex overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]" aria-label={t("largeProjects.detail.sections")}>{(["introduction", "downloads", "changelog", "gallery", "discussion", "tutorial", "issues", "news"] as ProjectTab[]).map((item) => <button className={`focus-ring min-w-36 border-r border-[var(--line)] px-4 py-4 text-left last:border-r-0 ${tab === item ? "text-[var(--accent)]" : "text-[var(--muted)]"}`} key={item} type="button" onClick={() => setSelectedTab(item)}><strong className="block whitespace-nowrap">{t(`largeProjects.detail.tabs.${item}`)}</strong><span className={`mt-2 block h-0.5 ${tab === item ? "bg-[var(--accent)]" : "bg-transparent"}`} /></button>)}</nav>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0">
        {tab === "introduction" ? <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText={localization.summary} markdown={localization.bodyMarkdown} /></section> : null}
        {tab === "downloads" ? <ProjectDownloads projectType={record.projectType} projectId={record.id} projectName={name} token={token} suggestedVersions={record.minecraftVersions} suggestedLoaders={record.loaders} /> : null}
        {tab === "changelog" ? <ProjectChangelog targetId={record.id} targetType={record.projectType} /> : null}
        {tab === "gallery" ? <ProjectGallery images={record.galleryImages} emptyText={t("mods.detail.emptyGallery")} /> : null}
        {tab === "discussion" ? <RelatedCommunityPosts kind="discussion" modId={record.id} /> : null}
        {tab === "tutorial" ? <RelatedCommunityPosts kind="tutorial" modId={record.id} /> : null}
        {tab === "issues" ? <RelatedCommunityPosts kind="issue" modId={record.id} /> : null}
        {tab === "news" ? <RelatedCommunityPosts kind="news" modId={record.id} /> : null}
      </div><aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.detail.projectInfo")}</h2><div className="mt-4 grid gap-3"><Detail label={t("largeProjects.fields.categories")} value={record.categories.map((value) => t(`largeProjects.options.${value}`)).join("、")} /><Detail label={t("largeProjects.fields.features")} value={record.features.map((value) => t(`largeProjects.options.${value}`)).join("、")} /><Detail label={t("mods.detail.license")} value={record.license} /></div></section>
        <ProjectLinks links={record.links} />
        {record.projectType === "addon" ? <ParentProjects record={record} /> : null}
        <CreatorSection record={record} />
      </aside></div>
      <ContentMetricsPanel publicId={record.id} />
      <RatingPanel targetId={record.id} targetName={name} targetType={record.projectType} />
      {record.canEdit && token ? <ProjectAutoUpdateSettings projectId={record.id} projectType={record.projectType} token={token} /> : null}
      <CommentSection targetKey={record.id} targetType={record.projectType} />
    </div>
  </main>;
}

function projectInformation(record: SimpleProjectRecord) {
  const result: Array<{ label: string; values: string[] }> = [];
  if (record.resolution) result.push({ label: "largeProjects.fields.resolution", values: [record.resolution] });
  if (record.performance) result.push({ label: "largeProjects.fields.performance", values: [record.performance] });
  if (record.mapSize) result.push({ label: "largeProjects.fields.mapSize", values: [record.mapSize] });
  return result;
}

function reportTypeForProject(projectType: SimpleProjectType): ReportTargetType {
  return projectType === "shader_pack" ? "shader" : projectType;
}

function ProjectIcon({ icon, name }: { icon: string; name: string }) { return icon ? <Image unoptimized alt="" className="h-24 w-24 shrink-0 rounded-xl border border-[var(--line)] object-contain sm:h-28 sm:w-28" height={112} src={icon} width={112} /> : <span className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-2xl font-black text-[var(--accent)] sm:h-28 sm:w-28">{[...name].slice(0, 2).join("")}</span>; }
function Detail({ label, value }: { label: string; value: string }) { const { t } = useI18n(); return <div className="grid gap-1"><span className="text-sm font-bold text-[var(--muted)]">{label}</span><span className="break-words text-sm font-semibold">{value || t("mods.detail.notProvided")}</span></div>; }

function ProjectLinks({ links }: { links: SimpleProjectRecord["links"] }) { const { t } = useI18n(); if (!links.length) return null; return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.submission.sections.links")}</h2><div className="mt-3 grid gap-2">{links.map((link, index) => <a className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={link.url} key={`${link.type}-${index}`} rel="noreferrer" target="_blank" title={link.note}>{t(`mods.submission.linkTypes.${link.type}`)}</a>)}</div></section>; }

function CreatorSection({ record }: { record: SimpleProjectRecord }) { const { t } = useI18n(); return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("mods.detail.team")}</h2><div className="mt-4 grid gap-3">{record.authors.length ? record.authors.map((creator, index) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3" key={creator.creatorId || index}><div className="flex items-center gap-3"><CreatorIdentityAvatar creator={creator} /><span className="min-w-0"><strong className="block truncate">{creator.name}</strong><span className="text-xs text-[var(--muted)]">{creator.role}</span></span></div>{creator.kind === "team" && creator.members?.length ? <div className="mt-3"><CreatorTeamMemberGroup members={creator.members} /></div> : null}</article>) : <p className="text-sm text-[var(--muted)]">{t("mods.detail.notProvided")}</p>}</div></section>; }

function ParentProjects({ record }: { record: SimpleProjectRecord }) { const { t } = useI18n(); return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{t("largeProjects.fields.parentProjects")}</h2><div className="mt-3 grid gap-2">{record.parentProjects.map((parent, index) => { const iconUrl = largeProjectIconURL(parent); const content = <><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-[var(--panel-subtle)]">{iconUrl ? <Image unoptimized alt="" height={40} src={iconUrl} width={40} /> : parent.unresolved ? "?" : [...(parent.name || parent.identifier || "R")].slice(0, 2).join("")}</span><span className="min-w-0"><strong className="block truncate">{parent.name || parent.identifier}</strong><small className="text-[var(--muted)]">{t(`largeProjects.types.${parent.type}`)}</small></span></>; return parent.publicId && parent.siteId ? <Link className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={largeProjectPath(parent.type, parent.siteId)} key={parent.publicId}>{content}</Link> : <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2" key={`${parent.type}-${parent.identifier}-${index}`}>{content}</div>; })}</div></section>; }
