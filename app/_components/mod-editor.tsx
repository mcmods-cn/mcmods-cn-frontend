"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiRequest, ApiError } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  BackendModCompatibility,
  BackendModAuthor,
  BackendModImportJob,
  BackendModIdentifier,
  BackendModGalleryImage,
  BackendModLocalization,
  BackendModRecord,
  BackendModRelationship,
  BackendModRelationshipGroup,
  BackendModRevision,
  CreateModPayload,
  MinecraftVersionConfig,
} from "../_lib/mod-api";
import {
  environmentOptions,
  commonVersions,
  licenseOptions,
  loaderOptions,
  maintenanceOptions,
  primaryCategoryOptions,
  sourceOptions,
  tagOptions,
} from "../_lib/mod-catalog-data";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import type { Locale } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { CreatorPicker } from "./creator-picker";
import { ToolsPlayground } from "./tools-playground";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { ModResourcePickerDialog } from "./editor/mod-resource-picker";
import { SquareImageCropDialog, type SquareCropOutput } from "./square-image-crop-dialog";
import type { CatalogResourceRef } from "../_lib/editor-types";

type ModDraft = Omit<CreateModPayload, "searchKeywords"> & { searchKeywords: string };

const linkTypeGroups = [
  { key: "sites", types: ["official", "curseforge", "modrinth", "mcmod", "klpbbs", "minebbs", "redstoneRelay", "mcbbsMemorial", "mcbbsArchive", "sourceforge", "minecraftForum", "planetMinecraft", "mcpedl", "spigotmc", "wiki"] },
  { key: "code", types: ["github", "gitlab", "gitee", "gitea", "gitpod", "gitcode", "bitbucket", "maven", "crowdin", "mastodon", "issue"] },
  { key: "drives", types: ["baiduPan", "aliyunDrive", "quarkDrive", "weiyun", "lanzou", "chinaMobileCloud", "tianyiCloud", "cowTransfer", "googleDrive", "oneDrive", "dropbox", "mediaFire"] },
  { key: "community", types: ["bilibili", "weibo", "tieba", "zhihu", "bcy", "ftb", "patreon", "buyMeACoffee", "kofi", "aifadian", "kook", "discord", "twitter", "youtube", "reddit", "other"] },
] as const;

const emptyRelationship = (): BackendModRelationship => ({ type: "dependency", relatedModName: "" });
const emptyRelationshipGroup = (): BackendModRelationshipGroup => ({ label: "", loader: "", minecraftVersions: [], modVersion: "", direction: "outgoing", relationships: [emptyRelationship()] });
const emptyDraft = (): ModDraft => ({
  siteId: "",
  primaryName: "",
  secondaryName: "",
  abbreviation: "",
  summary: "",
  modIds: [{ identifier: "", primary: true, minecraftVersionMin: "", minecraftVersionMax: "", minecraftVersions: [] }],
  defaultLocale: "zh-CN",
  localizations: [{ locale: "zh-CN", name: "", summary: "", contentMarkdown: "" }],
  environment: "bothRequired",
  primaryCategory: "utility",
  tags: [],
  searchKeywords: "",
  authors: [],
  officialStatus: "development",
  sourceStatus: "unknown",
  license: "Custom",
  curseforgeProjectId: "",
  modrinthProjectId: "",
  githubProjectPath: "",
  iconUrl: "",
  bodyMarkdown: "",
  submissionMethod: "manual",
  links: [],
  relationshipGroups: [],
  compatibilities: [],
  galleryImages: [],
});

export function ModEditor({ siteId, importMethod = "manual", importURL = "" }: { siteId?: string; importMethod?: string; importURL?: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [draft, setDraft] = useState<ModDraft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(siteId));
  const [uniqueId, setUniqueId] = useState("");
  const [baseRevisionId, setBaseRevisionId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const importAttemptRef = useRef("");
  const [changeReason, setChangeReason] = useState("");
  const [minecraftConfig, setMinecraftConfig] = useState<MinecraftVersionConfig>(() => fallbackMinecraftConfig());
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [iconCropFile, setIconCropFile] = useState<File>();
  const [iconUploading, setIconUploading] = useState(false);

  const localized = modLocalization(draft, selectedLocale);
  const localizationVersions = draft.localizations.map((item) => ({
    locale: item.locale,
    fields: item,
    provenance: "human" as const,
    reviewStatus: "approved" as const,
    editable: true,
  }));

  useEffect(() => {
    let cancelled = false;
    apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions")
      .then((config) => { if (!cancelled) setMinecraftConfig(config); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !siteId) return;
    let cancelled = false;
    apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}/editor`, {}, token)
      .then((record) => {
        if (!cancelled) {
          setDraft(draftFromSource(record));
          setUniqueId(record.uniqueId);
          setBaseRevisionId(record.publishedRevisionId);
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("mods.submission.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ready, siteId, t, token]);

  useEffect(() => {
    const provider = importMethod === "modrinth" || importMethod === "curseforge" || importMethod === "github" ? importMethod : "";
    const attemptKey = `${provider}:${importURL}`;
    if (!ready || !token || siteId || !provider || !importURL || importAttemptRef.current === attemptKey) return;
    let cancelled = false;
    let timer = 0;
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      importAttemptRef.current = attemptKey;
      setLoading(true);
      setImportProgress(0);
      setMessage("");
      void (async () => {
        try {
          let job = await apiRequest<BackendModImportJob>(
            "/api/v1/mod-imports",
            { method: "POST", body: JSON.stringify({ provider, url: importURL }) },
            token,
          );
          while (!cancelled && (job.status === "queued" || job.status === "running")) {
            setImportProgress(job.progress);
            await new Promise<void>((resolve) => { timer = window.setTimeout(resolve, 900); });
            if (cancelled) return;
            job = await apiRequest<BackendModImportJob>(`/api/v1/mod-imports/${encodeURIComponent(job.id)}`, {}, token);
          }
          if (cancelled) return;
          if (job.status !== "completed" || !job.result) {
            throw new Error(job.error || t("mods.submission.importFailed"));
          }
          setDraft(draftFromSource(job.result));
          setImportProgress(100);
        } catch (error) {
          if (!cancelled) setMessage(error instanceof Error ? error.message : t("mods.submission.importFailed"));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearTimeout(timer);
    };
  }, [importMethod, importURL, ready, siteId, t, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setMessage(t("mods.submission.loginRequired"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    const snapshot = payloadFromDraft(draft);
    try {
      if (siteId) {
        const revision = await apiRequest<BackendModRevision>(
          `/api/v1/mods/${encodeURIComponent(siteId)}/revisions`,
          { method: "POST", body: JSON.stringify({ snapshot, changeReason, baseRevisionId }) },
          token,
        );
        router.push(`/mods/${revision.status === "approved" ? snapshot.siteId : siteId}/history`);
      } else {
        const created = await apiRequest<BackendModRecord>("/api/v1/mods", { method: "POST", body: JSON.stringify(snapshot) }, token);
        router.push(`/mods/${created.siteId}`);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t("mods.submission.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadGalleryImages(files: FileList | null) {
    if (!files?.length || !token) return;
    const images = [...files].filter((file) => file.type.startsWith("image/")).slice(0, Math.max(0, 32 - draft.galleryImages.length));
    if (!images.length) return;
    setGalleryUploading(true);
    try {
      const uploaded: BackendModGalleryImage[] = [];
      for (const file of images) {
        const record = await uploadUserFileToOSS(file, token, `mod_gallery:${siteId || "draft"}`);
        uploaded.push({ fileId: record.id, name: record.originalName || file.name, contentType: record.contentType, sizeBytes: record.sizeBytes, url: record.accessUrl });
      }
      setDraft((current) => ({ ...current, galleryImages: [...current.galleryImages, ...uploaded].slice(0, 32) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.galleryUploadFailed"));
    } finally {
      setGalleryUploading(false);
    }
  }

  async function uploadModIcon(output: SquareCropOutput) {
    if (!token) return;
    const file = output.files.get(128);
    if (!file) {
      URL.revokeObjectURL(output.previewUrl);
      setMessage(t("mods.submission.iconUploadFailed"));
      return;
    }
    setIconUploading(true);
    setMessage("");
    try {
      const record = await uploadUserFileToOSS(file, token, `mod_icon:${siteId || draft.siteId || "draft"}`);
      const iconUrl = record.accessUrl || record.url || "";
      if (!iconUrl) throw new Error(t("mods.submission.iconUploadFailed"));
      setDraft((current) => ({ ...current, iconUrl }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.submission.iconUploadFailed"));
    } finally {
      URL.revokeObjectURL(output.previewUrl);
      setIconUploading(false);
    }
  }

  if (!ready || loading) {
    const importing = loading && importMethod !== "manual";
    return <EditorState text={importing ? t("mods.submission.importProgress", { progress: importProgress }) : t("common.loading")} progress={importing ? importProgress : undefined} />;
  }
  if (!token) return <EditorState text={t("mods.submission.loginRequired")} login />;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <form className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6" onSubmit={submit}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={siteId ? `/mods/${siteId}` : "/mods"}>{t("mods.detail.back")}</Link>
            <h1 className="mt-2 text-3xl font-black">{t(siteId ? "mods.submission.editTitle" : "mods.submission.manualTitle")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("mods.submission.reviewNotice")}</p>
            {importMethod !== "manual" ? <p className="mt-2 text-sm font-bold text-[var(--accent)]">{t("mods.submission.importPrepared", { source: importMethod, url: importURL })}</p> : null}
          </div>
          <button className="button-primary focus-ring" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t(siteId ? "mods.submission.actions.submitRevision" : "mods.submission.actions.submit")}</button>
        </header>

        <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_260px]">
          <ContentLanguageSwitcher value={selectedLocale} versions={localizationVersions} onChange={setSelectedLocale} />
          <label className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-black">
            {t("mods.submission.defaultLocale")}
            <select
              className="field mt-3"
              value={draft.defaultLocale}
              onChange={(event) => {
                const nextLocale = event.target.value as Locale;
                setDraft((current) => setModDefaultLocale(current, nextLocale));
                setSelectedLocale(nextLocale);
              }}
            >
              {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <FormSection title={t("mods.submission.sections.identity")} description={t("mods.submission.sections.identityHint")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("mods.submission.fields.siteId")} required hint={t("mods.submission.hints.siteId")}><input className="field font-mono" required maxLength={100} pattern="[a-z0-9](?:[a-z0-9_-]{0,98}[a-z0-9])?" value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: normalizeSiteIdInput(event.target.value) })} /></Field>
            {uniqueId ? <Field label={t("mods.submission.fields.uniqueId")} hint={t("mods.submission.hints.uniqueId")}><input className="field font-mono" readOnly value={uniqueId} /></Field> : null}
            <Field label={t("mods.submission.fields.primaryName")} required hint={t("mods.submission.hints.primaryName")}><input className="field" required maxLength={160} value={draft.primaryName} onChange={(event) => setDraft({ ...draft, primaryName: event.target.value })} /></Field>
            <Field label={`${t("mods.submission.fields.secondaryName")} (${selectedLocale})`} hint={t("mods.submission.hints.secondaryName")}><input className="field" maxLength={160} value={localized.name} onChange={(event) => setDraft(updateModLocalization(draft, selectedLocale, { name: event.target.value }))} /></Field>
            <Field label={t("mods.submission.fields.abbreviation")} hint={t("mods.submission.hints.abbreviation")}><input className="field" maxLength={32} pattern="[\x21-\x7E]*" value={draft.abbreviation} onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value })} /></Field>
          </div>
          <Field label={`${t("mods.submission.fields.summary")} (${selectedLocale})`} hint={t("mods.submission.hints.summary")}><textarea className="field min-h-24 resize-y" maxLength={500} value={localized.summary} onChange={(event) => setDraft(updateModLocalization(draft, selectedLocale, { summary: event.target.value }))} /></Field>
          <div className="mt-4 flex flex-wrap items-center gap-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
            <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              {draft.iconUrl
                ? <Image unoptimized alt={t("mods.submission.fields.icon")} className="h-full w-full object-contain" height={128} src={apiAssetURL(draft.iconUrl)} width={128} />
                : <span className="text-4xl font-black text-[var(--muted)]">?</span>}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black">{t("mods.submission.fields.icon")}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("mods.submission.hints.icon")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className={`button-secondary focus-ring inline-flex cursor-pointer ${iconUploading ? "pointer-events-none opacity-60" : ""}`}>
                  {iconUploading ? t("mods.submission.actions.uploadingIcon") : t(draft.iconUrl ? "mods.submission.actions.replaceIcon" : "mods.submission.actions.uploadIcon")}
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={iconUploading}
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (!file) return;
                      if (!file.type.startsWith("image/")) {
                        setMessage(t("mods.submission.iconUploadFailed"));
                        return;
                      }
                      setIconCropFile(file);
                    }}
                  />
                </label>
                {draft.iconUrl ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={iconUploading} type="button" onClick={() => setDraft((current) => ({ ...current, iconUrl: "" }))}>{t("common.delete")}</button> : null}
              </div>
            </div>
          </div>
          <ModIdentifierEditor config={minecraftConfig} optionCodes={modSupportedVersionOptions(draft, minecraftConfig)} values={draft.modIds} onChange={(modIds) => setDraft({ ...draft, modIds })} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.classification")}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SelectField label={t("mods.submission.fields.environment")} value={draft.environment} options={environmentOptions} optionLabel={(value) => t(`mods.environments.${value}`)} onChange={(value) => setDraft({ ...draft, environment: value })} />
            <SelectField label={t("mods.submission.fields.primaryCategory")} value={draft.primaryCategory} options={primaryCategoryOptions} optionLabel={(value) => t(`mods.categories.${value}`)} onChange={(value) => setDraft({ ...draft, primaryCategory: value })} />
            <SelectField label={t("mods.submission.fields.officialStatus")} value={draft.officialStatus} options={maintenanceOptions} optionLabel={(value) => t(`mods.statuses.${value}`)} onChange={(value) => setDraft({ ...draft, officialStatus: value })} />
            <SelectField label={t("mods.submission.fields.sourceStatus")} value={draft.sourceStatus} options={sourceOptions} optionLabel={(value) => t(`mods.sources.${value}`)} onChange={(value) => setDraft({ ...draft, sourceStatus: value })} />
            <SelectField label={t("mods.submission.fields.license")} value={draft.license} options={licenseOptions} optionLabel={(value) => value} onChange={(value) => setDraft({ ...draft, license: value })} />
          </div>
          <Field label={t("mods.submission.fields.tags")} hint={t("mods.submission.hints.tags")}>
            <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-4">
              {tagOptions.map((tag) => <label key={tag} className="flex cursor-pointer items-center gap-2 text-sm"><input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={draft.tags.includes(tag)} onChange={() => setDraft({ ...draft, tags: toggleArray(draft.tags, tag) })} />{t(`mods.tags.${tag}`)}</label>)}
            </div>
          </Field>
          <Field label={t("mods.submission.fields.searchKeywords")} hint={t("mods.submission.hints.searchKeywords")}><textarea className="field min-h-20 resize-y" value={draft.searchKeywords} placeholder={t("mods.submission.placeholders.keywords")} onChange={(event) => setDraft({ ...draft, searchKeywords: event.target.value })} /></Field>
        </FormSection>

        <FormSection title={t("mods.detail.compatibility")}>
          <CompatibilityEditor config={minecraftConfig} value={draft.compatibilities} onChange={(compatibilities) => setDraft((current) => ({ ...current, compatibilities }))} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.authors")}>
          <CreatorPicker value={draft.authors} onChange={(authors: BackendModAuthor[]) => setDraft({ ...draft, authors })} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.links")} description={t("mods.submission.sections.linksHint")}>
          <ModLinkEditor links={draft.links} onChange={(links) => setDraft((current) => draftWithLinks(current, links))} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.relationships")} description={t("mods.submission.sections.relationshipsHint")}>
          <RelationshipGroupEditor groups={draft.relationshipGroups} config={minecraftConfig} compatibilities={draft.compatibilities} currentSiteId={siteId} token={token} onChange={(relationshipGroups) => setDraft({ ...draft, relationshipGroups })} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.platformIDs")}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label={t("mods.submission.fields.curseforgeProjectId")}><input className="field font-mono" value={draft.curseforgeProjectId} onChange={(event) => setDraft({ ...draft, curseforgeProjectId: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.modrinthProjectId")}><input className="field font-mono" value={draft.modrinthProjectId} onChange={(event) => setDraft({ ...draft, modrinthProjectId: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.githubProjectPath")} hint={t("mods.submission.hints.githubProjectPath")}><input className="field font-mono" placeholder="FortyTwo/Test" value={draft.githubProjectPath} onChange={(event) => setDraft((current) => draftWithGitHubProjectPath(current, event.target.value))} /></Field>
          </div>
        </FormSection>

        <section className="mb-6 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <ToolsPlayground embedded editorTitle={`${t("mods.submission.sections.body")} (${selectedLocale})`} editorDescription={t("mods.submission.sections.bodyHint")} value={localized.contentMarkdown} onChange={(contentMarkdown) => setDraft((current) => updateModLocalization(current, selectedLocale, { contentMarkdown }))} />
        </section>

        <FormSection title={t("mods.submission.sections.gallery")} description={t("mods.submission.sections.galleryHint")}>
          <label className="button-secondary focus-ring inline-flex cursor-pointer">
            {galleryUploading ? t("mods.submission.actions.uploadingGallery") : t("mods.submission.actions.uploadGallery")}
            <input className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/apng" disabled={galleryUploading} multiple type="file" onChange={(event) => { void uploadGalleryImages(event.currentTarget.files); event.currentTarget.value = ""; }} />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {draft.galleryImages.map((image, index) => <figure className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]" key={`${image.publicId ?? "new"}-${image.fileId}`}>
            {image.url ? <Image unoptimized alt={image.name || `Gallery ${index + 1}`} className="aspect-video w-full object-cover" height={360} src={apiAssetURL(image.url)} width={640} /> : <div className="grid aspect-video place-items-center text-sm text-[var(--muted)]">{image.name}</div>}
              <figcaption className="flex items-center justify-between gap-2 p-2 text-xs"><span className="truncate">{image.name}</span><button className="font-bold text-[var(--red)]" type="button" onClick={() => setDraft((current) => ({ ...current, galleryImages: current.galleryImages.filter((_, itemIndex) => itemIndex !== index) }))}>{t("common.delete")}</button></figcaption>
            </figure>)}
          </div>
        </FormSection>

        {siteId ? <FormSection title={t("mods.submission.changeReason")}><textarea className="field min-h-24 resize-y" maxLength={500} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></FormSection> : null}
        {message ? <p className="mb-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{message}</p> : null}
        <div className="flex justify-end"><button className="button-primary focus-ring px-6" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t(siteId ? "mods.submission.actions.submitRevision" : "mods.submission.actions.submit")}</button></div>
        <SquareImageCropDialog
          file={iconCropFile}
          minimumSize={128}
          outputSizes={[128]}
          onCancel={() => setIconCropFile(undefined)}
          onConfirm={(output) => {
            setIconCropFile(undefined);
            void uploadModIcon(output);
          }}
        />
      </form>
    </main>
  );
}

function ModIdentifierEditor({ values, config, optionCodes, onChange }: { values: BackendModIdentifier[]; config: MinecraftVersionConfig; optionCodes: string[]; onChange: (values: BackendModIdentifier[]) => void }) {
  const { t } = useI18n();
  const rows = values.length ? values : [{ identifier: "", primary: true, minecraftVersionMin: "", minecraftVersionMax: "", minecraftVersions: [] }];
  const update = (index: number, value: BackendModIdentifier) => onChange(rows.map((item, itemIndex) => itemIndex === index ? value : item));
  return <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">{t("mods.submission.modIds.title")}</h3><p className="mt-1 text-xs text-[var(--muted)]">{t("mods.submission.modIds.hint")}</p></div><button className="button-secondary focus-ring" type="button" onClick={() => onChange([...rows, { identifier: "", primary: false, minecraftVersionMin: "", minecraftVersionMax: "", minecraftVersions: [] }])}>{t("mods.submission.modIds.add")}</button></div>
    <div className="mt-3 grid gap-3">{rows.map((item, index) => <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 md:grid-cols-[minmax(180px,1fr)_minmax(240px,1.4fr)_auto_auto] md:items-end" key={index}>
      <Field label={t("mods.submission.modIds.identifier")}><input className="field font-mono" maxLength={128} pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" required={item.primary} value={item.identifier} onChange={(event) => update(index, { ...item, identifier: event.target.value })} /></Field>
      <Field label={t("mods.submission.modIds.minecraftVersions")}><MinecraftVersionPicker config={config} emptyLabelKey="mods.submission.modIds.allSupportedVersions" optionCodes={optionCodes} values={item.minecraftVersions ?? []} onChange={(minecraftVersions) => update(index, { ...item, minecraftVersions })} /></Field>
      <label className="flex h-11 items-center gap-2 text-sm font-bold"><input checked={item.primary} name="primary-mod-id" type="radio" onChange={() => onChange(rows.map((row, rowIndex) => ({ ...row, primary: rowIndex === index })))} />{t("mods.submission.modIds.primary")}</label>
      <button className="button-secondary focus-ring text-[var(--red)]" disabled={rows.length === 1} type="button" onClick={() => { const next = rows.filter((_, rowIndex) => rowIndex !== index); if (item.primary && next[0]) next[0] = { ...next[0], primary: true }; onChange(next); }}>{t("common.delete")}</button>
    </div>)}</div>
  </div>;
}

function ModLinkEditor({ links, onChange }: { links: BackendModRecord["links"]; onChange: (links: BackendModRecord["links"]) => void }) {
  const { t } = useI18n();
  return <div className="grid gap-3">
    {!links.length ? <p className="rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm font-semibold text-[var(--muted)]">{t("mods.submission.noLinks")}</p> : null}
    {links.map((link, index) => <div className="flex items-start gap-2" key={`${link.type}-${index}`}>
      <div className="grid flex-1 gap-2 lg:grid-cols-[220px_minmax(260px,1fr)_minmax(220px,0.8fr)]">
        <select className="field" value={link.type} onChange={(event) => onChange(replaceAt(links, index, { ...link, type: event.target.value }))}>{linkTypeGroups.map((group) => <optgroup key={group.key} label={t(`mods.submission.linkGroups.${group.key}`)}>{group.types.map((type) => <option key={type} value={type}>{t(`mods.submission.linkTypes.${type}`)}</option>)}</optgroup>)}</select>
        <input className="field" required type="url" value={link.url} placeholder="https://" onChange={(event) => onChange(replaceAt(links, index, { ...link, url: event.target.value }))} />
        <input className="field" maxLength={240} value={link.note ?? ""} placeholder={t("mods.submission.placeholders.linkNote")} onChange={(event) => onChange(replaceAt(links, index, { ...link, note: event.target.value }))} />
      </div>
      <button className="button-secondary focus-ring shrink-0" type="button" onClick={() => onChange(links.filter((_, itemIndex) => itemIndex !== index))}>{t("common.delete")}</button>
    </div>)}
    <button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange([...links, { type: "official", url: "", note: "" }])}>+ {t("mods.submission.actions.addLink")}</button>
  </div>;
}

function CompatibilityEditor({ config, value, onChange }: { config: MinecraftVersionConfig; value: BackendModCompatibility[]; onChange: (value: BackendModCompatibility[]) => void }) {
  const { t } = useI18n();
  const selectedLoaders = new Set(value.map((item) => item.loader));
  function toggleLoader(loader: string) {
    if (selectedLoaders.has(loader)) {
      onChange(value.filter((item) => item.loader !== loader));
      return;
    }
    onChange([...value, { loader, versions: [] }]);
  }
  return <div className="grid gap-4"><div><h3 className="text-sm font-black">{t("mods.submission.compatibility.loaders")}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">{config.loaders.map((loader) => <label key={loader.code} className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={selectedLoaders.has(loader.code)} onChange={() => toggleLoader(loader.code)} />{loader.name}</label>)}</div></div>{value.map((compatibility) => { const loader = config.loaders.find((item) => item.code === compatibility.loader); const versions = loader?.versions ?? config.versions.map((item) => item.code); return <section key={compatibility.loader} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">{loader?.name ?? compatibility.loader}</h3><span className="text-xs font-bold text-[var(--muted)]">{t("mods.submission.compatibility.selectedCount", { count: compatibility.versions.length })}</span></div><MinecraftVersionPicker className="mt-3 w-full" config={config} optionCodes={versions} values={compatibility.versions} onChange={(selectedVersions) => onChange(value.map((item) => item.loader === compatibility.loader ? { ...item, versions: selectedVersions } : item))} /></section>; })}{value.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm font-semibold text-[var(--muted)]">{t("mods.submission.compatibility.empty")}</p> : null}</div>;
}

function RelationshipGroupEditor({ groups, config, compatibilities, currentSiteId = "", token = "", onChange }: { groups: BackendModRelationshipGroup[]; config: MinecraftVersionConfig; compatibilities: BackendModCompatibility[]; currentSiteId?: string; token?: string; onChange: (groups: BackendModRelationshipGroup[]) => void }) {
  const { locale, t } = useI18n();
  const [pickerTarget, setPickerTarget] = useState<{ groupIndex: number; relationshipIndex: number }>();
  const allowedLoaders = compatibilities.length ? compatibilities.map((item) => item.loader) : config.loaders.map((item) => item.code);
  const selectedRelationship = pickerTarget ? groups[pickerTarget.groupIndex]?.relationships[pickerTarget.relationshipIndex] : undefined;
  const pickerValue = selectedRelationship && (selectedRelationship.relatedModId || selectedRelationship.relatedModIdentifier || selectedRelationship.relatedModName)
    ? [relationshipPickerResource(selectedRelationship, locale)]
    : [];

  function insertRelationships(resources: CatalogResourceRef[]) {
    if (!pickerTarget) return;
    const group = groups[pickerTarget.groupIndex];
    const previous = group.relationships[pickerTarget.relationshipIndex];
    const inserted = resources.map((resource): BackendModRelationship => resource.unresolved
      ? { type: previous.type, relatedModName: "", relatedModIdentifier: resource.rawIdentifier || resource.id }
      : { type: previous.type, relatedModId: resource.publicId, relatedModName: localizedModPickerName(resource, locale) });
    const relationships = [...group.relationships];
    relationships.splice(pickerTarget.relationshipIndex, 1, ...inserted);
    onChange(replaceAt(groups, pickerTarget.groupIndex, { ...group, relationships }));
    setPickerTarget(undefined);
  }

  return <div className="grid gap-4">{groups.map((group, groupIndex) => {
    const allowedVersions = relationshipVersionOptions(group.loader, compatibilities, config);
    const relationshipLabelNamespace = group.direction === "incoming" ? "incomingRelationshipTypes" : "relationshipTypes";
    return <section key={groupIndex} className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
      <div className="flex items-center justify-between gap-3"><h4 className="font-black">{t("mods.submission.relationshipCondition", { number: groupIndex + 1 })}</h4><button className="button-secondary focus-ring" type="button" onClick={() => onChange(groups.filter((_, index) => index !== groupIndex))}>{t("common.delete")}</button></div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <input className="field" value={group.label} placeholder={t("mods.submission.placeholders.conditionLabel")} onChange={(event) => onChange(replaceAt(groups, groupIndex, { ...group, label: event.target.value }))} />
        <select className="field" value={group.loader} onChange={(event) => { const loader = event.target.value; const nextAllowed = relationshipVersionOptions(loader, compatibilities, config); onChange(replaceAt(groups, groupIndex, { ...group, loader, minecraftVersions: group.minecraftVersions.filter((version) => nextAllowed.includes(version)) })); }}><option value="">{t("mods.submission.allSupportedLoaders")}</option>{allowedLoaders.map((loader) => <option key={loader} value={loader}>{config.loaders.find((item) => item.code === loader)?.name ?? loader}</option>)}</select>
        <MinecraftVersionPicker config={config} emptyLabelKey="mods.submission.allSupportedMinecraftVersions" optionCodes={allowedVersions} values={group.minecraftVersions} onChange={(minecraftVersions) => onChange(replaceAt(groups, groupIndex, { ...group, minecraftVersions }))} />
        <input className="field" value={group.modVersion} placeholder={t("mods.submission.placeholders.modVersion")} onChange={(event) => onChange(replaceAt(groups, groupIndex, { ...group, modVersion: event.target.value }))} />
      </div>
      <div className="mt-4 grid gap-2">{group.relationships.map((relationship, relationshipIndex) => <div key={relationshipIndex} className="flex items-start gap-2"><div className="grid flex-1 gap-2 md:grid-cols-[180px_1fr]"><select className="field" value={relationship.type} onChange={(event) => updateRelationship(groups, groupIndex, relationshipIndex, { ...relationship, type: event.target.value as BackendModRelationship["type"] }, onChange)}>{(["dependency", "integration", "conflict"] as const).map((type) => <option key={type} value={type}>{t(`mods.submission.${relationshipLabelNamespace}.${type}`)}</option>)}</select><button className="field focus-ring flex items-center gap-2 text-left" type="button" onClick={() => setPickerTarget({ groupIndex, relationshipIndex })}><span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] font-black">{relationship.relatedModIdentifier ? "?" : "M"}</span><span className="truncate">{relationship.relatedModName || relationship.relatedModIdentifier || t("mods.submission.placeholders.selectRelatedMod")}</span></button></div><button className="button-secondary focus-ring shrink-0" type="button" onClick={() => onChange(replaceAt(groups, groupIndex, { ...group, relationships: group.relationships.filter((_, index) => index !== relationshipIndex) }))}>{t("common.delete")}</button></div>)}<button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange(replaceAt(groups, groupIndex, { ...group, relationships: [...group.relationships, emptyRelationship()] }))}>+ {t("mods.submission.actions.addRelationship")}</button></div>
    </section>;
  })}<button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange([...groups, emptyRelationshipGroup()])}>+ {t("mods.submission.actions.addCondition")}</button>
    <ModResourcePickerDialog
      allowUnresolved={pickerTarget ? groups[pickerTarget.groupIndex]?.direction !== "incoming" : true}
      excludeSiteId={currentSiteId}
      multiple
      open={Boolean(pickerTarget)}
      token={token}
      value={pickerValue}
      onClose={() => setPickerTarget(undefined)}
      onConfirm={insertRelationships}
    />
  </div>;
}

function relationshipPickerResource(relationship: BackendModRelationship, locale: string): CatalogResourceRef {
  const identifier = relationship.relatedModIdentifier || relationship.relatedModName;
  if (!relationship.relatedModId) {
    return {
      publicId: `unresolved:mod:${identifier.toLowerCase()}`,
      id: identifier,
      registry: "mods",
      kind: "mod",
      names: {},
      unresolved: true,
      rawIdentifier: identifier,
    };
  }
  return {
    publicId: relationship.relatedModId,
    id: identifier || relationship.relatedModId,
    registry: "mods",
    kind: "mod",
    names: { [locale]: relationship.relatedModName },
    resolvedName: relationship.relatedModName,
  };
}

function localizedModPickerName(resource: CatalogResourceRef, locale: string) {
  return resource.names[locale] || resource.resolvedName || Object.values(resource.names).find(Boolean) || resource.id;
}

function updateRelationship(groups: BackendModRelationshipGroup[], groupIndex: number, relationshipIndex: number, relationship: BackendModRelationship, onChange: (groups: BackendModRelationshipGroup[]) => void) {
  const group = groups[groupIndex];
  onChange(replaceAt(groups, groupIndex, { ...group, relationships: replaceAt(group.relationships, relationshipIndex, relationship) }));
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{title}</h2>{description ? <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}<div className="mt-4 grid gap-4">{children}</div></section>;
}

function Field({ label, hint, required = false, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-black">{label}{required ? <span className="ml-1 text-[var(--red)]">*</span> : null}</span>{children}{hint ? <span className="mt-1.5 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}</label>;
}

function SelectField<T extends string>({ label, value, options, optionLabel, onChange }: { label: string; value: string; options: readonly T[]; optionLabel: (value: T) => string; onChange: (value: T) => void }) {
  return <Field label={label}><select className="field" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>;
}

function EditorState({ text, login = false, progress }: { text: string; login?: boolean; progress?: number }) {
  const { t } = useI18n();
  return <main className="grid min-h-[65vh] place-items-center px-4 text-center"><div className="w-full max-w-md"><p className="text-lg font-black">{text}</p>{progress !== undefined ? <div className="mt-4 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div> : null}{login ? <Link className="button-primary focus-ring mt-4 inline-flex" href="/login">{t("common.login")}</Link> : null}</div></main>;
}

function draftFromSource(source: BackendModRecord | CreateModPayload): ModDraft {
  return normalizeModDraft({ ...source, compatibilities: source.compatibilities ?? [], searchKeywords: source.searchKeywords.join("\n") });
}

function payloadFromDraft(draft: ModDraft): CreateModPayload {
  return {
    siteId: draft.siteId,
    primaryName: draft.primaryName,
    secondaryName: draft.secondaryName,
    abbreviation: draft.abbreviation,
    summary: draft.summary,
    modIds: draft.modIds,
    defaultLocale: draft.defaultLocale,
    localizations: draft.localizations.filter((item) => item.name.trim() || item.summary.trim() || item.contentMarkdown.trim()),
    environment: draft.environment,
    primaryCategory: draft.primaryCategory,
    compatibilities: draft.compatibilities,
    officialStatus: draft.officialStatus,
    sourceStatus: draft.sourceStatus,
    license: draft.license,
    curseforgeProjectId: draft.curseforgeProjectId,
    modrinthProjectId: draft.modrinthProjectId,
    githubProjectPath: draft.githubProjectPath,
    iconUrl: draft.iconUrl,
    bodyMarkdown: draft.bodyMarkdown,
    searchKeywords: [...new Set(draft.searchKeywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))],
    submissionMethod: draft.submissionMethod,
    tags: draft.tags,
    authors: draft.authors,
    links: draft.links,
    relationshipGroups: draft.relationshipGroups,
    galleryImages: draft.galleryImages.map(({ publicId, fileId }) => ({ publicId, fileId })),
  };
}

function normalizeModDraft(draft: ModDraft): ModDraft {
  const defaultLocale = draft.defaultLocale || "zh-CN";
  const sourceLocalizations = draft.localizations?.length
    ? draft.localizations
    : [{ locale: defaultLocale, name: draft.secondaryName || draft.primaryName, summary: draft.summary, contentMarkdown: draft.bodyMarkdown }];
  const localizations = sourceLocalizations.map((item) => item.locale === defaultLocale ? {
    ...item,
    name: item.name || draft.secondaryName || draft.primaryName,
    summary: item.summary || draft.summary,
    contentMarkdown: item.contentMarkdown || draft.bodyMarkdown,
  } : item);
  const modIds = (draft.modIds?.length ? draft.modIds : [{ identifier: "", primary: true, minecraftVersionMin: "", minecraftVersionMax: "", minecraftVersions: [] }]).map((item) => ({ ...item, minecraftVersions: item.minecraftVersions ?? [] }));
  return { ...draft, defaultLocale, localizations, modIds, links: (draft.links ?? []).map((link) => ({ ...link, note: link.note ?? "" })), githubProjectPath: draft.githubProjectPath ?? githubProjectPathFromLinks(draft.links ?? []), galleryImages: draft.galleryImages ?? [] };
}

function modLocalization(draft: ModDraft, locale: Locale): BackendModLocalization {
  return draft.localizations.find((item) => item.locale === locale) ?? { locale, name: "", summary: "", contentMarkdown: "" };
}

function updateModLocalization(draft: ModDraft, locale: Locale, update: Partial<Omit<BackendModLocalization, "locale">>): ModDraft {
  const existing = modLocalization(draft, locale);
  const next = { ...existing, ...update };
  const localizations = draft.localizations.some((item) => item.locale === locale)
    ? draft.localizations.map((item) => item.locale === locale ? next : item)
    : [...draft.localizations, next];
  const defaultLocale = draft.localizations.length ? draft.defaultLocale : locale;
  const defaultVersion = localizations.find((item) => item.locale === defaultLocale) ?? next;
  return { ...draft, defaultLocale, localizations, secondaryName: defaultVersion.name, summary: defaultVersion.summary, bodyMarkdown: defaultVersion.contentMarkdown };
}

function setModDefaultLocale(draft: ModDraft, locale: Locale): ModDraft {
  const existing = modLocalization(draft, locale);
  const localizations = draft.localizations.some((item) => item.locale === locale)
    ? draft.localizations
    : [...draft.localizations, existing];
  return {
    ...draft,
    defaultLocale: locale,
    localizations,
    secondaryName: existing.name,
    summary: existing.summary,
    bodyMarkdown: existing.contentMarkdown,
  };
}

function apiAssetURL(value?: string) {
  if (!value) return "";
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return value;
}

function normalizeSiteIdInput(value: string) {
  return value.trimStart().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function toggleArray(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function replaceAt<T>(values: T[], index: number, value: T) {
  return values.map((item, itemIndex) => itemIndex === index ? value : item);
}

function modSupportedVersionOptions(draft: ModDraft, config: MinecraftVersionConfig) {
  const selected = [...new Set(draft.compatibilities.flatMap((item) => item.versions))];
  return selected.length ? selected : config.versions.map((item) => item.code);
}

function relationshipVersionOptions(loader: string, compatibilities: BackendModCompatibility[], config: MinecraftVersionConfig) {
  if (compatibilities.length) {
    const selected = loader
      ? compatibilities.find((item) => item.loader === loader)?.versions ?? []
      : [...new Set(compatibilities.flatMap((item) => item.versions))];
    if (selected.length) return selected;
  }
  if (loader) return config.loaders.find((item) => item.code === loader)?.versions ?? config.versions.map((item) => item.code);
  return config.versions.map((item) => item.code);
}

function draftWithLinks(draft: ModDraft, links: BackendModRecord["links"]): ModDraft {
  const githubLink = links.find((link) => link.type === "github");
  const githubProjectPath = githubLink ? githubProjectPathFromURL(githubLink.url) || draft.githubProjectPath : "";
  return { ...draft, links, githubProjectPath };
}

function draftWithGitHubProjectPath(draft: ModDraft, input: string): ModDraft {
  const githubProjectPath = normalizeGitHubProjectInput(input);
  if (!githubProjectPath) {
    return { ...draft, githubProjectPath: "", links: draft.links.filter((link) => link.type !== "github") };
  }
  if (!validGitHubProjectPath(githubProjectPath)) return { ...draft, githubProjectPath };
  const url = `https://github.com/${githubProjectPath}`;
  const githubIndex = draft.links.findIndex((link) => link.type === "github");
  const links = githubIndex >= 0
    ? replaceAt(draft.links, githubIndex, { ...draft.links[githubIndex], url })
    : [...draft.links, { type: "github", url, note: "" }];
  return { ...draft, githubProjectPath, links };
}

function githubProjectPathFromLinks(links: BackendModRecord["links"]) {
  return githubProjectPathFromURL(links.find((link) => link.type === "github")?.url ?? "");
}

function githubProjectPathFromURL(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "github.com") return "";
    return normalizeGitHubProjectInput(parsed.pathname);
  } catch {
    return "";
  }
}

function normalizeGitHubProjectInput(value: string) {
  const input = value.trim();
  if (!input) return "";
  const fromURL = githubProjectPathFromAbsoluteURL(input);
  const parts = (fromURL || input).replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function githubProjectPathFromAbsoluteURL(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase() === "github.com" ? parsed.pathname : "";
  } catch {
    return "";
  }
}

function validGitHubProjectPath(value: string) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(value);
}

function fallbackMinecraftConfig(): MinecraftVersionConfig {
  const versions = [...new Set([...commonVersions])];
  return {
    versions: versions.map((code) => ({ code, type: "release" as const })),
    loaders: loaderOptions.map((code) => ({ code, name: code, versions: [...versions] })),
  };
}
