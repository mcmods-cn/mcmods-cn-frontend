"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { BackendModApplication } from "../_lib/mod-api";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { ModCatalogEntry } from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, uploadUserFileToOSS } from "../_lib/oss-upload";
import { MarkdownRenderer } from "./markdown-renderer";
import { ModCatalogData } from "./mod-catalog-data";
import { ProjectDownloads } from "./project-downloads";
import { CommentSection } from "./comment-section";
import { CreatorIdentityAvatar, CreatorTeamMemberGroup } from "./creator-identity";
import { RelatedCommunityPosts } from "./community-post-catalog";
import { ReviewAwareEditAction } from "./review-edit-lock";
import { RatingPanel } from "./rating-panel";
import { ProjectChangelog } from "./project-changelog";
import { ContentMetricsPanel } from "./content-metrics-panel";

type DetailTab = "introduction" | "relationships" | "data" | "downloads" | "changelog" | "gallery" | "discussion" | "tutorial" | "issues" | "news";

export function ModDetail({ mod }: { mod: ModCatalogEntry }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<DetailTab>();
  const tab = selectedTab ?? (searchParams.get("tab") === "changelog" ? "changelog" : "introduction");
  const [applicationKind, setApplicationKind] = useState<"editor" | "developer" | null>(null);
  const isChinese = locale.startsWith("zh");
  const displayName = isChinese && mod.localizedName ? mod.localizedName : mod.name;
  const secondaryName = displayName === mod.name ? mod.localizedName : mod.name;
  const summary = mod.summary || (mod.descriptionKey ? t(mod.descriptionKey) : "");
  const canEdit = Boolean(user && (user.id === mod.createdBy || [`project.editor.${mod.uniqueId}`, `project.owner.${mod.uniqueId}`, "project.edit"].some((required) => hasPermission(user, required))));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-[1440px] px-4 py-7 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className="text-sm font-bold text-[var(--accent)] hover:underline" href="/mods">{t("mods.detail.back")}</Link>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Link className="button-secondary focus-ring" href={`/mods/${mod.siteId}/history`}>{t("mods.detail.history")}</Link>{!canEdit ? user ? <><button className="button-secondary focus-ring" type="button" onClick={() => setApplicationKind("editor")}>{t("mods.applications.applyEditor")}</button><button className="button-secondary focus-ring" type="button" onClick={() => setApplicationKind("developer")}>{t("mods.applications.iAmDeveloper")}</button></> : <><Link className="button-secondary focus-ring" href={`/login?next=/mods/${mod.siteId}`}>{t("mods.applications.applyEditor")}</Link><Link className="button-secondary focus-ring" href={`/login?next=/mods/${mod.siteId}`}>{t("mods.applications.iAmDeveloper")}</Link></> : null}<ReviewAwareEditAction canEdit={canEdit} editHref={`/mods/${mod.siteId}/edit`} entityType="mod" publicId={mod.uniqueId} /></div>
          </div>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row">
            <ModIcon icon={mod.icon} name={displayName} alt={t("mods.card.iconAlt", { name: displayName })} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black sm:text-3xl">{mod.abbreviation ? `[${mod.abbreviation}] ` : ""}{displayName}</h1>
                <StatusBadge>{t(`mods.statuses.${mod.status}`)}</StatusBadge>
                {mod.certified ? <StatusBadge accent>{t("mods.card.verified")}</StatusBadge> : null}
                {mod.reviewStatus === "pending" ? <StatusBadge warning>{t("mods.detail.pendingReview")}</StatusBadge> : null}
              </div>
              {secondaryName && secondaryName !== displayName ? <p className="mt-1 font-semibold text-[var(--muted)]">{secondaryName}</p> : null}
              {summary ? <p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)] sm:text-base">{summary}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2"><DetailTag>{t(`mods.categories.${mod.primaryCategory}`)}</DetailTag>{mod.tags.slice(0, 6).map((tag) => <DetailTag key={tag}>{t(`mods.tags.${tag}`)}</DetailTag>)}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="text-xl font-black">{t("mods.detail.compatibility")}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3"><DetailLine label={t("mods.card.versions")} value={mod.versions.join("、") || t("mods.detail.notProvided")} /><DetailLine label={t("mods.card.loaders")} value={mod.loaders.join("、") || t("mods.detail.notProvided")} /><DetailLine label={t("mods.card.environment")} value={t(`mods.environments.${mod.environment}`)} /></div>
        </section>

        <div className="mt-5 lg:hidden"><ModSidebar mod={mod} locale={locale} /></div>

        <nav className="mt-5 flex overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]" aria-label={t("mods.detail.sections")}>
          {(["introduction", "relationships", "data", "downloads", "changelog", "gallery", "discussion", "tutorial", "issues", "news"] as DetailTab[]).map((item) => <button key={item} className={`focus-ring min-w-36 border-r border-[var(--line)] px-4 py-4 text-left last:border-r-0 ${tab === item ? "text-[var(--accent)]" : "text-[var(--muted)]"}`} type="button" onClick={() => setSelectedTab(item)}><strong className="block whitespace-nowrap">{t(`mods.detail.tabs.${item}`)}</strong><span className={`mt-2 block h-0.5 ${tab === item ? "bg-[var(--accent)]" : "bg-transparent"}`} /></button>)}
        </nav>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {tab === "data" ? <ModDataTab mod={mod} canEdit={canEdit} token={token} /> : null}
            {tab === "relationships" ? <ModRelationshipsTab mod={mod} /> : null}
            {tab === "downloads" ? <ProjectDownloads projectType="mod" projectId={mod.uniqueId} projectName={displayName} token={token} suggestedVersions={mod.versions} suggestedLoaders={mod.loaders} /> : null}
            {tab === "changelog" ? <ProjectChangelog targetId={mod.uniqueId} targetType="mod" /> : null}
            {tab === "introduction" ? <ModIntroductionTab mod={mod} /> : null}
            {tab === "gallery" ? <ProjectGallery images={mod.galleryImages ?? []} emptyText={t("mods.detail.emptyGallery")} /> : null}
            {tab === "discussion" ? <RelatedCommunityPosts kind="discussion" modId={mod.uniqueId} /> : null}
            {tab === "tutorial" ? <RelatedCommunityPosts kind="tutorial" modId={mod.uniqueId} /> : null}
            {tab === "issues" ? <RelatedCommunityPosts kind="issue" modId={mod.uniqueId} /> : null}
            {tab === "news" ? <RelatedCommunityPosts kind="news" modId={mod.uniqueId} /> : null}
          </div>
          <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:h-fit"><ModSidebar mod={mod} locale={locale} /></aside>
        </div>
        <ContentMetricsPanel publicId={mod.uniqueId} />
        <RatingPanel targetId={mod.uniqueId} targetName={displayName} targetType="mod" />
        <CommentSection targetKey={mod.uniqueId} targetType="mod" />
      </div>
      {applicationKind ? <ModApplicationModal kind={applicationKind} mod={mod} token={token} onClose={() => setApplicationKind(null)} /> : null}
    </main>
  );
}

export function ProjectGallery({ images, emptyText }: { images: NonNullable<ModCatalogEntry["galleryImages"]>; emptyText: string }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<(typeof images)[number] | null>(null);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [selected]);
  if (!images.length) return <EmptyState text={emptyText} />;
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{images.map((image, index) => <button className="group overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] text-left" key={image.publicId ?? index} type="button" onClick={() => setSelected(image)}>
    <Image unoptimized alt={image.name || `Gallery ${index + 1}`} className="aspect-video w-full object-cover transition group-hover:scale-[1.02]" height={720} src={modGalleryURL(image.url)} width={1280} />
    {image.name ? <span className="block truncate p-3 text-sm font-bold">{image.name}</span> : null}
  </button>)}</div>{selected ? <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4 sm:p-8" role="presentation" onMouseDown={() => setSelected(null)}>
    <div className="relative flex max-h-full max-w-[96vw] flex-col items-center" role="dialog" aria-modal="true" aria-label={selected.name || t("mods.detail.tabs.gallery")} onMouseDown={(event) => event.stopPropagation()}>
      <button className="focus-ring absolute right-2 top-2 z-10 rounded-md bg-black/70 px-3 py-2 text-sm font-black text-white" type="button" onClick={() => setSelected(null)}>{t("common.close")}</button>
      <Image unoptimized alt={selected.name || t("mods.detail.tabs.gallery")} className="h-auto max-h-[86vh] w-auto max-w-full rounded-lg object-contain shadow-2xl" height={1080} src={modGalleryURL(selected.url)} width={1920} />
      {selected.name ? <p className="mt-3 max-w-3xl text-center text-sm font-bold text-white">{selected.name}</p> : null}
    </div>
  </div> : null}</>;
}

function modGalleryURL(value?: string) {
  if (!value) return "";
  return value.startsWith("/") ? `${API_BASE_URL}${value}` : value;
}

function ModSidebar({ mod, locale }: { mod: ModCatalogEntry; locale: string }) {
  const { t } = useI18n();
  return <div className="space-y-4"><SidebarSection title={t("mods.detail.projectInfo")}><DetailLine label={t("mods.detail.siteId")} value={mod.siteId} /><DetailLine label={t("mods.detail.uniqueId")} value={mod.uniqueId} /><DetailLine label={t("mods.submission.fields.modId")} value={mod.modId || t("mods.detail.notProvided")} /><DetailLine label={t("mods.submission.fields.sourceStatus")} value={t(`mods.sources.${mod.sourceStatus}`)} /><DetailLine label={t("mods.detail.license")} value={mod.license} /><DetailLine label={t("mods.card.updated")} value={formatDate(mod.updatedAt, locale)} /></SidebarSection><SidebarSection title={t("mods.detail.team")}><ModCreatorAttributions mod={mod} /></SidebarSection>{mod.links?.length ? <SidebarSection title={t("mods.detail.relatedLinks")}><div className="grid grid-cols-2 gap-2">{mod.links.map((link, index) => <a className="focus-ring min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-center text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={link.url} key={`${link.type}-${index}`} rel="noreferrer" target="_blank" title={link.note || t(`mods.submission.linkTypes.${link.type}`)}><span className="block truncate">{t(`mods.submission.linkTypes.${link.type}`)}</span></a>)}</div></SidebarSection> : null}</div>;
}

function ModCreatorAttributions({ mod }: { mod: ModCatalogEntry }) {
  const { t } = useI18n();
  if (!mod.authorDetails?.length) return <p className="text-sm font-semibold text-[var(--muted)]">{mod.authors.join("、") || t("mods.detail.notProvided")}</p>;
  return <div className="grid gap-3">
    {mod.authorDetails.map((creator, index) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3" key={creator.creatorId || `${creator.name}:${index}`}>
      <div className="flex min-w-0 items-center gap-3">
        <CreatorIdentityAvatar creator={creator} />
        <span className="min-w-0 flex-1">
          {creator.creatorId ? <Link className="focus-ring block truncate font-black hover:text-[var(--accent)]" href={`${creator.kind === "team" ? "/teams" : "/authors"}/${creator.creatorId}`}>{creator.name}</Link> : <span className="block truncate font-black">{creator.name}</span>}
          <span className="mt-1 block truncate text-xs text-[var(--muted)]">{t(`creators.kinds.${creator.kind || "author"}`)}{creator.role ? ` · ${creator.role}` : ""}</span>
        </span>
      </div>
      {creator.kind === "team" && creator.members?.length ? <div className="mt-3"><CreatorTeamMemberGroup members={creator.members} /></div> : null}
    </article>)}
  </div>;
}

function ModDataTab({ mod, canEdit, token }: { mod: ModCatalogEntry; canEdit: boolean; token: string }) {
  return <ModCatalogData siteId={mod.siteId} token={token} canEdit={canEdit} />;
}

function ModIntroductionTab({ mod }: { mod: ModCatalogEntry }) {
  const { t } = useI18n();
  const summary = mod.summary || (mod.descriptionKey ? t(mod.descriptionKey) : "");
  return <DetailSection title={t("mods.detail.introduction")}>{mod.bodyMarkdown ? <div className="markdown-preview min-w-0"><MarkdownRenderer config={defaultMarkdownConfig} emptyText={t("mods.detail.noIntroduction")} markdown={mod.bodyMarkdown} /></div> : <p className="leading-7 text-[var(--muted)]">{summary || t("mods.detail.noIntroduction")}</p>}</DetailSection>;
}

function ModRelationshipsTab({ mod }: { mod: ModCatalogEntry }) {
  const { t } = useI18n();
  if (!mod.relationshipGroups?.length) return <EmptyState text={t("mods.detail.noRelationships")} />;
  return <div className="grid gap-4">{mod.relationshipGroups.map((group, index) => <section key={index} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><h3 className="font-black">{group.label || [group.loader, group.minecraftVersions.join(", "), group.modVersion].filter(Boolean).join(" / ") || t("mods.submission.commonCondition")}</h3><div className="mt-4 grid gap-3">{(["dependency", "integration", "conflict"] as const).map((type) => { const items = group.relationships.filter((item) => item.type === type); const labelKey = group.direction === "incoming" ? `mods.submission.incomingRelationshipTypes.${type}` : `mods.submission.relationshipTypes.${type}`; return items.length ? <div key={type}><strong className="text-sm text-[var(--muted)]">{t(labelKey)}</strong><div className="mt-2 flex flex-wrap gap-2">{items.map((item, itemIndex) => item.relatedModSiteId ? <Link key={`${item.relatedModName}-${itemIndex}`} className="rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={`/mods/${encodeURIComponent(item.relatedModSiteId)}`}>{item.relatedModName}</Link> : <span key={`${item.relatedModIdentifier}-${itemIndex}`} className="inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm font-bold"><span className="grid h-6 w-6 place-items-center rounded bg-[var(--panel)] font-black">?</span>{item.relatedModIdentifier || item.relatedModName}</span>)}</div></div> : null; })}</div></section>)}</div>;
}

function ModApplicationModal({ kind, mod, token, onClose }: { kind: "editor" | "developer"; mod: ModCatalogEntry; token: string; onClose: () => void }) {
  const { t } = useI18n();
  const [proof, setProof] = useState("");
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      const uploaded: Array<{ id: string; name: string; size: number }> = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) {
        const record = await uploadUserFileToOSS(file, token, "application");
        uploaded.push({ id: record.id, name: record.originalName, size: record.sizeBytes });
      }
      setAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.applications.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await apiRequest<BackendModApplication>(`/api/v1/mods/${encodeURIComponent(mod.siteId)}/applications`, { method: "POST", body: JSON.stringify({ kind, proof, attachmentIds: attachments.map((item) => item.id) }) }, token);
      setMessage(t("mods.applications.submitted"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.applications.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}><form className="surface max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] p-5 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{t(`mods.applications.${kind}Title`)}</h2><p className="mt-1 text-sm text-[var(--muted)]">{mod.localizedName || mod.name}</p></div><button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button></div><label className="mt-5 block"><span className="mb-1.5 block text-sm font-black">{t("mods.applications.proof")}</span><textarea className="field min-h-40 resize-y" required maxLength={10000} value={proof} placeholder={t(`mods.applications.${kind}ProofPlaceholder`)} onChange={(event) => setProof(event.target.value)} /></label><div className="mt-4"><span className="block text-sm font-black">{t("mods.applications.attachments")}</span><label className="button-secondary focus-ring mt-2 inline-flex cursor-pointer"><input className="sr-only" type="file" multiple disabled={uploading || attachments.length >= 10} onChange={(event) => void addFiles(event.target.files)} />{uploading ? t("mods.applications.uploading") : t("mods.applications.addAttachments")}</label><div className="mt-3 grid gap-2">{attachments.map((item) => <div key={`${item.id}-${item.name}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm"><span className="min-w-0 truncate">{item.name} · {formatBytes(item.size)}</span><button className="text-[var(--red)]" type="button" onClick={() => setAttachments((current) => current.filter((file) => file !== item))}>{t("common.delete")}</button></div>)}</div></div>{message ? <p className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}<div className="mt-5 flex justify-end gap-2"><button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary focus-ring" disabled={submitting || uploading} type="submit">{submitting ? t("mods.submission.actions.submitting") : t("mods.applications.submit")}</button></div></form></div>;
}

function ModIcon({ icon, name, alt }: { icon: string; name: string; alt: string }) {
  if (!icon) return <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] text-3xl font-black text-[var(--accent)] sm:h-28 sm:w-28">{name.slice(0, 1).toUpperCase()}</div>;
  return <Image unoptimized className="h-24 w-24 shrink-0 rounded-lg border border-[var(--line)] object-contain sm:h-28 sm:w-28" src={icon} alt={alt} width={112} height={112} />;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6"><h2 className="text-xl font-black">{title}</h2><div className="mt-5">{children}</div></section>; }
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><h2 className="font-black">{title}</h2><div className="mt-4 grid gap-3">{children}</div></section>; }
function DetailLine({ label, value }: { label: string; value: string }) { return <div className="grid gap-1"><span className="text-sm font-bold text-[var(--muted)]">{label}</span><span className="break-words text-sm font-semibold">{value}</span></div>; }
function DetailTag({ children }: { children: React.ReactNode }) { return <span className="rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1 text-sm font-bold">{children}</span>; }
function StatusBadge({ children, accent = false, warning = false }: { children: React.ReactNode; accent?: boolean; warning?: boolean }) { const colors = accent ? "border-[var(--accent)] text-[var(--accent)]" : warning ? "border-[var(--warning)] text-[var(--warning)]" : "border-[var(--line)] bg-[var(--panel-subtle)]"; return <span className={`rounded-md border px-2 py-1 text-xs font-bold ${colors}`}>{children}</span>; }
function EmptyState({ text }: { text: string }) { return <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-center font-bold text-[var(--muted)]">{text}</div>; }
function formatDate(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date); }
