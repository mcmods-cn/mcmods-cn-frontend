"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { createSkin, SkinKind, SkinModel, SkinVisibility } from "../_lib/skin-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { SkinPreview2D } from "./skin-preview";

export function SkinUpload() {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [file, setFile] = useState<File>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SkinKind>("skin");
  const [model, setModel] = useState<SkinModel>("default");
  const [visibility, setVisibility] = useState<SkinVisibility>("public");
  const [tags, setTags] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const previewURL = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => () => { if (previewURL) URL.revokeObjectURL(previewURL); }, [previewURL]);
  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/skins/upload");
  }, [ready, router, user]);

  async function chooseFile(nextFile?: File) {
    setError("");
    setDimensions("");
    if (!nextFile) { setFile(undefined); return; }
    try {
      const size = await validateTexture(nextFile, kind, t);
      setFile(nextFile);
      setDimensions(`${size.width} × ${size.height}`);
      if (!name.trim()) setName(nextFile.name.replace(/\.png$/i, ""));
    } catch (reason) {
      setFile(undefined);
      setError(reason instanceof Error ? reason.message : t("skins.invalidPng"));
    }
  }

  async function submit() {
    if (!file || !token || !name.trim()) return;
    setUploading(true);
    setError("");
    try {
      await validateTexture(file, kind, t);
      const uploaded = await uploadUserFileToOSS(file, token, kind === "skin" ? "minecraft_skin" : "minecraft_cape");
      if (!uploaded.id) throw new Error(t("skins.uploadFailed"));
      const created = await createSkin({
        fileId: uploaded.id,
        name: name.trim(),
        description,
        kind,
        model: kind === "skin" ? model : "default",
        visibility,
        tags: parseTags(tags),
      }, token);
      notifySite(t("skins.uploadSubmitted"), created.name, "success");
      router.push(`/skins/${created.publicId}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("skins.uploadFailed");
      setError(message);
      notifySite(message, t("skins.uploadTitle"), "danger");
    } finally {
      setUploading(false);
    }
  }

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
        <section className="surface grid gap-5 rounded-lg p-5">
          <label className="block text-sm font-black">{t("skins.textureFile")}
            <input className="field mt-2" accept="image/png,.png" disabled={uploading} type="file" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; void chooseFile(selected); }} />
            <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">{t("skins.textureHint")}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black">{t("skins.kind")}<select className="field mt-2" value={kind} onChange={(event) => { const next = event.target.value as SkinKind; setKind(next); if (file) void validateTexture(file, next, t).then((size) => setDimensions(`${size.width} × ${size.height}`)).catch((reason: unknown) => { setFile(undefined); setError(reason instanceof Error ? reason.message : t("skins.invalidPng")); }); }}><option value="skin">{t("skins.kindSkin")}</option><option value="cape">{t("skins.kindCape")}</option></select></label>
            <label className="text-sm font-black">{t("skins.model")}<select className="field mt-2" disabled={kind === "cape"} value={model} onChange={(event) => setModel(event.target.value as SkinModel)}><option value="default">{t("skins.modelDefault")}</option><option value="slim">{t("skins.modelSlim")}</option></select></label>
          </div>
          <label className="text-sm font-black">{t("skins.name")}<input className="field mt-2" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="text-sm font-black">{t("skins.description")}<textarea className="field mt-2 min-h-32 resize-y" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="text-sm font-black">{t("skins.tags")}<input className="field mt-2" value={tags} placeholder={t("skins.tagInput")} onChange={(event) => setTags(event.target.value)} /><span className="mt-2 block text-xs font-normal text-[var(--muted)]">{t("skins.tagHint")}</span></label>
          <label className="text-sm font-black">{t("skins.visibility")}<select className="field mt-2" value={visibility} onChange={(event) => setVisibility(event.target.value as SkinVisibility)}><option value="public">{t("skins.visibilityPublic")}</option><option value="unlisted">{t("skins.visibilityUnlisted")}</option><option value="private">{t("skins.visibilityPrivate")}</option></select></label>
          {error ? <p className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
          <button className="button-primary focus-ring" disabled={!file || !name.trim() || uploading} type="button" onClick={() => void submit()}>{uploading ? t("skins.uploading") : t("skins.submit")}</button>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="surface overflow-hidden rounded-lg">
            <SkinPreview2D className="h-[430px] w-full p-8" kind={kind} label={name} model={model} src={previewURL} />
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
