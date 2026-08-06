"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { supportedLocales, useI18n, type Locale } from "../_lib/i18n-provider";
import type { LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { ToolsPlayground } from "./tools-playground";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { AspectImageCropDialog } from "./aspect-image-crop-dialog";
import { FileDropZone } from "./file-drop-zone";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

const blueprintAccept = ".nbt,.schem,.schematic,.litematic";

export function BlueprintUpload() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [blueprint, setBlueprint] = useState<File>();
  const [cover, setCover] = useState<File>();
	const [coverCropFile, setCoverCropFile] = useState<File>();
	const [coverPreview, setCoverPreview] = useState("");
  const initialLocale = locale as Locale;
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [localizations, setLocalizations] = useState<LocalizationVersion<LocalizedContentFields>[]>(() => [emptyUploadLocalization(initialLocale)]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const selected = localizations.find((item) => item.locale === selectedLocale) ?? emptyUploadLocalization(selectedLocale);
  const defaultVersion = localizations.find((item) => item.locale === defaultLocale) ?? emptyUploadLocalization(defaultLocale);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  function selectBlueprint(file?: File) {
    if (!file) return;
    setBlueprint(file);
    if (!selected.fields.name) updateUploadLocalization(setLocalizations, selectedLocale, { name: file.name.replace(/\.[^.]+$/, "") });
  }

  async function submit() {
    if (!blueprint || !token || !defaultVersion.fields.name.trim()) return;
    setUploading(true);
    setProgress(5);
    try {
      const uploaded = await uploadUserFileToOSS(blueprint, token, "blueprint_library");
      const publicId = uploaded.blueprintId || uploaded.blueprint?.id;
      if (!publicId) throw new Error(t("blueprints.uploadFailed"));
      setProgress(55);
      if (cover) {
        await uploadUserFileToOSS(cover, token, `blueprint_cover:${publicId}`);
      }
      setProgress(82);
      await apiRequest(`/api/v1/blueprints/${encodeURIComponent(publicId)}`, {
        method: "PUT",
        body: JSON.stringify({
          title: defaultVersion.fields.name.trim(),
          description: defaultVersion.fields.contentMarkdown,
          defaultLocale,
          localizations: localizations.filter((item) => item.fields.name.trim()).map((item) => ({
            locale: item.locale,
            name: item.fields.name.trim(),
            summary: item.fields.summary,
            contentMarkdown: item.fields.contentMarkdown,
          })),
        }),
      }, token);
      setProgress(100);
      notifySite(t("blueprints.uploadQueuedNotice"), t("blueprints.title"), "success");
      router.push(`/blueprints/${publicId}`);
    } catch (error) {
      notifySite(error instanceof Error ? error.message : String(error), t("blueprints.title"), "danger");
    } finally {
      setUploading(false);
    }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath="/blueprints/upload" />;

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-6xl px-4 py-7"><Link className="text-sm font-bold text-[var(--accent)]" href="/blueprints">{t("blueprints.title")}</Link><h1 className="mt-2 text-3xl font-black">{t("blueprints.uploadPage.title")}</h1><p className="mt-2 text-[var(--muted)]">{t("blueprints.uploadPage.subtitle")}</p></div></header>
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="space-y-6">
        <ContentLanguageSwitcher value={selectedLocale} versions={localizations} onChange={setSelectedLocale} />
        <label className="block font-black">{t("mods.submission.defaultLocale")}<select className="field mt-2" value={defaultLocale} onChange={(event) => { const next = event.target.value as Locale; setDefaultLocale(next); setLocalizations((items) => ensureUploadLocalization(items, next)); }}>
          {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select></label>
        <div><span className="mb-2 block font-black">{t("blueprints.uploadPage.file")}</span><FileDropZone accept={blueprintAccept} className="min-h-44 p-6" disabled={uploading} hint={t("blueprints.dropFileHint")} title={blueprint?.name || t("blueprints.dropFile")} onFiles={(files) => selectBlueprint(files[0])} /></div>
        <label className="block"><span className="mb-2 block font-black">{t("blueprints.uploadPage.name")} ({selectedLocale})</span><input className="field" maxLength={120} value={selected.fields.name} onChange={(event) => updateUploadLocalization(setLocalizations, selectedLocale, { name: event.target.value })} /></label>
        <section className="surface rounded-lg border border-[var(--line)] p-5">
          <h2 className="font-black">{t("blueprints.uploadPage.cover")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.coverHint")}</p>
          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] md:items-start">
            <div>
              <input className="field" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCoverCropFile(event.target.files?.[0])} />
            </div>
            <div className="relative aspect-[121/75] overflow-hidden rounded-md bg-[var(--panel-subtle)]">{coverPreview ? <Image unoptimized fill alt="" className="object-cover" src={coverPreview} /> : <div className="grid h-full place-items-center text-sm text-[var(--muted)]">121 : 75</div>}</div>
          </div>
        </section>
        <section><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-black">{t("blueprints.introduction")} ({selectedLocale})</h2><span className="text-sm text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded editorTitle={t("blueprints.introduction")} value={selected.fields.contentMarkdown} onChange={(contentMarkdown) => updateUploadLocalization(setLocalizations, selectedLocale, { contentMarkdown })} /></section>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center">
        {uploading ? <div className="surface rounded-lg border border-[var(--line)] p-5"><div className="flex justify-between font-bold"><span>{t("blueprints.uploadPage.uploading")}</span><span>{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.canClose")}</p></div> : null}
          <button className="button-primary focus-ring w-full sm:col-start-2" disabled={!blueprint || !defaultVersion.fields.name.trim() || uploading} type="button" onClick={() => void submit()}>{uploading ? t("tools.playground.uploading") : t("blueprints.upload")}</button>
        </div>
      </div>
    </div>
    <AspectImageCropDialog aspectHeight={75} aspectWidth={121} file={coverCropFile} minimumHeight={75} minimumWidth={121}
      outputs={[{ key: "cover", width: 1210, height: 750, type: "image/webp", quality: 0.86 }]}
      onCancel={() => setCoverCropFile(undefined)} onConfirm={(output) => { setCoverCropFile(undefined); setCover(output.files.get("cover")); setCoverPreview(output.previewUrl); }} />
  </main>;
}
function emptyUploadLocalization(locale: Locale): LocalizationVersion<LocalizedContentFields> {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}
function ensureUploadLocalization(items: LocalizationVersion<LocalizedContentFields>[], locale: Locale) {
  return items.some((item) => item.locale === locale) ? items : [...items, emptyUploadLocalization(locale)];
}

function updateUploadLocalization(
  setter: React.Dispatch<React.SetStateAction<LocalizationVersion<LocalizedContentFields>[]>>,
  locale: Locale,
  patch: Partial<LocalizedContentFields>,
) {
  setter((items) => {
    const current = items.find((item) => item.locale === locale) ?? emptyUploadLocalization(locale);
    const next = { ...current, fields: { ...current.fields, ...patch }, reviewStatus: "draft" as const };
    return items.some((item) => item.locale === locale) ? items.map((item) => item.locale === locale ? next : item) : [...items, next];
  });
}
