"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { licenseOptions, maintenanceOptions, sourceOptions } from "../_lib/mod-catalog-data";
import type { BackendModAuthor, BackendModCompatibility, BackendModGalleryImage, MinecraftVersionConfig } from "../_lib/mod-api";
import { modpackCategoryOptions, modpackPackagingMethodOptions, modpackTypeOptions, type BackendModpackImportJob, type BackendModpackMod, type BackendModpackRecord, type CreateModpackPayload } from "../_lib/modpack-api";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { CreatorPicker } from "./creator-picker";
import { FileDropZone } from "./file-drop-zone";
import { ReviewLockGate } from "./review-edit-lock";
import { CompatibilityEditor, fallbackMinecraftConfig, ModLinkEditor } from "./mod-editor";
import { ModResourcePickerDialog } from "./editor/mod-resource-picker";
import { SquareImageCropDialog, type SquareCropOutput } from "./square-image-crop-dialog";
import { ToolsPlayground } from "./tools-playground";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { DraftAutosaveStatus } from "./draft-autosave-status";

type ModpackDraft = Omit<CreateModpackPayload, "searchKeywords"> & { searchKeywords: string };

const environmentOptions = ["clientOnly", "serverOnly", "bothRequired"] as const;
const emptyDraft = (): ModpackDraft => ({
  siteId: "", primaryName: "", secondaryName: "", abbreviation: "", summary: "", defaultLocale: "zh-CN",
  environment: "bothRequired", primaryCategory: "adventure", packType: "native", packagingMethod: "other", compatibilities: [], tags: [], searchKeywords: "",
  authors: [], officialStatus: "development", sourceStatus: "unknown", license: "Custom", curseforgeProjectId: "",
  modrinthProjectId: "", iconUrl: "", bodyMarkdown: "", submissionMethod: "manual", links: [], galleryImages: [], mods: [],
});

export function ModpackEditor({ siteId, importMethod = "manual", importURL = "" }: { siteId?: string; importMethod?: string; importURL?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [draft, setDraft] = useState<ModpackDraft>(emptyDraft);
  const [publicId, setPublicId] = useState("");
  const [baseRevisionId, setBaseRevisionId] = useState<string>();
  const [minecraftConfig, setMinecraftConfig] = useState<MinecraftVersionConfig>(fallbackMinecraftConfig);
  const [loading, setLoading] = useState(Boolean(siteId));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [importProvider, setImportProvider] = useState<"modrinth" | "curseforge">(importMethod === "curseforge" ? "curseforge" : "modrinth");
  const [providerURL, setProviderURL] = useState(importURL);
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconCropFile, setIconCropFile] = useState<File>();
  const [iconUploading, setIconUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const automaticImportRef = useRef(false);
  const autoDraft = useAutoDraft({
    draftKey: `modpack:${siteId || "new"}`,
    editUrl: siteId ? `/modpacks/${encodeURIComponent(siteId)}/edit` : "/modpacks/new",
    enabled: ready && Boolean(token) && !loading,
    kind: "modpack",
    title: draft.primaryName.trim() || t(siteId ? "modpacks.editor.editTitle" : "modpacks.editor.createTitle"),
    token,
    value: { changeReason, draft },
    onRestore: (payload) => {
      setChangeReason(payload.changeReason);
      setDraft(payload.draft);
    },
  });

  useEffect(() => {
    apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions").then(setMinecraftConfig).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready || !siteId) return;
    let cancelled = false;
    apiRequest<BackendModpackRecord>(`/api/v1/modpacks/${encodeURIComponent(siteId)}/editor`, {}, token)
      .then((record) => {
        if (cancelled) return;
        setDraft(draftFromRecord(record));
        setPublicId(record.id);
        setBaseRevisionId(record.publishedRevisionId);
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("modpacks.editor.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, siteId, t, token]);

  useEffect(() => {
    if (!ready || !token || siteId || !importURL || automaticImportRef.current || (importMethod !== "modrinth" && importMethod !== "curseforge")) return;
    automaticImportRef.current = true;
    void importFromProvider(importMethod, importURL);
  });

  async function importFromProvider(provider = importProvider, url = providerURL) {
    if (!token || !url.trim()) return;
    setImporting(true);
    setLoading(true);
    setImportProgress(0);
    setMessage("");
    try {
      let job = await apiRequest<BackendModpackImportJob>("/api/v1/modpack-imports", { method: "POST", body: JSON.stringify({ provider, url }) }, token);
      while (job.status === "queued" || job.status === "running") {
        setImportProgress(job.progress);
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        job = await apiRequest<BackendModpackImportJob>(`/api/v1/modpack-imports/${encodeURIComponent(job.id)}`, {}, token);
      }
      if (job.status !== "completed" || !job.result) throw new Error(job.error || t("modpacks.editor.importFailed"));
      setDraft(draftFromRecord(job.result));
      setImportProgress(100);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("modpacks.editor.importFailed"));
    } finally {
      setImporting(false);
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage("");
    try {
      const snapshot = payloadFromDraft(draft);
      if (siteId) {
        const result = await apiRequest<{ status: string; siteId: string }>(`/api/v1/modpacks/${encodeURIComponent(siteId)}`, { method: "PUT", body: JSON.stringify({ snapshot, baseRevisionId, changeReason }) }, token);
        await autoDraft.clearDraft().catch(() => undefined);
        router.push(`/modpacks/${result.siteId || siteId}`);
      } else {
        const result = await apiRequest<BackendModpackRecord>("/api/v1/modpacks", { method: "POST", body: JSON.stringify(snapshot) }, token);
        await autoDraft.clearDraft().catch(() => undefined);
        router.push(`/modpacks/${result.siteId}`);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t("modpacks.editor.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadIcon(output: SquareCropOutput) {
    const file = output.files.get(128);
    if (!file || !token) return;
    setIconUploading(true);
    try {
      const stored = await uploadUserFileToOSS(file, token, `modpack_icon:${siteId || "draft"}`);
      setDraft((current) => ({ ...current, iconUrl: stored.accessUrl || stored.url || "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.iconUploadFailed"));
    } finally {
      URL.revokeObjectURL(output.previewUrl);
      setIconUploading(false);
    }
  }

  async function uploadGallery(files: File[]) {
    if (!token) return;
    setGalleryUploading(true);
    try {
      const uploaded: BackendModGalleryImage[] = [];
      for (const file of files.filter((item) => item.type.startsWith("image/")).slice(0, 32 - draft.galleryImages.length)) {
        const stored = await uploadUserFileToOSS(file, token, `modpack_gallery:${siteId || "draft"}`);
        uploaded.push({ fileId: stored.id, name: stored.originalName, contentType: stored.contentType, sizeBytes: stored.sizeBytes, url: stored.accessUrl });
      }
      setDraft((current) => ({ ...current, galleryImages: [...current.galleryImages, ...uploaded] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.galleryUploadFailed"));
    } finally {
      setGalleryUploading(false);
    }
  }

  function addSelectedMods(resources: CatalogResourceRef[]) {
    const selected = resources.map(resourceToModpackMod);
    const imported = draft.mods.filter((item) => item.provider !== "manual" || item.providerProjectId);
    setDraft((current) => ({ ...current, mods: deduplicateMods([...imported, ...selected]) }));
  }

  if (!ready || loading) return <main className="grid min-h-[60vh] place-items-center"><div className="text-center"><p className="font-black">{importing ? t("modpacks.editor.importProgress", { progress: importProgress }) : t("common.loading")}</p>{importing ? <progress className="mt-4 w-64" max={100} value={importProgress} /> : null}</div></main>;
  if (!token) return <main className="grid min-h-[60vh] place-items-center"><Link className="button-primary" href={`/login?next=${encodeURIComponent(siteId ? `/modpacks/${siteId}/edit` : "/modpacks/new")}`}>{t("common.login")}</Link></main>;

  const editor = <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><form className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6" onSubmit={submit}>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={siteId ? `/modpacks/${siteId}` : "/modpacks"}>{t("modpacks.detail.back")}</Link><h1 className="mt-2 text-3xl font-black">{t(siteId ? "modpacks.editor.editTitle" : "modpacks.editor.createTitle")}</h1></div><div className="grid justify-items-end gap-2"><DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} /><button className="button-primary focus-ring" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t("common.save")}</button></div></header>

    {!siteId ? <Section title={t("modpacks.editor.automaticImport")} description={t("modpacks.editor.automaticImportHint")}><div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"><select className="field" value={importProvider} onChange={(event) => setImportProvider(event.target.value as typeof importProvider)}><option value="modrinth">Modrinth</option><option value="curseforge">CurseForge</option></select><input className="field" type="url" placeholder={importProvider === "modrinth" ? "https://modrinth.com/modpack/..." : "https://www.curseforge.com/minecraft/modpacks/..."} value={providerURL} onChange={(event) => setProviderURL(event.target.value)} /><button className="button-secondary focus-ring" disabled={importing || !providerURL.trim()} type="button" onClick={() => void importFromProvider()}>{t("modpacks.editor.import")}</button></div></Section> : null}

    <Section title={t("mods.submission.sections.identity")}><div className="grid gap-4 md:grid-cols-2"><Field label={t("mods.submission.fields.siteId")}><input className="field font-mono" required value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: normalizeSiteId(event.target.value) })} /></Field>{publicId ? <Field label={t("mods.submission.fields.uniqueId")}><input className="field font-mono" readOnly value={publicId} /></Field> : null}<Field label={t("mods.submission.fields.primaryName")}><input className="field" required maxLength={160} value={draft.primaryName} onChange={(event) => setDraft({ ...draft, primaryName: event.target.value })} /></Field><Field label={t("mods.submission.fields.secondaryName")}><input className="field" maxLength={160} value={draft.secondaryName} onChange={(event) => setDraft({ ...draft, secondaryName: event.target.value })} /></Field><Field label={t("mods.submission.fields.abbreviation")}><input className="field" maxLength={32} value={draft.abbreviation} onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value })} /></Field></div><Field label={t("mods.submission.fields.summary")}><textarea className="field min-h-24" maxLength={500} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></Field><div className="mt-4 flex items-center gap-4"><div className="grid h-28 w-28 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]">{draft.iconUrl ? <Image unoptimized alt="" className="h-full w-full object-contain" height={128} src={draft.iconUrl} width={128} /> : "?"}</div><label className="button-secondary focus-ring cursor-pointer">{iconUploading ? t("mods.submission.actions.uploadingIcon") : t("mods.submission.actions.uploadIcon")}<input accept="image/*" className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setIconCropFile(file); }} /></label></div></Section>

    <Section title={t("mods.submission.sections.classification")}><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Select label={t("mods.submission.fields.environment")} value={draft.environment} options={environmentOptions} labelFor={(value) => t(`mods.environments.${value}`)} onChange={(environment) => setDraft({ ...draft, environment })} /><Select label={t("modpacks.editor.packType")} value={draft.packType} options={modpackTypeOptions} labelFor={(value) => t(`modpacks.packTypes.${value}`)} onChange={(packType) => setDraft({ ...draft, packType })} /><Select label={t("modpacks.editor.packagingMethod")} value={draft.packagingMethod} options={modpackPackagingMethodOptions} labelFor={(value) => t(`modpacks.packagingMethods.${value}`)} onChange={(packagingMethod) => setDraft({ ...draft, packagingMethod })} /><Select label={t("mods.submission.fields.officialStatus")} value={draft.officialStatus} options={maintenanceOptions} labelFor={(value) => t(`mods.statuses.${value}`)} onChange={(officialStatus) => setDraft({ ...draft, officialStatus })} /><Select label={t("mods.submission.fields.sourceStatus")} value={draft.sourceStatus} options={sourceOptions} labelFor={(value) => t(`mods.sources.${value}`)} onChange={(sourceStatus) => setDraft({ ...draft, sourceStatus })} /><Select label={t("mods.submission.fields.license")} value={draft.license} options={licenseOptions} labelFor={(value) => value} onChange={(license) => setDraft({ ...draft, license })} /></div><div className="mt-5"><CompatibilityEditor config={minecraftConfig} value={draft.compatibilities} onChange={(compatibilities: BackendModCompatibility[]) => setDraft({ ...draft, compatibilities })} /></div><div className="mt-4"><h3 className="mb-2 font-black">{t("modpacks.editor.categories")}</h3><div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-4">{modpackCategoryOptions.map((category) => <label className="flex items-center gap-2 text-sm" key={category}><input type="checkbox" checked={draft.tags.includes(category)} onChange={() => setDraft({ ...draft, tags: draft.tags.includes(category) ? draft.tags.filter((item) => item !== category) : [...draft.tags, category] })} />{t(`modpacks.categories.${category}`)}</label>)}</div></div><Field label={t("mods.submission.fields.searchKeywords")}><input className="field" value={draft.searchKeywords} onChange={(event) => setDraft({ ...draft, searchKeywords: event.target.value })} /></Field></Section>

    <Section title={t("mods.submission.sections.authors")}><CreatorPicker value={draft.authors} onChange={(authors: BackendModAuthor[]) => setDraft({ ...draft, authors })} /></Section>
    <Section title={t("mods.submission.sections.links")} description={t("mods.submission.sections.linksHint")}><ModLinkEditor links={draft.links} onChange={(links) => setDraft({ ...draft, links })} /></Section>
    <Section title={t("modpacks.editor.modList")} description={t("modpacks.editor.modListHint")}><ModRows mods={draft.mods} onRemove={(index) => setDraft((current) => ({ ...current, mods: current.mods.filter((_, itemIndex) => itemIndex !== index) }))} /><button className="button-secondary focus-ring mt-4" type="button" onClick={() => setPickerOpen(true)}>+ {t("modpacks.editor.selectMods")}</button></Section>
    <section className="mb-6 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><ToolsPlayground embedded editorTitle={t("mods.submission.sections.body")} value={draft.bodyMarkdown} onChange={(bodyMarkdown) => setDraft({ ...draft, bodyMarkdown })} /></section>
    <Section title={t("mods.submission.sections.gallery")}><FileDropZone accept="image/*" disabled={galleryUploading} hint={t("mods.submission.hints.galleryDrop")} multiple title={t("mods.submission.actions.uploadGallery")} onFiles={(files) => void uploadGallery(files)} /><div className="mt-4 grid gap-3 sm:grid-cols-3">{draft.galleryImages.map((image, index) => <div className="rounded-lg border border-[var(--line)] p-2" key={`${image.fileId}-${index}`}><span className="block truncate text-sm">{image.name}</span><button className="mt-2 text-sm font-bold text-[var(--red)]" type="button" onClick={() => setDraft((current) => ({ ...current, galleryImages: current.galleryImages.filter((_, itemIndex) => itemIndex !== index) }))}>{t("common.delete")}</button></div>)}</div></Section>
    {siteId ? <Section title={t("mods.submission.changeReason")}><textarea className="field min-h-24" value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></Section> : null}
    {message ? <p className="mb-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{message}</p> : null}<div className="flex justify-end"><button className="button-primary focus-ring" disabled={submitting} type="submit">{t("common.save")}</button></div>
    <SquareImageCropDialog file={iconCropFile} minimumSize={128} outputSizes={[128]} onCancel={() => setIconCropFile(undefined)} onConfirm={(output) => { setIconCropFile(undefined); void uploadIcon(output); }} />
    <ModResourcePickerDialog open={pickerOpen} token={token} value={draft.mods.filter((item) => item.provider === "manual").map(modpackModToResource)} onClose={() => setPickerOpen(false)} onConfirm={(resources) => { addSelectedMods(resources); setPickerOpen(false); }} />
  </form></main>;
  return siteId && publicId
    ? <ReviewLockGate entityType="modpack" publicId={publicId} returnHref={`/modpacks/${siteId}`}>{editor}</ReviewLockGate>
    : editor;
}

function ModRows({ mods, onRemove }: { mods: BackendModpackMod[]; onRemove: (index: number) => void }) {
  const { t } = useI18n();
  if (!mods.length) return <p className="rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm text-[var(--muted)]">{t("modpacks.detail.noMods")}</p>;
  return <div className="grid gap-2 sm:grid-cols-2">{mods.map((mod, index) => <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3" key={`${mod.provider}-${mod.providerProjectId}-${mod.identifier}-${index}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--panel)] font-black">{mod.iconUrl ? <Image alt="" className="h-10 w-10 object-contain" height={40} src={mod.iconUrl} width={40} /> : mod.modPublicId ? [...(mod.modName || mod.identifier || "M")].slice(0, 2).join("") : "?"}</span><span className="min-w-0 flex-1"><strong className="block truncate">{mod.modName || mod.identifier || mod.providerProjectId || mod.fileName}</strong><span className="block truncate text-xs text-[var(--muted)]">{mod.provider}{mod.providerProjectId ? ` · ${mod.providerProjectId}` : ""}</span></span><button className="font-bold text-[var(--red)]" type="button" onClick={() => onRemove(index)}>×</button></div>)}</div>;
}

function resourceToModpackMod(resource: CatalogResourceRef): BackendModpackMod { return { modPublicId: resource.unresolved ? undefined : resource.publicId, modSiteId: resource.source?.siteId, modName: resource.resolvedName || resource.id, iconUrl: resource.iconUrl, provider: "manual", identifier: resource.unresolved ? resource.rawIdentifier || resource.id : "", clientRequired: true, serverRequired: true, resolved: !resource.unresolved }; }
function modpackModToResource(mod: BackendModpackMod): CatalogResourceRef { return { publicId: mod.modPublicId || `unresolved:mod:${mod.identifier}`, id: mod.identifier || mod.modSiteId || mod.modName, registry: "mods", kind: "mod", names: {}, resolvedName: mod.modName, iconUrl: mod.iconUrl, unresolved: !mod.modPublicId, rawIdentifier: mod.identifier, source: mod.modSiteId ? { publicId: mod.modPublicId || "", siteId: mod.modSiteId, name: mod.modName } : undefined }; }
function deduplicateMods(mods: BackendModpackMod[]) { const seen = new Set<string>(); return mods.filter((mod) => { const key = mod.modPublicId || `${mod.provider}:${mod.providerProjectId}:${mod.identifier}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function draftFromRecord(record: CreateModpackPayload | BackendModpackRecord): ModpackDraft { return { ...record, packType: record.packType || "native", packagingMethod: record.packagingMethod || "other", searchKeywords: Array.isArray(record.searchKeywords) ? record.searchKeywords.join(", ") : record.searchKeywords, galleryImages: record.galleryImages || [], mods: record.mods || [], authors: record.authors || [], links: record.links || [], tags: record.tags || [], compatibilities: record.compatibilities || [] }; }
function payloadFromDraft(draft: ModpackDraft): CreateModpackPayload { return { ...draft, searchKeywords: draft.searchKeywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) }; }
function normalizeSiteId(value: string) { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 100); }
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}<div className="mt-5">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-4 block text-sm font-black">{label}<div className="mt-2">{children}</div></label>; }
function Select<T extends string>({ label, value, options, labelFor, onChange }: { label: string; value: string; options: readonly T[]; labelFor: (value: T) => string; onChange: (value: T) => void }) { return <label className="text-sm font-black">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}</select></label>; }
