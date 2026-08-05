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
  CreatorRole,
  CreatorSnapshot,
  creatorHref,
} from "../_lib/community-api";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import type { BackendModAuthor } from "../_lib/mod-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { CreatorPicker } from "./creator-picker";
import { DraftAutosaveStatus } from "./draft-autosave-status";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { ToolsPlayground } from "./tools-playground";
import { SquareImageCropDialog } from "./square-image-crop-dialog";
import { ReviewLockGate } from "./review-edit-lock";

const authorCreatorKinds: CreatorKind[] = ["author"];

export function CreatorEditorPage({ initialKind, publicId = "" }: { initialKind: CreatorKind; publicId?: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [roles, setRoles] = useState<CreatorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [roleResult, creatorDetail] = await Promise.all([
        apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles", {}, token),
        publicId ? apiRequest<CreatorDetail>(`/api/v1/creators/${encodeURIComponent(publicId)}`, {}, token) : Promise.resolve(null),
      ]);
      if (creatorDetail && creatorDetail.creator.kind !== initialKind) throw new Error(t("creators.kindMismatch"));
      if (creatorDetail && !creatorDetail.canEdit) throw new Error(t("creators.editDenied"));
      setRoles(roleResult.items);
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

  if (!ready || (token && loading)) return <EditorState text={t("common.loading")} />;
  if (!token) return <EditorState text={t("creators.editLoginRequired")} action={<Link className="button-primary focus-ring mt-4 inline-flex" href={`/login?next=${encodeURIComponent(publicId ? `${creatorBaseHref(initialKind)}/${publicId}/edit` : "/authors/new")}`}>{t("common.login")}</Link>} />;
  if (error || (publicId && !detail)) return <EditorState text={error || t("creators.notFound")} />;

  const editor = <CreatorEditorForm detail={detail} initialKind={initialKind} roles={roles} token={token} />;
  return publicId
    ? <ReviewLockGate entityType="creator" publicId={publicId} returnHref={`${creatorBaseHref(initialKind)}/${publicId}`}>{editor}</ReviewLockGate>
    : editor;
}

function CreatorEditorForm({ detail, initialKind, roles: initialRoles, token }: { detail: CreatorDetail | null; initialKind: CreatorKind; roles: CreatorRole[]; token: string }) {
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
  const [avatarFileId, setAvatarFileId] = useState<string>();
  const [links, setLinks] = useState<CreatorLink[]>(detail?.links ?? []);
  const [members, setMembers] = useState<BackendModAuthor[]>(() => detail?.members.map((member) => ({
    creatorId: member.creatorId,
    kind: "author",
    name: member.name,
    avatarUrl: member.avatarUrl,
    roleId: member.role.id,
    role: member.role.name,
    title: member.title,
  })) ?? []);
  const [roles, setRoles] = useState(initialRoles);
  const [customRole, setCustomRole] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File>();
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const autoDraft = useAutoDraft({
    token,
    draftKey: `creator:${detail?.creator.publicId || `new:${initialKind}`}`,
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
      members,
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
      setMembers(restored.members);
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
    members: kind === "team"
      ? members.flatMap((member) => member.creatorId && member.roleId ? [{ creatorId: member.creatorId, roleId: member.roleId, title: member.title?.trim() ?? "" }] : [])
      : [],
  }), [avatarFileId, avatarUrl, defaultLocale, kind, links, localizations, members, name]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, `creator_avatar:${kind}:${detail?.creator.publicId || "new"}`);
      setAvatarFileId(uploaded.id);
      setAvatarUrl(uploaded.accessUrl || uploaded.url || "");
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
      if (imported.avatarUrl) {
        setAvatarUrl(imported.avatarUrl);
        setAvatarFileId(imported.avatarFileId);
      }
      setLinks((current) => mergeImportedCreatorLinks(current, imported.links));
      if (imported.kind === "team") setMembers((current) => mergeImportedCreatorMembers(current, imported.members));
      notifySite(
        imported.createdMembers > 0
          ? t("creators.importSucceededWithMembers", { count: imported.createdMembers })
          : t("creators.importSucceeded"),
        t("creators.importProfile"),
        "success",
      );
    } catch (importError) {
      notifySite(importError instanceof Error ? importError.message : t("creators.importFailed"), t("creators.importProfile"), "danger");
    } finally {
      setImporting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snapshot.name || (kind === "team" && members.some((member) => !member.creatorId || !member.roleId))) return;
    setSaving(true);
    try {
      const result = editing
        ? await apiRequest<{ reviewStatus: "pending" | "approved" }>(`/api/v1/creators/${encodeURIComponent(detail!.creator.publicId)}`, { method: "PUT", body: JSON.stringify(snapshot) }, token)
        : await apiRequest<{ publicId: string; reviewStatus: "pending" | "approved" }>("/api/v1/creators", { method: "POST", body: JSON.stringify(snapshot) }, token);
      const publicId = editing ? detail!.creator.publicId : "publicId" in result ? result.publicId : "";
      await autoDraft.clearDraft();
      notifySite(result.reviewStatus === "pending" ? t(editing ? "creators.editSubmitted" : "creators.createSubmitted") : t(editing ? "creators.editSaved" : "creators.createSaved"), t("creators.title"), "success");
      router.push(`${creatorBaseHref(kind)}/${publicId}`);
    } catch (saveError) {
      notifySite(saveError instanceof Error ? saveError.message : t(editing ? "creators.editFailed" : "creators.createFailed"), t("creators.title"), "danger");
    } finally {
      setSaving(false);
    }
  }

  function updateMembers(next: BackendModAuthor[]) {
    const defaultRole = roles[0];
    const previous = new Map(members.map((member) => [member.creatorId, member]));
    setMembers(next.map((member) => {
      const existing = previous.get(member.creatorId);
      if (member.roleId || !defaultRole) return { ...member, title: member.title ?? existing?.title ?? "" };
      return { ...member, roleId: defaultRole.id, role: defaultRole.name, title: member.title ?? existing?.title ?? "" };
    }));
  }

  async function createRole() {
    if (!customRole.trim()) return;
    setCreatingRole(true);
    try {
      const result = await apiRequest<{ id: string; code: string; name: string }>("/api/v1/creator-roles", { method: "POST", body: JSON.stringify({ name: customRole.trim(), description: "", translations: {} }) }, token);
      setRoles((current) => [...current, { ...result, description: "", translations: {}, custom: true }]);
      setCustomRole("");
    } catch (roleError) {
      notifySite(roleError instanceof Error ? roleError.message : t("creators.roleCreateFailed"), t("creators.members"), "danger");
    } finally {
      setCreatingRole(false);
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
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {!editing ? <label className="block"><span className="mb-1 block text-sm font-black">{t("creators.kind")}</span><select className="field" value={kind} onChange={(event) => setKind(event.target.value as CreatorKind)}><option value="author">{t("creators.kinds.author")}</option><option value="team">{t("creators.kinds.team")}</option></select></label> : null}
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <section><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-black">{t("creators.introduction")} ({selectedLocale})</h2><span className="text-xs text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded editorTitle={`${t("creators.introduction")} (${selectedLocale})`} value={localized.contentMarkdown} onChange={(contentMarkdown) => setLocalizations((current) => updateCreatorLocalization(current, selectedLocale, { contentMarkdown }))} /></section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-lg border border-[var(--line)] p-4">
              <h2 className="font-black">{t("creators.avatar")}</h2>
              <div className="mt-3 flex items-center gap-3"><CreatorAvatar avatarUrl={avatarUrl} name={name} /><label className="button-secondary focus-ring cursor-pointer">{uploadingAvatar ? t("common.loading") : t("creators.chooseAvatar")}<input className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/apng,.apng" disabled={uploadingAvatar} type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setAvatarCropFile(file); }} /></label></div>
            </section>
            <LinkEditor links={links} onChange={setLinks} />
            {kind === "team" ? <section className="rounded-lg border border-[var(--line)] p-4"><h2 className="font-black">{t("creators.members")}</h2><div className="mt-3"><CreatorPicker allowTitle allowedKinds={authorCreatorKinds} initialRoles={roles} value={members} onChange={updateMembers} /></div><div className="mt-4 border-t border-[var(--line)] pt-4"><p className="text-sm font-black">{t("creators.customRole")}</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input className="field" value={customRole} onChange={(event) => setCustomRole(event.target.value)} /><button className="button-secondary focus-ring" disabled={creatingRole || !customRole.trim()} type="button" onClick={() => void createRole()}>{creatingRole ? t("common.loading") : t("common.create")}</button></div></div></section> : null}
          </aside>
        </div>
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

function EditorState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <main className="grid min-h-[65vh] place-items-center bg-[var(--background)] px-4"><div className="surface w-full max-w-lg rounded-lg p-6 text-center text-sm text-[var(--muted)]"><p>{text}</p>{action}</div></main>;
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

function mergeImportedCreatorMembers(current: BackendModAuthor[], imported: BackendModAuthor[]) {
  const members = new Map(current.flatMap((member) => member.creatorId ? [[member.creatorId, member] as const] : []));
  for (const member of imported) {
    if (member.creatorId) members.set(member.creatorId, member);
  }
  return [...members.values()];
}
