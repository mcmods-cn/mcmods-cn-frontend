"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { supportedLocales, useI18n, type Locale } from "../_lib/i18n-provider";
import type { BackendModAuthor, BackendModGalleryImage } from "../_lib/mod-api";
import { licenseOptions, maintenanceOptions, sourceOptions } from "../_lib/mod-catalog-data";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { emptySimpleProject, simpleProjectConfig, simpleProjectImportProviders, type SimpleProjectImportJob, type SimpleProjectImportProvider, type SimpleProjectLocalization, type SimpleProjectParent, type SimpleProjectPayload, type SimpleProjectRecord, type SimpleProjectType } from "../_lib/simple-project-api";
import { CreatorPicker } from "./creator-picker";
import { ModResourceSelectionField, type ProjectResourceType } from "./editor/mod-resource-picker";
import { FileDropZone } from "./file-drop-zone";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { ModLinkEditor } from "./mod-editor";
import { ReviewLockGate } from "./review-edit-lock";
import { SquareImageCropDialog, type SquareCropOutput } from "./square-image-crop-dialog";
import { ToolsPlayground } from "./tools-playground";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { DraftAutosaveStatus } from "./draft-autosave-status";

export function SimpleProjectEditor({ projectType, siteId }: { projectType: SimpleProjectType; siteId?: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const router = useRouter();
  const config = simpleProjectConfig(projectType);
  const importProviders = simpleProjectImportProviders(projectType);
  const [draft, setDraft] = useState<SimpleProjectPayload>(() => emptySimpleProject(projectType));
  const [publicId, setPublicId] = useState("");
  const [baseRevisionId, setBaseRevisionId] = useState("");
  const [selectedLocale, setSelectedLocale] = useState<Locale>("zh-CN");
  const [parentType, setParentType] = useState<ProjectResourceType>("mod");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [iconCropFile, setIconCropFile] = useState<File>();
  const [loading, setLoading] = useState(Boolean(siteId));
  const [submitting, setSubmitting] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [importProvider, setImportProvider] = useState<SimpleProjectImportProvider>(importProviders[0]);
  const [providerURL, setProviderURL] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  useEffect(() => {
    if (!ready || !token || !siteId) return;
    const controller = new AbortController();
    apiRequest<SimpleProjectRecord>(`/api/v1/content-projects/${projectType}/${encodeURIComponent(siteId)}/editor`, { signal: controller.signal }, token)
      .then((record) => {
        setDraft(recordToPayload(record));
        setPublicId(record.id);
        setBaseRevisionId(record.publishedRevisionId || "");
        setSelectedLocale((record.defaultLocale || "zh-CN") as Locale);
        setKeywordsInput(record.searchKeywords.join(", "));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : t("largeProjects.editor.loadFailed")))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectType, ready, siteId, t, token]);

  const localization = useMemo(() => localizationFor(draft, selectedLocale), [draft, selectedLocale]);
  const parentPickerValues = useMemo(() => draft.parentProjects.filter((item) => item.type === parentType).map(parentToPickerResource), [draft.parentProjects, parentType]);
  const autoDraft = useAutoDraft({
    draftKey: `simple-project:${projectType}:${siteId || "new"}`,
    editUrl: siteId ? `${config.path}/${encodeURIComponent(siteId)}/edit` : `${config.path}/new`,
    enabled: ready && Boolean(token) && !loading,
    kind: "simple_project",
    title: localizationFor(draft, draft.defaultLocale).name.trim() || t(siteId ? "largeProjects.editor.editTitle" : "largeProjects.editor.createTitle", { type: t(`largeProjects.types.${projectType}`) }),
    token,
    value: { changeReason, draft, keywordsInput },
    onRestore: (payload) => {
      setChangeReason(payload.changeReason);
      setDraft(payload.draft);
      setKeywordsInput(payload.keywordsInput);
      setSelectedLocale((payload.draft.defaultLocale || "zh-CN") as Locale);
    },
  });

  function selectLocale(locale: Locale) {
    setSelectedLocale(locale);
    setDraft((current) => current.localizations.some((item) => item.locale === locale) ? current : { ...current, localizations: [...current.localizations, { locale, name: "", summary: "", bodyMarkdown: "" }] });
  }

  async function uploadIcon(output: SquareCropOutput) {
    const file = output.files.get(128);
    if (!file || !token) return;
    setIconUploading(true);
    try {
      const stored = await uploadUserFileToOSS(file, token, `simple_project_icon:${projectType}:${siteId || "draft"}`);
      setDraft((current) => ({ ...current, iconUrl: stored.accessUrl || stored.url || "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.iconUploadFailed"));
    } finally { setIconUploading(false); }
  }

  async function uploadGallery(files: File[]) {
    if (!token) return;
    setGalleryUploading(true);
    try {
      const uploaded = await Promise.all(files.filter((file) => file.type.startsWith("image/")).slice(0, 32 - draft.galleryImages.length).map(async (file) => {
        const stored = await uploadUserFileToOSS(file, token, `simple_project_gallery:${projectType}:${siteId || "draft"}`);
        return { fileId: stored.id, name: stored.originalName, contentType: stored.contentType, sizeBytes: stored.sizeBytes, url: stored.accessUrl || stored.url } satisfies BackendModGalleryImage;
      }));
      setDraft((current) => ({ ...current, galleryImages: [...current.galleryImages, ...uploaded] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.galleryUploadFailed"));
    } finally { setGalleryUploading(false); }
  }

  async function importFromProvider() {
    if (!token || !providerURL.trim()) return;
    setImporting(true);
    setImportProgress(0);
    setMessage("");
    try {
      const root = `/api/v1/content-project-imports/${projectType}`;
      let job = await apiRequest<SimpleProjectImportJob>(root, {
        method: "POST",
        body: JSON.stringify({ provider: importProvider, url: providerURL.trim() }),
      }, token);
      while (job.status === "queued" || job.status === "running") {
        setImportProgress(job.progress);
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        job = await apiRequest<SimpleProjectImportJob>(`${root}/${encodeURIComponent(job.id)}`, {}, token);
      }
      const imported = job.result;
      if (job.status !== "completed" || !imported) throw new Error(job.error || t("mods.submission.importFailed"));
      setDraft((current) => ({
        ...imported,
        projectType,
        parentProjects: projectType === "addon" ? current.parentProjects : imported.parentProjects,
      }));
      setSelectedLocale((imported.defaultLocale || "en-US") as Locale);
      setKeywordsInput(imported.searchKeywords.join(", "));
      setImportProgress(100);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.importFailed"));
    } finally {
      setImporting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage("");
    const snapshot = { ...draft, searchKeywords: splitValues(keywordsInput), projectType };
    try {
      if (siteId) {
        const result = await apiRequest<{ siteId: string }>(`/api/v1/content-projects/${projectType}/${encodeURIComponent(siteId)}`, { method: "PUT", body: JSON.stringify({ snapshot, baseRevisionId, changeReason }) }, token);
        await autoDraft.clearDraft().catch(() => undefined);
        router.push(`${config.path}/${result.siteId || snapshot.siteId}`);
      } else {
        const result = await apiRequest<SimpleProjectRecord>(`/api/v1/content-projects/${projectType}`, { method: "POST", body: JSON.stringify(snapshot) }, token);
        await autoDraft.clearDraft().catch(() => undefined);
        router.push(`${config.path}/${result.siteId}`);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t("largeProjects.editor.saveFailed"));
    } finally { setSubmitting(false); }
  }

  if (!ready || loading) return <main className="grid min-h-[60vh] place-items-center font-black">{t("common.loading")}</main>;
  if (!token) return <main className="grid min-h-[60vh] place-items-center"><Link className="button-primary" href={`/login?next=${encodeURIComponent(siteId ? `${config.path}/${siteId}/edit` : `${config.path}/new`)}`}>{t("common.login")}</Link></main>;

  const editor = <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><form className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6" onSubmit={submit}>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={siteId ? `${config.path}/${siteId}` : config.path}>← {t("largeProjects.detail.back")}</Link><h1 className="mt-2 text-3xl font-black">{t(siteId ? "largeProjects.editor.editTitle" : "largeProjects.editor.createTitle", { type: t(`largeProjects.types.${projectType}`) })}</h1></div><div className="grid justify-items-end gap-2"><DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} /><button className="button-primary focus-ring" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t("common.save")}</button></div></header>

    {!siteId ? <Section title={t("largeProjects.import.title")} description={t("largeProjects.import.hint")}>
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        {importProviders.length > 1 ? <select className="field" value={importProvider} onChange={(event) => setImportProvider(event.target.value as SimpleProjectImportProvider)}>
          {importProviders.map((provider) => <option key={provider} value={provider}>{provider === "modrinth" ? "Modrinth" : "CurseForge"}</option>)}
        </select> : <div className="field flex items-center">CurseForge</div>}
        <input className="field" type="url" placeholder={simpleProjectImportPlaceholder(projectType, importProvider)} value={providerURL} onChange={(event) => setProviderURL(event.target.value)} />
        <button className="button-secondary focus-ring" disabled={importing || !providerURL.trim()} type="button" onClick={() => void importFromProvider()}>{importing ? `${importProgress}%` : t("largeProjects.import.action")}</button>
      </div>
      {projectType === "map" ? <p className="mt-3 text-sm text-[var(--muted)]">{t("largeProjects.import.mapHint")}</p> : null}
      {projectType === "addon" ? <p className="mt-3 text-sm text-[var(--muted)]">{t("largeProjects.import.addonHint")}</p> : null}
    </Section> : null}

    <Section title={t("mods.submission.sections.identity")}><div className="grid gap-4 md:grid-cols-2"><Field label={t("mods.submission.fields.siteId")}><input className="field font-mono" required value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: normalizeSiteId(event.target.value) })} /></Field>{publicId ? <Field label={t("mods.submission.fields.uniqueId")}><input className="field font-mono" readOnly value={publicId} /></Field> : null}<Field label={t("mods.submission.fields.abbreviation")}><input className="field" maxLength={32} value={draft.abbreviation} onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value })} /></Field><Field label={t("mods.submission.defaultLocale")}><select className="field" value={draft.defaultLocale} onChange={(event) => { const locale = event.target.value as Locale; setDraft({ ...draft, defaultLocale: locale }); selectLocale(locale); }}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field></div><div className="mt-4 flex items-center gap-4"><div className="grid h-28 w-28 place-items-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)]">{draft.iconUrl ? <Image unoptimized alt="" className="h-full w-full object-contain" height={128} src={draft.iconUrl} width={128} /> : "?"}</div><label className="button-secondary focus-ring cursor-pointer">{iconUploading ? t("mods.submission.actions.uploadingIcon") : t("mods.submission.actions.uploadIcon")}<input accept="image/*" className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) setIconCropFile(file); }} /></label></div></Section>

    <Section title={t("largeProjects.editor.localizedContent")}><div className="flex flex-wrap gap-2">{supportedLocales.map((item) => <button className={`focus-ring rounded-md border px-3 py-2 text-sm font-bold ${selectedLocale === item.code ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`} key={item.code} type="button" onClick={() => selectLocale(item.code)}>{item.label}</button>)}</div><div className="mt-5 grid gap-4"><Field label={t("largeProjects.fields.name")}><input className="field" maxLength={160} required={selectedLocale === draft.defaultLocale} value={localization.name} onChange={(event) => updateLocalization(setDraft, selectedLocale, { name: event.target.value })} /></Field><Field label={t("largeProjects.fields.summary")}><textarea className="field min-h-24" maxLength={500} value={localization.summary} onChange={(event) => updateLocalization(setDraft, selectedLocale, { summary: event.target.value })} /></Field><div className="overflow-hidden rounded-xl border border-[var(--line)]"><ToolsPlayground embedded editorTitle={`${t("mods.submission.sections.body")} (${selectedLocale})`} uploadSource={`simple_project_text:${projectType}:${siteId || "draft"}`} value={localization.bodyMarkdown} onChange={(bodyMarkdown) => updateLocalization(setDraft, selectedLocale, { bodyMarkdown })} /></div></div></Section>

    <Section title={t("mods.submission.sections.classification")}><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label={t("largeProjects.fields.minecraftVersions")}><MinecraftVersionPicker values={draft.minecraftVersions} onChange={(minecraftVersions) => setDraft({ ...draft, minecraftVersions })} /></Field>{config.selector && config.selectorOptions ? <Select label={t(`largeProjects.fields.${config.selector}`)} value={draft[config.selector]} options={config.selectorOptions} onChange={(value) => setDraft({ ...draft, [config.selector!]: value })} /> : null}<Select label={t("mods.submission.fields.officialStatus")} value={draft.officialStatus} options={maintenanceOptions} onChange={(officialStatus) => setDraft({ ...draft, officialStatus })} /><Select label={t("mods.submission.fields.sourceStatus")} value={draft.sourceStatus} options={sourceOptions} onChange={(sourceStatus) => setDraft({ ...draft, sourceStatus })} /><Select label={t("mods.submission.fields.license")} value={draft.license} options={licenseOptions} raw onChange={(license) => setDraft({ ...draft, license })} /></div>{config.loaders.length ? <OptionGrid label={t("largeProjects.fields.loaders")} options={config.loaders} values={draft.loaders} onChange={(loaders) => setDraft({ ...draft, loaders })} /> : null}{config.categories.length ? <OptionGrid label={t("largeProjects.fields.categories")} options={config.categories} values={draft.categories} onChange={(categories) => setDraft({ ...draft, categories })} /> : null}{config.features.length ? <OptionGrid label={t("largeProjects.fields.features")} options={config.features} values={draft.features} onChange={(features) => setDraft({ ...draft, features })} /> : null}<Field label={t("mods.submission.fields.searchKeywords")}><input className="field" value={keywordsInput} onChange={(event) => setKeywordsInput(event.target.value)} /></Field></Section>

    {projectType === "addon" ? <Section title={t("largeProjects.fields.parentProjects")} description={t("largeProjects.editor.parentProjectsHint")}><div className="mb-4 grid gap-3 sm:grid-cols-[240px_1fr]"><select className="field" value={parentType} onChange={(event) => setParentType(event.target.value as ProjectResourceType)}>{(["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack"] as ProjectResourceType[]).map((value) => <option key={value} value={value}>{t(`largeProjects.types.${value}`)}</option>)}</select><ModResourceSelectionField projectTypes={[parentType]} token={token} value={parentPickerValues} onChange={(resources) => setDraft((current) => ({ ...current, parentProjects: [...current.parentProjects.filter((item) => item.type !== parentType), ...resources.map((resource) => pickerResourceToParent(resource, parentType))] }))} /></div><ParentList parents={draft.parentProjects} onRemove={(index) => setDraft({ ...draft, parentProjects: draft.parentProjects.filter((_, itemIndex) => itemIndex !== index) })} /></Section> : null}
    <Section title={t("mods.submission.sections.authors")}><CreatorPicker value={draft.authors} onChange={(authors: BackendModAuthor[]) => setDraft({ ...draft, authors })} /></Section>
    <Section title={t("mods.submission.sections.links")} description={t("largeProjects.editor.linksRequired")}><ModLinkEditor links={draft.links} onChange={(links) => setDraft({ ...draft, links })} /></Section>
    <Section title={t("mods.submission.sections.platformIDs")} description={t("largeProjects.editor.downloadSourcesHint")}><div className="grid gap-4 md:grid-cols-2"><Field label={t("mods.submission.fields.curseforgeProjectId")}><input className="field font-mono" value={draft.curseforgeProjectId} onChange={(event) => setDraft({ ...draft, curseforgeProjectId: event.target.value })} /></Field><Field label={t("mods.submission.fields.modrinthProjectId")}><input className="field font-mono" value={draft.modrinthProjectId} onChange={(event) => setDraft({ ...draft, modrinthProjectId: event.target.value })} /></Field></div></Section>
    <Section title={t("mods.submission.sections.gallery")}><FileDropZone accept="image/*" disabled={galleryUploading} hint={t("mods.submission.hints.galleryDrop")} multiple title={t("mods.submission.actions.uploadGallery")} onFiles={(files) => void uploadGallery(files)} /><div className="mt-4 grid gap-3 sm:grid-cols-3">{draft.galleryImages.map((image, index) => <div className="rounded-lg border border-[var(--line)] p-2" key={`${image.fileId}-${index}`}><span className="block truncate text-sm">{image.name}</span><button className="mt-2 text-sm font-bold text-[var(--red)]" type="button" onClick={() => setDraft({ ...draft, galleryImages: draft.galleryImages.filter((_, itemIndex) => itemIndex !== index) })}>{t("common.delete")}</button></div>)}</div></Section>
    {siteId ? <Section title={t("mods.submission.changeReason")}><textarea className="field min-h-24" value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></Section> : null}
    {message ? <p className="mb-5 rounded-xl border border-[var(--red)] p-4 font-bold text-[var(--red)]">{message}</p> : null}<div className="flex justify-end"><button className="button-primary focus-ring" disabled={submitting} type="submit">{t("common.save")}</button></div>
    <SquareImageCropDialog file={iconCropFile} minimumSize={128} outputSizes={[128]} onCancel={() => setIconCropFile(undefined)} onConfirm={(output) => { setIconCropFile(undefined); void uploadIcon(output); }} />
  </form></main>;
  return siteId && publicId ? <ReviewLockGate entityType={projectType} publicId={publicId} returnHref={`${config.path}/${siteId}`}>{editor}</ReviewLockGate> : editor;
}

function localizationFor(draft: SimpleProjectPayload, locale: string): SimpleProjectLocalization { return draft.localizations.find((item) => item.locale === locale) || { locale, name: "", summary: "", bodyMarkdown: "" }; }
function updateLocalization(setDraft: React.Dispatch<React.SetStateAction<SimpleProjectPayload>>, locale: string, patch: Partial<SimpleProjectLocalization>) { setDraft((current) => ({ ...current, localizations: current.localizations.some((item) => item.locale === locale) ? current.localizations.map((item) => item.locale === locale ? { ...item, ...patch } : item) : [...current.localizations, { locale, name: "", summary: "", bodyMarkdown: "", ...patch }] })); }
function recordToPayload(record: SimpleProjectRecord): SimpleProjectPayload { return record; }
function splitValues(value: string) { return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))]; }
function normalizeSiteId(value: string) { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 100); }
function simpleProjectImportPlaceholder(type: SimpleProjectType, provider: SimpleProjectImportProvider) { const section = provider === "modrinth" ? ({ plugin: "plugin", resource_pack: "resourcepack", shader_pack: "shader", datapack: "datapack", addon: "mod" } as Partial<Record<SimpleProjectType, string>>)[type] : ({ plugin: "bukkit-plugins", map: "worlds", resource_pack: "texture-packs", shader_pack: "shaders", datapack: "data-packs", addon: "mc-addons" } as Record<SimpleProjectType, string>)[type]; return provider === "modrinth" ? `https://modrinth.com/${section || "mod"}/...` : `https://www.curseforge.com/minecraft/${section}/...`; }
function pickerResourceToParent(resource: CatalogResourceRef, type: ProjectResourceType): SimpleProjectParent { return { publicId: resource.unresolved ? undefined : resource.publicId, type: type as SimpleProjectParent["type"], identifier: resource.unresolved ? resource.rawIdentifier || resource.id : undefined, name: resource.resolvedName, siteId: resource.source?.siteId, iconUrl: resource.iconUrl, unresolved: resource.unresolved }; }
function parentToPickerResource(parent: SimpleProjectParent): CatalogResourceRef { return { publicId: parent.publicId || `unresolved:${parent.type}:${parent.identifier}`, id: parent.identifier || parent.siteId || parent.name || "", registry: parent.type, kind: parent.type, names: {}, resolvedName: parent.name, iconUrl: parent.iconUrl, unresolved: parent.unresolved, rawIdentifier: parent.identifier, source: parent.siteId ? { publicId: parent.publicId || "", siteId: parent.siteId, name: parent.name || parent.siteId } : undefined }; }
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}<div className="mt-5">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-black">{label}<div className="mt-2">{children}</div></label>; }
function Select<T extends string>({ label, value, options, raw = false, onChange }: { label: string; value: string; options: readonly T[]; raw?: boolean; onChange: (value: T) => void }) { const { t } = useI18n(); return <label className="text-sm font-black">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{raw ? option : t(`largeProjects.options.${option}`)}</option>)}</select></label>; }
function OptionGrid({ label, options, values, onChange }: { label: string; options: readonly string[]; values: string[]; onChange: (values: string[]) => void }) { const { t } = useI18n(); return <fieldset className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4"><legend className="px-2 font-black">{label}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{options.map((option) => <label className="flex items-center gap-2 text-sm font-bold" key={option}><input type="checkbox" checked={values.includes(option)} onChange={() => onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option])} />{t(`largeProjects.options.${option}`)}</label>)}</div></fieldset>; }
function ParentList({ parents, onRemove }: { parents: SimpleProjectParent[]; onRemove: (index: number) => void }) { const { t } = useI18n(); return <div className="grid gap-2 sm:grid-cols-2">{parents.map((parent, index) => <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3" key={`${parent.type}-${parent.publicId || parent.identifier}-${index}`}><span className="grid h-10 w-10 place-items-center rounded bg-[var(--panel-subtle)]">{parent.unresolved ? "?" : [...(parent.name || parent.identifier || "R")].slice(0, 2).join("")}</span><span className="min-w-0 flex-1"><strong className="block truncate">{parent.name || parent.identifier}</strong><small>{t(`largeProjects.types.${parent.type}`)}</small></span><button className="font-bold text-[var(--red)]" type="button" onClick={() => onRemove(index)}>×</button></div>)}</div>; }
