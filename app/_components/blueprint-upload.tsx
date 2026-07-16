"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { ToolsPlayground } from "./tools-playground";

const blueprintAccept = ".nbt,.schem,.schematic,.litematic";

export function BlueprintUpload() {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [blueprint, setBlueprint] = useState<File>();
  const [cover, setCover] = useState<File>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(50);
  const [offsetY, setOffsetY] = useState(50);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const coverURL = useMemo(() => cover ? URL.createObjectURL(cover) : "", [cover]);

  useEffect(() => () => { if (coverURL) URL.revokeObjectURL(coverURL); }, [coverURL]);
  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/blueprints/upload");
  }, [ready, router, user]);

  async function submit() {
    if (!blueprint || !token || !title.trim()) return;
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
        body: JSON.stringify({ title: title.trim(), description }),
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
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <label className="block"><span className="mb-2 block font-black">{t("blueprints.uploadPage.file")}</span><input className="field" type="file" accept={blueprintAccept} onChange={(event) => { const file = event.target.files?.[0]; setBlueprint(file); if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, "")); }} /></label>
        <label className="block"><span className="mb-2 block font-black">{t("blueprints.uploadPage.name")}</span><input className="field" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <section><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-black">{t("blueprints.introduction")}</h2><span className="text-sm text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded editorTitle={t("blueprints.introduction")} value={description} onChange={setDescription} /></section>
      </div>
      <aside className="space-y-6">
        <section className="surface rounded-lg border border-[var(--line)] p-5"><h2 className="font-black">{t("blueprints.uploadPage.cover")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.coverHint")}</p><input className="field mt-4" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCover(event.target.files?.[0])} />
          <div className="relative mt-4 aspect-[121/75] overflow-hidden rounded-md bg-[var(--panel-subtle)]">{coverURL ? <Image unoptimized fill alt="" className="object-cover" sizes="420px" src={coverURL} style={{ objectPosition: `${offsetX}% ${offsetY}%`, transform: `scale(${zoom})` }} /> : <div className="grid h-full place-items-center text-sm text-[var(--muted)]">121 : 75</div>}</div>
          {cover ? <div className="mt-4 grid gap-3"><Range label={t("blueprints.uploadPage.zoom")} min={1} max={3} step={0.05} value={zoom} onChange={setZoom} /><Range label={t("blueprints.uploadPage.horizontal")} min={0} max={100} value={offsetX} onChange={setOffsetX} /><Range label={t("blueprints.uploadPage.vertical")} min={0} max={100} value={offsetY} onChange={setOffsetY} /></div> : null}
        </section>
        {uploading ? <div className="surface rounded-lg border border-[var(--line)] p-5"><div className="flex justify-between font-bold"><span>{t("blueprints.uploadPage.uploading")}</span><span>{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm text-[var(--muted)]">{t("blueprints.uploadPage.canClose")}</p></div> : null}
        <button className="button-primary focus-ring w-full" disabled={!blueprint || !title.trim() || uploading} type="button" onClick={() => void submit()}>{uploading ? t("tools.playground.uploading") : t("blueprints.upload")}</button>
      </aside>
    </div>
  </main>;
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
