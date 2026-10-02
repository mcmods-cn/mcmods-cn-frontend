"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  CreatorDetail,
  CreatorImportResult,
  CreatorKind,
  CreatorLink,
  CreatorLocalization,
  CreatorSnapshot,
  creatorHref,
} from "../_lib/community-api";
import { creatorProfilePayload } from "../_lib/creator-capabilities.mts";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { DraftAutosaveStatus } from "./draft-autosave-status";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { ToolsPlayground } from "./tools-playground";
import { SquareImageCropDialog } from "./square-image-crop-dialog";
import { ReviewLockGate } from "./review-edit-lock";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

export function CreatorEditorPage({ initialKind, publicId = "" }: { initialKind: CreatorKind; publicId?: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const creatorDetail = publicId
        ? await apiRequest<CreatorDetail>(`/api/v1/creators/${encodeURIComponent(publicId)}`, {}, token)
        : null;
      if (creatorDetail && creatorDetail.creator.kind !== initialKind) throw new Error(t("creators.kindMismatch"));
      if (creatorDetail && !creatorDetail.canEditProfile) throw new Error(t("creators.editDenied"));
      setDetail(creatorDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("creators.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [initialKind, publicId, t, token]);

  useEffect(() => {
    if (!ready || !token) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, ready, token]);

  if (!ready || (token && loading)) return <PageFeedback title={t("common.loading")} />;
  if (!token) return <LoginRequiredState nextPath={publicId ? `${creatorBaseHref(initialKind)}/${publicId}/edit` : initialKind === "team" ? "/teams/new" : "/authors/new"} description={t("creators.editLoginRequired")} />;
  if (error || (publicId && !detail)) return <PageFeedback title={error || t("creators.notFound")} tone="danger" />;

  const editor = <CreatorEditorForm detail={detail} initialKind={initialKind} token={token} />;
  return publicId
    ? <ReviewLockGate entityType="creator" publicId={publicId} returnHref={`${creatorBaseHref(initialKind)}/${publicId}`}>{editor}</ReviewLockGate>
    : editor;
}

function CreatorEditorForm({ detail, initialKind, token }: { detail: CreatorDetail | null; initialKind: CreatorKind; token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const editing = Boolean(detail);
  const [kind, setKind] = useState<CreatorKind>(detail?.creator.kind ?? initialKind);
  const [name, setName] = useState(detail?.creator.name ?? "");
  const initialDefaultLocale = (detail?.defaultLocale || "zh-CN") as Locale;
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialDefaultLocale);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialDefaultLocale);
  const [localizations, setLocalizations] = useState<CreatorLocalization[]>(() => creatorEditorLocalizations(detail, initialDefaultLocale));
  const [avatarUrl, setAvatarUrl] = useState(detail?.creator.avatarUrl ?? "");
  const [avatarFileId, setAvatarFileId] = useState<string | undefined>(detail?.avatarFileId);
  const [links, setLinks] = useState<CreatorLink[]>(detail?.links ?? []);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File>();
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedAvatarPreviewUrl, setImportedAvatarPreviewUrl] = useState("");
  const [importedMemberPreviews, setImportedMemberPreviews] = useState<CreatorImportResult["members"]>([]);
  const [saving, setSaving] = useState(false);

  const autoDraft = useAutoDraft({
    token,
    draftKey: `creator:${detail?.creator.publicId || `new:${initialKind}`}`,
    projectKey: `creator:${detail?.creator.publicId || `new:${initialKind}`}`,
    kind: "creator",
    title: name.trim() || t(kind === "team" ? "creators.kinds.team" : "creators.kinds.author"),
    editUrl: detail
      ? `${creatorBaseHref(detail.creator.kind)}/${detail.creator.publicId}/edit`
      : `${creatorBaseHref(initialKind)}/new`,
    enabled: true,
    value: {
      kind,
      name,
      defaultLocale,
      selectedLocale,
      localizations,
      avatarUrl,
      avatarFileId,
      links,
    },
    onRestore: (restored) => {
      setKind(restored.kind);
      setName(restored.name);
      setDefaultLocale(restored.defaultLocale);
      setSelectedLocale(restored.selectedLocale);
      setLocalizations(restored.localizations);
      setAvatarUrl(restored.avatarUrl);
      setAvatarFileId(restored.avatarFileId);
      setLinks(restored.links);
    },
  });

  const localized = creatorLocalization(localizations, selectedLocale);
  const localizationVersions = localizations.map((item) => ({
    locale: item.locale,
    fields: item,
    provenance: "human" as const,
    reviewStatus: "approved" as const,
    editable: true,
  }));

  const returnHref = detail ? creatorHref(detail.creator) : "/authors";
  const snapshot = useMemo<CreatorSnapshot>(() => ({
    kind,
    name: name.trim(),
    descriptionMarkdown: creatorLocalization(localizations, defaultLocale).contentMarkdown,
    defaultLocale,
    localizations,
    avatarUrl,
    avatarFileId,
    links: links
      .map((link) => ({ type: link.type.trim(), url: link.url.trim(), label: link.label.trim() }))
      .filter((link) => link.type && link.url),
    members: [],
  }), [avatarFileId, avatarUrl, defaultLocale, kind, links, localizations, name]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, `creator_avatar:${kind}:${detail?.creator.publicId || "new"}`);
      setAvatarFileId(uploaded.id);
      setAvatarUrl(uploaded.storageUrl || uploaded.accessUrl || uploaded.url || "");
      setImportedAvatarPreviewUrl("");
    } catch (uploadError) {
      notifySite(uploadError instanceof Error ? uploadError.message : t("creators.avatarUploadFailed"), t("creators.avatar"), "danger");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function importCreatorProfile() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const imported = await apiRequest<CreatorImportResult>("/api/v1/creator-imports", {
        method: "POST",
        body: JSON.stringify({ kind, url: importUrl.trim() }),
      }, token);
      setName(imported.name);
      setImportedAvatarPreviewUrl(imported.avatarUrl);
      setImportedMemberPreviews(imported.members);
      setLinks((current) => mergeImportedCreatorLinks(current, imported.links));
      notifySite(t("creators.importSucceeded"), t("creators.importProfile"), "success");
    } catch (importError) {
      notifySite(importError instanceof Error ? importError.message : t("creators.importFailed"), t("creators.importProfile"), "danger");
    } finally {
      setImporting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snapshot.name) return;
    setSaving(true);
    try {
      const profilePayload = creatorProfilePayload(snapshot);
      const result = editing
        ? await apiRequest<{ reviewStatus: "pending" | "approved"; changeRequestId: string }>(`/api/v1/creators/${encodeURIComponent(detail!.creator.publicId)}`, { method: "PUT", body: JSON.stringify(profilePayload) }, token)
        : await apiRequest<{ publicId: string; reviewStatus: "pending" | "approved"; changeRequestId: string }>("/api/v1/creators", { method: "POST", body: JSON.stringify(profilePayload) }, token);
      const publicId = editing ? detail!.creator.publicId : "publicId" in result ? result.publicId : "";
      const targetUrl = `${creatorBaseHref(kind)}/${publicId}`;
      await autoDraft.completeDraft({
        projectKey: `creator:${publicId}`,
        projectTitle: snapshot.name,
        targetUrl,
        changeRequestId: result.changeRequestId,
      });
      notifySite(result.reviewStatus === "pending" ? t(editing ? "creators.editSubmitted" : "creators.createSubmitted") : t(editing ? "creators.editSaved" : "creators.createSaved"), t("creators.title"), "success");
      router.push(targetUrl);
    } catch (saveError) {
      notifySite(saveError instanceof Error ? saveError.message : t(editing ? "creators.editFailed" : "creators.createFailed"), t("creators.title"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <form className="mx-auto max-w-7xl px-4 py-7" onSubmit={submit}>
        <Link className="focus-ring inline-flex rounded-sm text-sm font-bold text-[var(--accent)] hover:underline" href={returnHref}>← {t(editing ? "creators.backToDetail" : "creators.backToList")}</Link>
        <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-3xl font-black">{editing ? t("creators.editTitle", { name: detail!.creator.name }) : t("creators.createTitle")}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{t("creators.editReviewHint")}</p>
          </div>
          <div className="flex gap-2">
            <DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} />
            <Link className="button-secondary focus-ring" href={returnHref}>{t("common.cancel")}</Link>
            <button className="button-primary focus-ring" disabled={saving || !name.trim()} type="submit">{saving ? t("common.loading") : t(editing ? "common.save" : "common.create")}</button>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-black">{t("creators.importProfile")}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t(kind === "team" ? "creators.importTeamHint" : "creators.importAuthorHint")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className="field"
              placeholder={kind === "team" ? "https://modrinth.com/organization/..." : "https://modrinth.com/user/..."}
              type="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void importCreatorProfile();
              }}
            />
            <button className="button-secondary focus-ring" disabled={importing || !importUrl.trim()} type="button" onClick={() => void importCreatorProfile()}>
              {importing ? t("common.loading") : t("creators.importAction")}
            </button>
          </div>
          {importedMemberPreviews.length ? <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] p-3"><p className="text-sm font-bold">{t("creators.importMemberPreview", { count: importedMemberPreviews.length })}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("creators.importMemberPreviewHint")}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{importedMemberPreviews.map((member, index) => <article className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3" key={`${member.profileUrl || member.name}:${index}`}><CreatorAvatar avatarUrl={member.avatarUrl} name={member.name} /><span className="min-w-0 flex-1"><span className="block truncate font-black">{member.name}</span><span className="block truncate text-xs text-[var(--muted)]">{member.externalRole || t("creators.importRoleUnknown")} → {member.suggestedRole}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${member.permissionGranting ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{t(member.permissionGranting ? "creators.importRoleGrantsAccess" : "creators.importRoleDisplayOnly")}</span></span></article>)}</div></div> : null}
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {!editing ? <label className="block"><span className="mb-1 block text-sm font-black">{t("creators.kind")}</span><select className="field" value={kind} onChange={(event) => { setKind(event.target.value as CreatorKind); setImportedAvatarPreviewUrl(""); setImportedMemberPreviews([]); }}><option value="author">{t("creators.kinds.author")}</option><option value="team">{t("creators.kinds.team")}</option></select></label> : null}
          <label className={`block ${editing ? "lg:col-span-2" : ""}`}><span className="mb-1 block text-sm font-black">{t("creators.name")}</span><input className="field" autoFocus={!editing} maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} /></label>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_260px]">
          <ContentLanguageSwitcher value={selectedLocale} versions={localizationVersions} onChange={setSelectedLocale} />
          <label className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-black">
            {t("mods.submission.defaultLocale")}
            <select className="field mt-3" value={defaultLocale} onChange={(event) => {
              const nextLocale = event.target.value as Locale;
              setDefaultLocale(nextLocale);
              setSelectedLocale(nextLocale);
              setLocalizations((current) => ensureCreatorLocalization(current, nextLocale));
            }}>
              {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--line)] p-4">
              <h2 className="font-black">{t("creators.avatar")}</h2>
              <div className="mt-3 flex items-center gap-3"><CreatorAvatar avatarUrl={importedAvatarPreviewUrl || avatarUrl} name={name} /><label className="button-secondary focus-ring cursor-pointer">{uploadingAvatar ? t("common.loading") : t("creators.chooseAvatar")}<input className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/apng,.apng" disabled={uploadingAvatar} type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setAvatarCropFile(file); }} /></label></div>
              {importedAvatarPreviewUrl ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("creators.importAvatarPreviewOnly")}</p> : null}
            </section>
            <LinkEditor links={links} onChange={setLinks} />
        </div>
        <section className="mt-6"><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-black">{t("creators.introduction")} ({selectedLocale})</h2><span className="text-xs text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded documentId={`creator:${detail?.creator.publicId || `new:${initialKind}`}:${selectedLocale}:content`} editorTitle={`${t("creators.introduction")} (${selectedLocale})`} value={localized.contentMarkdown} onChange={(contentMarkdown) => setLocalizations((current) => updateCreatorLocalization(current, selectedLocale, { contentMarkdown }))} /></section>
      </form>
      <SquareImageCropDialog file={avatarCropFile} minimumSize={1} outputSizes={[256]} onCancel={() => setAvatarCropFile(undefined)} onConfirm={(output) => { const file = output.files.get(256); setAvatarCropFile(undefined); if (file) void uploadAvatar(file); }} />
    </main>
  );
}

function LinkEditor({ links, onChange }: { links: CreatorLink[]; onChange: (links: CreatorLink[]) => void }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-black">{t("creators.relatedLinks")}</h2><button className="button-secondary focus-ring px-3 py-1.5 text-sm" type="button" onClick={() => onChange([...links, { type: "website", url: "", label: "" }])}>+ {t("common.add")}</button></div><div className="mt-3 grid gap-3">{links.map((link, index) => <div className="grid gap-2 rounded-md bg-[var(--panel-subtle)] p-3" key={index}><div className="grid gap-2 sm:grid-cols-2"><input className="field" placeholder={t("creators.linkType")} value={link.type} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} /><input className="field" placeholder={t("creators.linkLabel")} value={link.label} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></div><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className="field" placeholder="https://" type="url" value={link.url} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /><button className="button-secondary focus-ring" type="button" onClick={() => onChange(links.filter((_, itemIndex) => itemIndex !== index))}>{t("common.delete")}</button></div></div>)}{!links.length ? <p className="text-sm text-[var(--muted)]">{t("creators.noLinks")}</p> : null}</div></section>;
}

function CreatorAvatar({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  return <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] text-3xl font-black text-[var(--accent)]">{avatarUrl ? <img alt="" className="h-full w-full object-cover" src={avatarUrl} /> : name.trim().slice(0, 1).toUpperCase()}</span>;
}

function creatorBaseHref(kind: CreatorKind) {
  return kind === "team" ? "/teams" : "/authors";
}

function creatorEditorLocalizations(detail: CreatorDetail | null, defaultLocale: Locale): CreatorLocalization[] {
  if (detail?.localizations?.length) return detail.localizations.map((item) => ({ ...item }));
  return [{
    locale: defaultLocale,
    contentMarkdown: detail?.descriptionMarkdown ?? "",
  }];
}

function creatorLocalization(localizations: CreatorLocalization[], locale: Locale): CreatorLocalization {
  return localizations.find((item) => item.locale === locale) ?? { locale, contentMarkdown: "" };
}

function ensureCreatorLocalization(localizations: CreatorLocalization[], locale: Locale) {
  return localizations.some((item) => item.locale === locale)
    ? localizations
    : [...localizations, { locale, contentMarkdown: "" }];
}

function updateCreatorLocalization(localizations: CreatorLocalization[], locale: Locale, patch: Partial<Pick<CreatorLocalization, "contentMarkdown">>) {
  const current = creatorLocalization(localizations, locale);
  const next = { ...current, ...patch };
  return localizations.some((item) => item.locale === locale)
    ? localizations.map((item) => item.locale === locale ? next : item)
    : [...localizations, next];
}

function mergeImportedCreatorLinks(current: CreatorLink[], imported: CreatorLink[]) {
  const importedTypes = new Set(imported.map((link) => link.type.toLowerCase()));
  return [...current.filter((link) => !importedTypes.has(link.type.toLowerCase())), ...imported];
}
