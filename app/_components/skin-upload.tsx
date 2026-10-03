"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { createEmptyLocalizedContent, ensureLocalizedContent, updateLocalizedContent } from "../_lib/content-language";
import { supportedLocales, useI18n, type Locale } from "../_lib/i18n-provider";
import type { LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import { createSkin, SkinKind, SkinModel, SkinVisibility } from "../_lib/skin-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { SkinPreview2D } from "./skin-preview";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

export function SkinUpload() {
  const { token, user } = useAuthSnapshot();
  return <SkinUploadContent key={`${user?.id || "guest"}:${token}`} />;
}

function SkinUploadContent() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [file, setFile] = useState<File>();
  const initialLocale = locale as Locale;
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [localizations, setLocalizations] = useState<LocalizationVersion<LocalizedContentFields>[]>(() => [createEmptyLocalizedContent(initialLocale)]);
  const [kind, setKind] = useState<SkinKind>("skin");
  const [model, setModel] = useState<SkinModel>("default");
  const [visibility, setVisibility] = useState<SkinVisibility>("public");
  const [tags, setTags] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const submitInFlight = useRef(false);
  const [previewURL, setPreviewURL] = useState("");
  const validationGeneration = useRef(0);
  const candidateFile = useRef<File | undefined>(undefined);
  const uploadedFile = useRef<{ file: File; kind: SkinKind; id: string } | null>(null);
  const selected = localizations.find((item) => item.locale === selectedLocale) ?? createEmptyLocalizedContent(selectedLocale);
  const defaultVersion = localizations.find((item) => item.locale === defaultLocale) ?? createEmptyLocalizedContent(defaultLocale);

  useEffect(() => {
    let active = true;
    const url = file ? URL.createObjectURL(file) : "";
    queueMicrotask(() => { if (active) setPreviewURL(url); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  const cancelValidation = useCallback(() => { validationGeneration.current++; }, []);
  useEffect(() => cancelValidation, [cancelValidation]);

  async function chooseFile(nextFile?: File, nextKind = kind) {
    const generation = ++validationGeneration.current;
    candidateFile.current = nextFile;
    setError("");
    setDimensions("");
    setFile(undefined);
    if (!nextFile) return;
    try {
      const size = await validateTexture(nextFile, nextKind, t);
      if (generation !== validationGeneration.current) return;
      setFile(nextFile);
      setDimensions(`${size.width} × ${size.height}`);
      if (!selected.fields.name.trim()) setLocalizations((items) => updateLocalizedContent(items, selectedLocale, { name: nextFile.name.replace(/\.png$/i, "") }));
    } catch (reason) {
      if (generation !== validationGeneration.current) return;
      setFile(undefined);
      setError(reason instanceof Error ? reason.message : t("skins.invalidPng"));
    }
  }

  async function submit() {
    if (!file || !token || submitInFlight.current || uploading || !defaultVersion.fields.name.trim()) return;
    submitInFlight.current = true;
    setUploading(true);
    setError("");
    try {
      await validateTexture(file, kind, t);
      let fileId = uploadedFile.current?.file === file && uploadedFile.current.kind === kind ? uploadedFile.current.id : undefined;
      if (!fileId) {
        const uploaded = await uploadUserFileToOSS(file, token, kind === "skin" ? "minecraft_skin" : "minecraft_cape");
        if (!uploaded.id) throw new Error(t("skins.uploadFailed"));
        fileId = uploaded.id;
        uploadedFile.current = { file, kind, id: fileId };
      }
      const created = await createSkin({
        fileId,
        name: defaultVersion.fields.name.trim(),
        description: defaultVersion.fields.summary,
        kind,
        model: kind === "skin" ? model : "default",
        visibility,
        tags: parseTags(tags),
        defaultLocale,
        localizations: localizations.filter((item) => item.fields.name.trim()).map((item) => ({
          locale: item.locale,
          name: item.fields.name.trim(),
          summary: item.fields.summary,
          contentMarkdown: item.fields.contentMarkdown,
        })),
      }, token);
      notifySite(t("skins.uploadSubmitted"), created.name, "success");
      router.push(`/skins/${created.publicId}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("skins.uploadFailed");
      setError(message);
      notifySite(message, t("skins.uploadTitle"), "danger");
    } finally {
      submitInFlight.current = false;
      setUploading(false);
    }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath="/skins/upload" />;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-6xl px-4 py-7">
          <Link className="text-sm font-black text-[var(--accent)]" href="/skins">← {t("skins.title")}</Link>
          <h1 className="mt-2 text-3xl font-black">{t("skins.uploadTitle")}</h1>
          <p className="mt-2 max-w-3xl text-[var(--muted)]">{t("skins.uploadSubtitle")}</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <fieldset disabled={uploading} className="surface grid min-w-0 gap-5 rounded-lg p-5">
          <ContentLanguageSwitcher value={selectedLocale} versions={localizations} onChange={setSelectedLocale} />
          <label className="text-sm font-black">{t("mods.submission.defaultLocale")}<select className="field mt-2" value={defaultLocale} onChange={(event) => { const next = event.target.value as Locale; setDefaultLocale(next); setLocalizations((items) => ensureLocalizedContent(items, next)); }}>
            {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select></label>
          <label className="block text-sm font-black">{t("skins.textureFile")}
            <input className="field mt-2" accept="image/png,.png" disabled={uploading} type="file" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; void chooseFile(selected); }} />
            <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">{t("skins.textureHint")}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black">{t("skins.kind")}<select className="field mt-2" disabled={uploading} value={kind} onChange={(event) => { const next = event.target.value as SkinKind; setKind(next); void chooseFile(candidateFile.current, next); }}><option value="skin">{t("skins.kindSkin")}</option><option value="cape">{t("skins.kindCape")}</option></select></label>
            <label className="text-sm font-black">{t("skins.model")}<select className="field mt-2" disabled={kind === "cape"} value={model} onChange={(event) => setModel(event.target.value as SkinModel)}><option value="default">{t("skins.modelDefault")}</option><option value="slim">{t("skins.modelSlim")}</option></select></label>
          </div>
          <label className="text-sm font-black">{t("skins.name")} ({selectedLocale})<input className="field mt-2" maxLength={80} value={selected.fields.name} onChange={(event) => setLocalizations((items) => updateLocalizedContent(items, selectedLocale, { name: event.target.value }))} /></label>
          <label className="text-sm font-black">{t("skins.description")} ({selectedLocale})<textarea className="field mt-2 min-h-32 resize-y" maxLength={1000} value={selected.fields.summary} onChange={(event) => setLocalizations((items) => updateLocalizedContent(items, selectedLocale, { summary: event.target.value }))} /></label>
          <label className="text-sm font-black">{t("skins.tags")}<input className="field mt-2" value={tags} placeholder={t("skins.tagInput")} onChange={(event) => setTags(event.target.value)} /><span className="mt-2 block text-xs font-normal text-[var(--muted)]">{t("skins.tagHint")}</span></label>
          <label className="text-sm font-black">{t("skins.visibility")}<select className="field mt-2" value={visibility} onChange={(event) => setVisibility(event.target.value as SkinVisibility)}><option value="public">{t("skins.visibilityPublic")}</option><option value="unlisted">{t("skins.visibilityUnlisted")}</option><option value="private">{t("skins.visibilityPrivate")}</option></select></label>
          {error ? <p className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
          <button className="button-primary focus-ring" disabled={!file || !defaultVersion.fields.name.trim() || uploading} type="button" onClick={() => void submit()}>{uploading ? t("skins.uploading") : t("skins.submit")}</button>
        </fieldset>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="surface overflow-hidden rounded-lg">
            <SkinPreview2D className="h-[430px] w-full p-8" kind={kind} label={selected.fields.name} model={model} src={previewURL} />
            <div className="border-t border-[var(--line)] p-4">
              <h2 className="font-black">{t("skins.preview2D")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{dimensions || t("skins.noFileSelected")}</p>
            </div>
          </section>
          <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-sm leading-6 text-[var(--muted)]">{t("skins.reviewHint")}</section>
        </aside>
      </div>
    </main>
  );
}

async function validateTexture(file: File, kind: SkinKind, t: (key: string) => string) {
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new Error(t("skins.invalidPng"));
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => header[index] === value)) throw new Error(t("skins.invalidPng"));
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (kind === "skin" && !(sameScale(size, 64, 64) || sameScale(size, 64, 32))) throw new Error(t("skins.invalidSkinSize"));
  if (kind === "cape" && !(sameScale(size, 64, 32) || sameScale(size, 22, 17))) throw new Error(t("skins.invalidCapeSize"));
  return size;
}

function sameScale(size: { width: number; height: number }, baseWidth: number, baseHeight: number) {
  if (size.width % baseWidth !== 0 || size.height % baseHeight !== 0) return false;
  const widthScale = size.width / baseWidth;
  return widthScale > 0 && widthScale === size.height / baseHeight;
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，\n]/).map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 16);
}
