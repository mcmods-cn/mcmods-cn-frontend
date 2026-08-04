"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { supportedLocales, useI18n, type Locale } from "../_lib/i18n-provider";
import type { LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { ToolsPlayground } from "./tools-playground";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";

const blueprintAccept = ".nbt,.schem,.schematic,.litematic";

export function BlueprintUpload() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [blueprint, setBlueprint] = useState<File>();
  const [cover, setCover] = useState<File>();
  const initialLocale = locale as Locale;
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [localizations, setLocalizations] = useState<LocalizationVersion<LocalizedContentFields>[]>(() => [emptyUploadLocalization(initialLocale)]);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(50);
  const [offsetY, setOffsetY] = useState(50);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const coverURL = useMemo(() => cover ? URL.createObjectURL(cover) : "", [cover]);
  const selected = localizations.find((item) => item.locale === selectedLocale) ?? emptyUploadLocalization(selectedLocale);
  const defaultVersion = localizations.find((item) => item.locale === defaultLocale) ?? emptyUploadLocalization(defaultLocale);

  useEffect(() => () => { if (coverURL) URL.revokeObjectURL(coverURL); }, [coverURL]);
  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/blueprints/upload");
  }, [ready, router, user]);

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
        const coverFile = await cropCoverToWebP(cover, zoom, offsetX, offsetY);
        await uploadUserFileToOSS(coverFile, token, `blueprint_cover:${publicId}`);
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

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-6xl px-4 py-7"><Link className="text-sm font-bold text-[var(--accent)]" href="/blueprints">{t("blueprints.title")}</Link><h1 className="mt-2 text-3xl font-black">{t("blueprints.uploadPage.title")}</h1><p className="mt-2 text-[var(--muted)]">{t("blueprints.uploadPage.subtitle")}</p></div></header>
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="space-y-6">
        <ContentLanguageSwitcher value={selectedLocale} versions={localizations} onChange={setSelectedLocale} />
        <label className="block font-black">{t("mods.submission.defaultLocale")}<select className="field mt-2" value={defaultLocale} onChange={(event) => { const next = event.target.value as Locale; setDefaultLocale(next); setLocalizations((items) => ensureUploadLocalization(items, next)); }}>
          {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select></label>
        <label className="block"><span className="mb-2 block font-black">{t("blueprints.uploadPage.file")}</span><input className="field" type="file" accept={blueprintAccept} onChange={(event) => { const file = event.target.files?.[0]; setBlueprint(file); if (file && !selected.fields.name) updateUploadLocalization(setLocalizations, selectedLocale, { name: file.name.replace(/\.[^.]+$/, "") }); }} /></label>
        <label className="block"><span className="mb-2 block font-black">{t("blueprints.uploadPage.name")} ({selectedLocale})</span><input className="field" maxLength={120} value={selected.fields.name} onChange={(event) => updateUploadLocalization(setLocalizations, selectedLocale, { name: event.target.value })} /></label>
        <section className="surface rounded-lg border border-[var(--line)] p-5">
          <h2 className="font-black">{t("blueprints.uploadPage.cover")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.coverHint")}</p>
          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] md:items-start">
            <div>
              <input className="field" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCover(event.target.files?.[0])} />
              {cover ? <div className="mt-4 grid gap-3"><Range label={t("blueprints.uploadPage.zoom")} min={1} max={3} step={0.05} value={zoom} onChange={setZoom} /><Range label={t("blueprints.uploadPage.horizontal")} min={0} max={100} value={offsetX} onChange={setOffsetX} /><Range label={t("blueprints.uploadPage.vertical")} min={0} max={100} value={offsetY} onChange={setOffsetY} /></div> : null}
            </div>
            <div className="relative aspect-[121/75] overflow-hidden rounded-md bg-[var(--panel-subtle)]">{coverURL ? <Image unoptimized fill alt="" className="object-cover" sizes="360px" src={coverURL} style={{ objectPosition: `${offsetX}% ${offsetY}%`, transform: `scale(${zoom})` }} /> : <div className="grid h-full place-items-center text-sm text-[var(--muted)]">121 : 75</div>}</div>
          </div>
        </section>
        <section><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-black">{t("blueprints.introduction")} ({selectedLocale})</h2><span className="text-sm text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded editorTitle={t("blueprints.introduction")} value={selected.fields.contentMarkdown} onChange={(contentMarkdown) => updateUploadLocalization(setLocalizations, selectedLocale, { contentMarkdown })} /></section>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center">
        {uploading ? <div className="surface rounded-lg border border-[var(--line)] p-5"><div className="flex justify-between font-bold"><span>{t("blueprints.uploadPage.uploading")}</span><span>{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.canClose")}</p></div> : null}
          <button className="button-primary focus-ring w-full sm:col-start-2" disabled={!blueprint || !defaultVersion.fields.name.trim() || uploading} type="button" onClick={() => void submit()}>{uploading ? t("tools.playground.uploading") : t("blueprints.upload")}</button>
        </div>
      </div>
    </div>
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

function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="grid grid-cols-[90px_1fr_44px] items-center gap-2 text-sm"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><span className="text-right tabular-nums">{Math.round(value * 100) / 100}</span></label>;
}

async function cropCoverToWebP(file: File, zoom: number, offsetX: number, offsetY: number) {
  const bitmap = await createImageBitmap(file);
  const width = 1210;
  const height = 750;
  const scale = Math.max(width / bitmap.width, height / bitmap.height) * Math.max(1, zoom);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const maxX = Math.max(0, bitmap.width - sourceWidth);
  const maxY = Math.max(0, bitmap.height - sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(bitmap, maxX * offsetX / 100, maxY * offsetY / 100, sourceWidth, sourceHeight, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("WebP conversion failed")), "image/webp", 0.86));
  return new File([blob], "cover.webp", { type: "image/webp" });
}
