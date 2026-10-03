"use client";

import { apiErrorMessage } from "../_lib/api-error.mts";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  CreatorDetail as CreatorDetailRecord,
  CreatorKind,
  CreatorRole,
  CreatorSummary,
  creatorHref,
  translatedRecord,
} from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, OSSFileRecord, uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { CommentSection } from "./comment-section";
import { FileDropZone } from "./file-drop-zone";
import { createOSSUploadBatchTasks, processOSSUploadBatch, type OSSUploadBatchTask } from "../_lib/oss-upload-batch.mts";
import { OSSUploadBatchStatus } from "./oss-upload-batch-status";
import { MarkdownRenderer } from "./markdown-renderer";
import { ReviewAwareEditAction } from "./review-edit-lock";

const claimMaximumFiles = 5;
const claimMaximumBytes = 10 << 20;

export function CreatorDetail({ kind, publicId }: { kind: CreatorKind; publicId: string }) {
  const { token, user } = useAuthSnapshot();
  return <CreatorDetailContent key={`${user?.id || "guest"}:${token}:${kind}:${publicId}`} kind={kind} publicId={publicId} />;
}

function CreatorDetailContent({ kind, publicId }: { kind: CreatorKind; publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [record, setRecord] = useState<CreatorDetailRecord | null>(null);
  const [roles, setRoles] = useState<CreatorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const loadController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const [detail, roleResult] = await Promise.all([
        apiRequest<CreatorDetailRecord>(`/api/v1/creators/${encodeURIComponent(publicId)}`, { signal: controller.signal }, token || undefined),
        apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles", { signal: controller.signal }, token || undefined),
      ]);
      if (controller.signal.aborted) return;
      if (detail.creator.kind !== kind) throw new Error(translation.current("creators.kindMismatch"));
      setRecord(detail);
      setRoles(roleResult.items);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRecord(null);
      notifySite(apiErrorMessage(error, translation.current, translation.current("creators.loadFailed")), translation.current("creators.title"), "danger");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [kind, publicId, token]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); loadController.current?.abort(); };
  }, [load, ready]);

  if (loading) return <CreatorPageState text={t("common.loading")} />;
  if (!record) return <CreatorPageState text={t("creators.notFound")} action={<button className="button-secondary focus-ring" type="button" onClick={() => void load()}>{t("common.retry")}</button>} />;

  const localized = creatorDisplayLocalization(record, locale);
  const creator = record.creator;
  const descriptionMarkdown = localized?.contentMarkdown || record.descriptionMarkdown;
  const listHref = "/authors";
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <Link className="focus-ring inline-flex rounded-sm text-sm font-bold text-[var(--accent)] hover:underline" href={listHref}>← {t("creators.backToList")}</Link>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-5">
              <CreatorAvatar creator={creator} size="large" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-black text-[var(--accent)]">{t(`creators.kinds.${creator.kind}`)}</span>
                  {creator.claimed ? <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-black">{t("creators.claimed")}</span> : null}
                  {record.claimStatus === "pending" ? <span className="rounded-md border border-[var(--warning)] px-2 py-1 text-xs font-black text-[var(--warning)]">{t("creators.claimPending")}</span> : null}
                  {creator.reviewStatus && creator.reviewStatus !== "approved" ? <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-black">{t(`creators.reviewStatuses.${creator.reviewStatus}`)}</span> : null}
                </div>
                <h1 className="mt-3 break-words text-3xl font-black">{creator.name}</h1>
                <p className="mt-2 font-mono text-sm text-[var(--muted)]">{creator.publicId}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ReviewAwareEditAction canEdit={record.canEditProfile} editHref={`${creatorHref(creator)}/edit`} entityType="creator" publicId={creator.publicId} />
              {creator.kind === "team" && record.canManageMembers ? <Link className="button-secondary focus-ring" href={`${creatorHref(creator)}/members`}>{t("creators.manageMembers")}</Link> : null}
              {record.canClaim ? <button className="button-secondary focus-ring" type="button" onClick={() => setClaimOpen(true)}>{t("creators.claim")}</button> : null}
              {creator.kind === "author" && !user && !record.claimedUser ? <Link className="button-secondary focus-ring" href={`/login?next=${encodeURIComponent(creatorHref(creator))}`}>{t("common.login")}</Link> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-7">
          <DetailSection title={t("creators.introduction")}><MarkdownRenderer emptyText={t("creators.noIntroduction")} markdown={descriptionMarkdown} /></DetailSection>
          {creator.kind === "team" ? <DetailSection title={t("creators.members")}>{record.members.length ? <div className="grid gap-3 sm:grid-cols-2">{record.members.map((member) => <Link className="focus-ring flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={`/authors/${member.creatorId}`} key={`${member.creatorId}:${member.role.id}`}><CreatorAvatar creator={member} /><span className="min-w-0 flex-1"><span className="block truncate font-black">{member.name}</span><span className="mt-1 block truncate text-sm text-[var(--muted)]">{member.title || roleDisplayName(member.role, roles, locale)}</span></span></Link>)}</div> : <EmptyLine>{t("creators.noMembers")}</EmptyLine>}</DetailSection> : null}
          {creator.kind === "author" ? <DetailSection title={t("creators.teams")}>{record.teams?.length ? <div className="grid gap-3 sm:grid-cols-2">{record.teams.map((membership) => <Link className="focus-ring flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={creatorHref(membership.team)} key={`${membership.team.publicId}:${membership.role.id}`}><CreatorAvatar creator={membership.team} /><span className="min-w-0 flex-1"><span className="block truncate font-black">{membership.team.name}</span><span className="mt-1 block truncate text-sm text-[var(--muted)]">{membership.title || roleDisplayName(membership.role, roles, locale)}</span></span></Link>)}</div> : <EmptyLine>{t("creators.noTeams")}</EmptyLine>}</DetailSection> : null}
          <DetailSection title={t("creators.works")}>{record.works.length ? <div className="grid gap-3 sm:grid-cols-2">{record.works.map((work) => <Link className="focus-ring flex min-w-0 gap-4 rounded-lg border border-[var(--line)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={`/mods/${work.siteId}`} key={work.uniqueId}><span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--panel-subtle)] font-black text-[var(--muted)]">{work.iconUrl ? <img alt="" className="h-full w-full object-cover" src={work.iconUrl} /> : "MOD"}</span><span className="min-w-0"><span className="block truncate font-black text-[var(--accent)]">{work.secondaryName || work.primaryName}</span>{work.secondaryName ? <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{work.primaryName}</span> : null}<span className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{work.summary}</span></span></Link>)}</div> : <EmptyLine>{t("creators.noWorks")}</EmptyLine>}</DetailSection>
        </div>

        <aside className="space-y-4">
          {record.claimedUser ? <section className="surface rounded-lg p-4"><h2 className="font-black">{t("creators.claimedAccount")}</h2><Link className="focus-ring mt-3 flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={`/user/${record.claimedUser.id}`}><CreatorAvatar creator={{ name: record.claimedUser.username, avatarUrl: record.claimedUser.avatarUrl }} /><span className="min-w-0"><span className="block truncate font-black">{record.claimedUser.username}</span><span className="block truncate text-xs text-[var(--muted)]">@{record.claimedUser.username}</span></span></Link></section> : null}
          <section className="surface rounded-lg p-4"><h2 className="font-black">{t("creators.relatedLinks")}</h2>{record.links.length ? <div className="mt-3 grid gap-2">{record.links.map((link) => <a className="focus-ring flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={link.url} key={`${link.type}:${link.url}`} rel="noreferrer" target="_blank"><span className="truncate">{link.label || link.type}</span><span aria-hidden="true">↗</span></a>)}</div> : <EmptyLine>{t("creators.noLinks")}</EmptyLine>}</section>
          <section className="surface rounded-lg p-4"><h2 className="font-black">{t("creators.collaborators")}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("creators.collaboratorsHint")}</p>{record.collaborators.length ? <div className="mt-3 grid gap-2">{record.collaborators.map((collaborator) => <Link className="focus-ring flex min-w-0 items-center gap-3 rounded-md border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={creatorHref(collaborator)} key={collaborator.publicId}><CreatorAvatar creator={collaborator} /><span className="min-w-0"><span className="block truncate font-black">{collaborator.name}</span><span className="block text-xs text-[var(--muted)]">{t(`creators.kinds.${collaborator.kind}`)}</span></span></Link>)}</div> : <EmptyLine>{t("creators.noCollaborators")}</EmptyLine>}</section>
        </aside>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-8"><CommentSection targetKey={publicId} targetType="creator" /></div>
      {claimOpen && token && creator.kind === "author" ? <ClaimCreatorDialog key={`${user?.id}:${token}:${creator.publicId}`} creator={creator} token={token} onClose={() => setClaimOpen(false)} onSubmitted={(status) => { setClaimOpen(false); notifySite(status === "approved" ? t("creators.claimApproved") : t("creators.claimSubmitted"), t("creators.claim"), "success"); void load(); }} /> : null}
    </main>
  );
}

function ClaimCreatorDialog({ creator, token, onClose, onSubmitted }: { creator: CreatorSummary; token: string; onClose: () => void; onSubmitted: (status: "pending" | "approved") => void }) {
  const { t } = useI18n();
  const [proofMarkdown, setProofMarkdown] = useState("");
  const [proofFiles, setProofFiles] = useState<OSSFileRecord[]>([]);
  const proofFilesRef = useRef(proofFiles);
  const operationInFlight = useRef(false);
  const submitted = useRef(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const mounted = useRef(true);
  const [uploadTasks, setUploadTasks] = useState<OSSUploadBatchTask<File, OSSFileRecord>[]>([]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function closeDialog() {
    if (!operationInFlight.current) onClose();
  }

  function removeProofFile(id: string) {
    if (operationInFlight.current || submitted.current) return;
    proofFilesRef.current = proofFilesRef.current.filter((item) => item.id !== id);
    setProofFiles(proofFilesRef.current);
  }

  async function uploadProofFiles(files: File[]) {
    if (!files.length || operationInFlight.current || submitted.current) return;
    if (proofFilesRef.current.length + files.length > claimMaximumFiles) {
      notifySite(t("creators.claimFileCount", { count: claimMaximumFiles }), t("creators.claim"), "danger");
      return;
    }
    const totalBytes = proofFilesRef.current.reduce((sum, file) => sum + Math.max(file.sizeBytes, file.sourceSizeBytes ?? 0), 0);
    if (totalBytes + files.reduce((sum, file) => sum + file.size, 0) > claimMaximumBytes) {
      notifySite(t("creators.claimFileSize", { size: formatBytes(claimMaximumBytes) }), t("creators.claim"), "danger");
      return;
    }
    const tasks = createOSSUploadBatchTasks<File, OSSFileRecord>(files, {
      capacity: Math.max(0, claimMaximumFiles - proofFilesRef.current.length),
      capacityError: t("creators.claimFileCount", { count: claimMaximumFiles }),
      identity: () => crypto.randomUUID(),
      validate: () => "",
    });
    await processFiles(tasks);
  }

  async function processFiles(tasks: OSSUploadBatchTask<File, OSSFileRecord>[], retryKey?: string) {
    if (operationInFlight.current || submitted.current) return;
    operationInFlight.current = true;
    setUploading(true);
    try {
      await processOSSUploadBatch(tasks, {
        upload: (file) => {
          if (!mounted.current) throw new DOMException("The application dialog was closed", "AbortError");
          return uploadUserFileToOSS(file, token, "creator-claim");
        },
        shouldProcess: retryKey ? (task) => task.key === retryKey : undefined,
        onChange: (next) => { if (mounted.current) setUploadTasks(next); },
        onUploaded: (_, record) => {
          if (!mounted.current || proofFilesRef.current.some((item) => item.id === record.id)) return;
          proofFilesRef.current = [...proofFilesRef.current, record];
          setProofFiles(proofFilesRef.current);
        },
      });
    } catch (error) {
      if (mounted.current) notifySite(apiErrorMessage(error, t, t("creators.claimUploadFailed")), t("creators.claim"), "danger");
    } finally {
      operationInFlight.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (operationInFlight.current || submitted.current) return;
    operationInFlight.current = true;
    setSubmitting(true);
    try {
      const result = await apiRequest<{ status: "pending" | "approved" }>(`/api/v1/creators/${encodeURIComponent(creator.publicId)}/claims`, { method: "POST", body: JSON.stringify({ proofMarkdown, proofFileIds: proofFilesRef.current.map((file) => file.id) }) }, token);
      submitted.current = true;
      if (mounted.current) setSubmittedSuccessfully(true);
      if (mounted.current) onSubmitted(result.status);
    } catch (error) {
      if (mounted.current) notifySite(apiErrorMessage(error, t, t("creators.claimFailed")), t("creators.claim"), "danger");
    } finally {
      operationInFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={closeDialog}><form className="surface max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-5" role="dialog" aria-modal="true" aria-label={t("creators.claimTitle", { name: creator.name })} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">{t("creators.claimTitle", { name: creator.name })}</h2><button className="button-secondary focus-ring" type="button" disabled={uploading || submitting} onClick={closeDialog}>{t("common.close")}</button></div><fieldset className="min-w-0" disabled={uploading || submitting || submittedSuccessfully}><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("creators.claimDescription")}</p><textarea className="field mt-4 min-h-44 resize-y" placeholder={t("creators.claimProof")} value={proofMarkdown} onChange={(event) => setProofMarkdown(event.target.value)} /><section className="mt-5 rounded-lg border border-[var(--line)] p-4"><h3 className="font-black">{t("creators.claimAttachments")}</h3><FileDropZone accept="" className="mt-3 min-h-28 p-4" disabled={uploading || submitting || submittedSuccessfully || proofFiles.length >= claimMaximumFiles} hint={t("creators.claimAttachmentsHint", { count: claimMaximumFiles, size: formatBytes(claimMaximumBytes) })} multiple title={uploading ? t("common.loading") : t("creators.uploadClaimAttachments")} onFiles={(files) => void uploadProofFiles(files)} /><OSSUploadBatchStatus busy={uploading || submitting || submittedSuccessfully} tasks={uploadTasks} onRetry={(key) => void processFiles(uploadTasks, key)} /><ul className="mt-3 grid gap-2">{proofFiles.map((file) => <li className="flex items-center justify-between gap-3 rounded-md bg-[var(--panel-subtle)] p-3" key={file.id}><span className="min-w-0 truncate text-sm font-bold">{file.originalName}</span><span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">{formatBytes(Math.max(file.sizeBytes, file.sourceSizeBytes ?? 0))}<button className="font-bold text-[var(--red)]" type="button" onClick={() => removeProofFile(file.id)}>{t("common.delete")}</button></span></li>)}</ul></section><div className="mt-5 flex justify-end"><button className="button-primary focus-ring" disabled={submitting || uploading} type="submit">{submitting ? t("common.loading") : t("creators.submitClaim")}</button></div></fieldset></form></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-[var(--line)] pb-7"><h2 className="mb-4 text-2xl font-black">{title}</h2>{children}</section>;
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{children}</p>;
}

function CreatorPageState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <main className="grid min-h-[65vh] place-items-center bg-[var(--background)] px-4"><div className="surface w-full max-w-lg rounded-lg p-6 text-center text-sm text-[var(--muted)]"><p>{text}</p>{action ? <div className="mt-3">{action}</div> : null}</div></main>;
}

function CreatorAvatar({ creator, size = "normal" }: { creator: Pick<CreatorSummary, "avatarUrl" | "name">; size?: "normal" | "large" }) {
  const sizes = size === "large" ? "h-24 w-24 text-3xl" : "h-11 w-11 text-base";
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-black text-[var(--accent)] ${sizes}`}>{creator.avatarUrl ? <img alt="" className="h-full w-full object-cover" src={creator.avatarUrl} /> : creator.name.trim().slice(0, 1).toUpperCase()}</span>;
}

function roleDisplayName(role: Pick<CreatorRole, "id" | "name">, roles: CreatorRole[], locale: string) {
  const full = roles.find((item) => item.id === role.id);
  return full ? translatedRecord(full.translations, locale, "name", full.name) : role.name;
}

function creatorDisplayLocalization(record: CreatorDetailRecord, locale: string) {
  const localizations = record.localizations ?? [];
  const normalizedLocale = locale.toLowerCase();
  return localizations.find((item) => item.locale.toLowerCase() === normalizedLocale)
    ?? localizations.find((item) => item.locale.toLowerCase() === record.defaultLocale?.toLowerCase())
    ?? localizations[0];
}
