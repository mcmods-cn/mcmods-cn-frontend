"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlueprintBlock, StructureRendererLoadResult } from "@/lib/mcmods-exporter/renderer";
import { IndexedHttpAssetSource } from "@/lib/mcmods-exporter/renderer";
import { API_BASE_URL, ApiError, apiRequest } from "../_lib/api";
import type { BlueprintDetailRecord, BlueprintMaterial } from "../_lib/blueprint-api";
import { useAuthSnapshot } from "../_lib/auth";
import { loadFavoriteMembership } from "../_lib/favorite-api";
import { useI18n } from "../_lib/i18n-provider";
import { loadOwnedResolvedContent, loadResolvedContent } from "../_lib/editor-api";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { minecraftLocale, modExportAssetURL } from "../_lib/mod-export-api";
import { formatBytes, uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { MarkdownRenderer } from "./markdown-renderer";
import { BlueprintRequiredMods, statusText } from "./blueprint-library";
import { FavoritePickerModal } from "./favorite-picker-modal";
import { CommentSection } from "./comment-section";

const StructureCanvas = dynamic(() => import("@/components/mcmods-exporter/StructureCanvas").then((module) => module.StructureCanvas), { ssr: false });

export function BlueprintDetail({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState<BlueprintDetailRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [topLayer, setTopLayer] = useState(0);
  const [activeLayer, setActiveLayer] = useState<number | null>(null);
  const [showBelow, setShowBelow] = useState(true);
  const [showAbove, setShowAbove] = useState(true);
  const [cullFaces, setCullFaces] = useState(true);
  const [renderStats, setRenderStats] = useState<StructureRendererLoadResult | null>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<BlueprintBlock | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const coverUploadRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ locale: minecraftLocale(locale) });
      const result = await apiRequest<BlueprintDetailRecord>(`/api/v1/blueprints/${encodeURIComponent(publicId)}?${params}`, {}, token);
      const content = result.canEdit && token
        ? await loadOwnedResolvedContent("blueprints", publicId, locale, token, "en-US").catch(() => undefined)
        : await loadResolvedContent(publicId, locale, "en-US", token).catch(() => undefined);
      const fields = content?.localization?.fields;
      setRecord(fields ? { ...result, title: fields.name || result.title, description: fields.contentMarkdown || result.description } : result);
      setNotFound(false);
      setTopLayer(Math.max(0, result.size[1] - 1));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setNotFound(true);
      else notifySite(cleanError(error), t("blueprints.title"), "danger");
    }
  }, [locale, publicId, t, token]);

  useEffect(() => { if (ready) queueMicrotask(() => void load()); }, [load, ready]);
  useEffect(() => {
    if (!record || !["uploading", "queued", "processing"].includes(record.status)) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load, record]);
  useEffect(() => {
    const update = () => {
      const enabled = document.fullscreenElement === viewerRef.current;
      setFullscreen(enabled);
      if (!enabled) setFirstPerson(false);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadFavoriteMembership(token, "blueprint", publicId)
      .then((ids) => { if (!cancelled) setFavorited(ids.length > 0); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [publicId, token]);

  const revisionByPath = useMemo(() => {
    const index = new Map<string, string>();
    for (const revision of record?.assetRevisions ?? []) for (const path of revision.paths) if (!index.has(path)) index.set(path, revision.id);
    return index;
  }, [record?.assetRevisions]);
  const assetSource = useMemo(() => new IndexedHttpAssetSource(revisionByPath.keys(), (path) => modExportAssetURL(revisionByPath.get(path) || "", path, true)), [revisionByPath]);
  const structureSource = useMemo(() => ({
    key: `${publicId}:${record?.updatedAt ?? "pending"}`,
    name: `${publicId}.json`,
    load: async () => {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await fetch(`${API_BASE_URL}/api/v1/blueprints/${encodeURIComponent(publicId)}/render`, { headers });
      if (!response.ok) throw new Error(await readResponseError(response));
      return new Uint8Array(await response.arrayBuffer());
    },
  }), [publicId, record?.updatedAt, token]);
  const selectedMaterial = useMemo(() => selectedBlock && record ? record.materials.find((item) => item.blockId === selectedBlock.state.id) : undefined, [record, selectedBlock]);
  const availableFormats = useMemo(() => new Set(record?.variants.filter((item) => item.status === "ready").map((item) => normalizeBlueprintFormat(item.format)) ?? []), [record?.variants]);

  async function convert(format: "nbt" | "schem" | "litematic") {
    if (!token || availableFormats.has(format)) return;
    try {
      await apiRequest(`/api/v1/blueprints/${encodeURIComponent(publicId)}/convert`, { method: "POST", body: JSON.stringify({ format }) }, token);
      notifySite(t("blueprints.conversionQueuedNotice"), t("blueprints.title"), "success");
      await load();
    } catch (error) { notifySite(cleanError(error), t("blueprints.title"), "danger"); }
  }

  async function retry() {
    if (!token) return;
    try { await apiRequest(`/api/v1/blueprints/${encodeURIComponent(publicId)}/retry`, { method: "POST" }, token); await load(); }
    catch (error) { notifySite(cleanError(error), t("blueprints.title"), "danger"); }
  }

  async function download(variantId: number) {
    try {
      const result = await apiRequest<{ url: string }>(`/api/v1/blueprints/${encodeURIComponent(publicId)}/variants/${variantId}/download`, { method: "POST" }, token);
      window.location.assign(result.url);
    } catch (error) { notifySite(cleanError(error), t("blueprints.title"), "danger"); }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
    else await viewerRef.current?.requestFullscreen();
  }

  async function saveRenderedCover(cover: Blob) {
    if (!token || !record?.canEdit || !record.coverGenerated || coverUploadRef.current) return;
    coverUploadRef.current = true;
    try {
      const file = new File([cover], `${publicId}-rendered-cover.webp`, { type: "image/webp" });
      await uploadUserFileToOSS(file, token, `blueprint_cover:${publicId}`);
      setRecord((current) => current ? { ...current, coverGenerated: false } : current);
    } catch {
      // The lightweight generated cover remains available when a browser-side refresh fails.
    } finally {
      coverUploadRef.current = false;
    }
  }

  function exportMaterialsCSV() {
    if (!record) return;
    const rows = [[t("blueprints.materialName"), t("blueprints.materialId"), t("blueprints.materialCount")], ...record.materials.map((item) => [item.name || item.blockId, item.blockId, String(item.count)])];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.id}-materials.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (notFound) return <main className="grid min-h-[65vh] place-items-center px-4 text-center"><div><h1 className="text-3xl font-black">{t("blueprints.notFound")}</h1><Link className="button-primary focus-ring mt-6 inline-flex" href="/blueprints">{t("blueprints.title")}</Link></div></main>;
  if (!record) return <main className="grid min-h-[65vh] place-items-center text-[var(--muted)]">{t("common.loading")}</main>;
  const processing = ["uploading", "queued", "processing"].includes(record.status);
  const visibleMaterials = record.materials.slice(0, 12);
  const layerMin = activeLayer ?? 0;
  const layerMax = activeLayer ?? topLayer;
  const culledPercent = renderStats?.cullableFaceInstances
    ? Math.round(renderStats.culledFaceInstances / renderStats.cullableFaceInstances * 100)
    : 0;

  return <main className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel)]"><div className="mx-auto max-w-7xl px-4 py-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><Link className="text-sm font-bold text-[var(--accent)]" href="/blueprints">{t("blueprints.title")}</Link><h1 className="mt-2 text-3xl font-black">{record.title}</h1><div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]"><code>{record.id}</code><span>{record.sourceFormat.toUpperCase()}</span><span className="font-bold text-[var(--accent)]">{statusText(t, record.status)}</span></div></div><div className="flex flex-wrap gap-2">{token ? <button className="button-secondary focus-ring" aria-pressed={favorited} type="button" onClick={() => setFavoriteOpen(true)}>{t(favorited ? "mods.card.favorited" : "mods.card.favorite")}</button> : null}{record.canEdit ? <Link className="button-secondary focus-ring" href={`/blueprints/${publicId}/edit`} target="_blank" rel="noopener noreferrer">{t("blueprints.edit")} ↗</Link> : null}</div></div><dl className="mt-6 grid gap-4 sm:grid-cols-3"><Metric label={t("blueprints.dimensions")} value={record.size.join(" × ")} /><Metric label={t("blueprints.blocks")} value={record.blockCount.toLocaleString()} /><Metric label={t("blueprints.uploader")} value={record.uploader.displayName || record.uploader.username} /></dl><BlueprintRequiredMods mods={record.requiredMods} /></div></header>
    {processing ? <section className="mx-auto max-w-7xl px-4 py-8"><div className="surface rounded-lg border border-[var(--line)] p-6"><p className="font-bold">{t("blueprints.processing")}</p><div className="mt-4 h-1 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full w-2/5 animate-pulse bg-[var(--accent)]" /></div></div></section> : null}
    {record.status === "failed" ? <section className="mx-auto max-w-7xl px-4 py-8"><div className="rounded-lg border border-[var(--red)] p-6"><h2 className="text-xl font-black text-[var(--red)]">{t("blueprints.failed")}</h2><p className="mt-2 text-sm text-[var(--muted)]">{record.lastError}</p>{record.canEdit ? <button className="button-primary focus-ring mt-4" type="button" onClick={() => void retry()}>{t("blueprints.retry")}</button> : null}</div></section> : null}

    {record.renderAvailable ? <section ref={viewerRef} className="relative bg-[#0d1310] text-white">
      <StructureCanvas className={fullscreen ? "h-screen w-full" : "h-[72vh] min-h-[560px] w-full"} assetSource={assetSource} source={structureSource} layerMin={layerMin} layerMax={layerMax} outsideLayerMode={activeLayer === null ? "visible" : "transparent"} showContextBelow={showBelow} showContextAbove={showAbove} firstPerson={firstPerson} cullInvisibleFaces={cullFaces} onLoaded={(result: StructureRendererLoadResult) => { setTopLayer(Math.max(0, result.blueprint.size[1] - 1)); setRenderStats(result); }} onRenderedCover={record.canEdit && record.coverGenerated ? saveRenderedCover : undefined} onSelectBlock={setSelectedBlock} />
      <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2"><ViewerButton active={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? t("blueprints.exitFullscreen") : t("blueprints.fullscreen")}</ViewerButton>{fullscreen ? <ViewerButton active={firstPerson} onClick={() => setFirstPerson((value) => !value)}>{t("blueprints.firstPerson")}</ViewerButton> : null}<ViewerButton active={cullFaces} onClick={() => setCullFaces((value) => !value)}>{t("blueprints.faceCulling")}</ViewerButton>{renderStats?.cullableFaceInstances ? <span className="rounded-md bg-black/65 px-3 py-2 text-xs font-bold text-white backdrop-blur">{t("blueprints.faceCullingStats", { culled: renderStats.culledFaceInstances.toLocaleString(), total: renderStats.cullableFaceInstances.toLocaleString(), percent: culledPercent })}</span> : null}</div>
      <LayerControl activeLayer={activeLayer} topLayer={topLayer} showAbove={showAbove} showBelow={showBelow} onLayerChange={setActiveLayer} onShowAbove={setShowAbove} onShowBelow={setShowBelow} />
      {firstPerson ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center"><span className="text-xl text-white/80">+</span><span className="absolute bottom-5 rounded bg-black/60 px-3 py-2 text-xs">WASD · Space · Ctrl · Shift</span></div> : null}
      {selectedBlock ? <BlockPopover block={selectedBlock} material={selectedMaterial} detailsURL={materialDetailsURL(selectedMaterial)} onClose={() => setSelectedBlock(null)} /> : null}
    </section> : null}

    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0"><section><h2 className="text-2xl font-black">{t("blueprints.introduction")}</h2><div className="mt-4 border-t border-[var(--line)] pt-5"><MarkdownRenderer markdown={record.description} config={defaultMarkdownConfig} emptyText={t("blueprints.noIntroduction")} /></div></section><section className="mt-10"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">{t("blueprints.materials")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("blueprints.materialKinds", { count: record.materials.length })}</p></div><button className="button-secondary focus-ring" type="button" onClick={exportMaterialsCSV}>{t("blueprints.exportCSV")}</button></div><MaterialList items={visibleMaterials} />{record.materials.length > visibleMaterials.length ? <button className="button-secondary focus-ring mt-4 w-full" type="button" onClick={() => setMaterialsOpen(true)}>{t("blueprints.showAllMaterials", { count: record.materials.length })}</button> : null}</section></div>
      <aside className="space-y-8">
        <section>
          <h2 className="text-xl font-black">{t("blueprints.downloadFormats")}</h2>
          <div className="mt-3 grid gap-2">{record.variants.map((variant) => <div key={variant.id} className="surface rounded-lg border border-[var(--line)] p-4"><div className="flex items-start justify-between gap-2"><strong className="uppercase">{variant.format}</strong><div className="flex gap-1">{variant.original ? <Badge>{t("blueprints.original")}</Badge> : null}{variant.recommended ? <Badge>{t("blueprints.recommended")}</Badge> : null}</div></div><p className="mt-2 truncate text-xs text-[var(--muted)]">{variant.originalName} · {formatBytes(variant.sizeBytes)}</p>{variant.status === "ready" ? <button className="button-secondary focus-ring mt-3 w-full" type="button" onClick={() => void download(variant.id)}>{t("blueprints.download")}</button> : null}</div>)}</div>
          {token ? <div className="mt-3 grid gap-2">
            {!availableFormats.has("nbt") ? <button className="button-secondary focus-ring" type="button" onClick={() => void convert("nbt")}>{t("blueprints.convertTo", { format: "NBT" })}</button> : null}
            {!availableFormats.has("schem") ? <button className="button-secondary focus-ring" type="button" onClick={() => void convert("schem")}>{t("blueprints.convertTo", { format: "SCHEM" })}</button> : null}
            {!availableFormats.has("litematic") ? <button className="button-secondary focus-ring" type="button" onClick={() => void convert("litematic")}>{t("blueprints.convertTo", { format: "LITEMATIC" })}</button> : null}
          </div> : null}
        </section>
        <section><h2 className="text-xl font-black">{t("blueprints.uploader")}</h2><Link className="mt-3 block border-y border-[var(--line)] py-4 font-bold text-[var(--accent)]" href={`/user/${record.uploader.id}`}>{record.uploader.displayName || record.uploader.username}<span className="mt-1 block text-xs font-normal text-[var(--muted)]">{t("blueprints.viewUploader")}</span></Link></section>
      </aside></div>
    <div className="mx-auto max-w-7xl px-4 pb-10"><CommentSection targetKey={publicId} targetType="blueprint" /></div>

    {materialsOpen ? <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true"><section className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-[var(--panel)] shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4"><div><h2 className="text-xl font-black">{t("blueprints.materials")}</h2><p className="text-sm text-[var(--muted)]">{t("blueprints.materialKinds", { count: record.materials.length })}</p></div><button className="button-secondary focus-ring" type="button" onClick={() => setMaterialsOpen(false)}>{t("common.close")}</button></header><div className="min-h-0 overflow-y-auto p-4"><MaterialList items={record.materials} /></div></section></div> : null}
    {favoriteOpen && token ? <FavoritePickerModal entityType="blueprint" entityKey={publicId} title={record.title} token={token} onClose={() => setFavoriteOpen(false)} onSaved={(selected) => { setFavorited(selected); setFavoriteOpen(false); notifySite(t(selected ? "mods.notices.favorited" : "mods.notices.unfavorited"), t("blueprints.title"), "success"); }} /> : null}
  </main>;
}

function MaterialList({ items }: { items: BlueprintMaterial[] }) {
  return <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">{items.map((material) => <div key={material.state} className="flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-center gap-3">{material.iconPath && material.sourceRevisionId ? <Image unoptimized alt="" className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" height={40} width={40} src={modExportAssetURL(material.sourceRevisionId, material.iconPath)} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-xs font-black">BL</span>}<div className="min-w-0"><Link className="truncate font-bold hover:text-[var(--accent)]" href={materialDetailsURL(material) || "#"}>{material.name || material.blockId}</Link><p className="mt-1 truncate font-mono text-xs text-[var(--muted)]">{material.blockId}</p></div></div><strong className="shrink-0 tabular-nums">× {material.count.toLocaleString()}</strong></div>)}</div>;
}

function BlockPopover({ block, material, detailsURL, onClose }: { block: BlueprintBlock; material?: BlueprintMaterial; detailsURL: string; onClose: () => void }) {
  const { t } = useI18n();
  return <aside className="absolute bottom-4 left-4 right-4 z-20 max-w-sm rounded-lg border border-white/20 bg-[#101914]/95 p-4 shadow-xl backdrop-blur-sm sm:right-auto sm:w-96"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{material?.iconPath && material.sourceRevisionId ? <Image unoptimized alt="" className="h-12 w-12 shrink-0 object-contain [image-rendering:pixelated]" height={48} width={48} src={modExportAssetURL(material.sourceRevisionId, material.iconPath)} /> : null}<div className="min-w-0"><p className="text-xs font-bold text-emerald-300">{t("blueprints.selectedBlock")}</p><h2 className="mt-1 truncate text-lg font-black text-white">{material?.name || block.state.id}</h2></div></div><button className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/20 text-xl text-white hover:bg-white/10" type="button" aria-label={t("common.close")} onClick={onClose}>×</button></div><code className="mt-3 block break-all text-xs leading-5 text-slate-300">{stateLabel(block.state.id, block.state.properties || {})}</code><p className="mt-2 text-xs text-slate-400">X {block.position[0]} · Y {block.position[1]} · Z {block.position[2]}</p>{detailsURL ? <Link className="button-primary focus-ring mt-4 inline-flex" href={detailsURL} target="_blank" rel="noopener noreferrer">{t("mods.card.details")}</Link> : null}</aside>;
}

function ViewerButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button className={`focus-ring rounded-md px-3 py-2 text-sm font-black backdrop-blur ${active ? "bg-emerald-500 text-black" : "bg-black/65 text-white"}`} type="button" onClick={onClick}>{children}</button>; }

function LayerControl({ activeLayer, topLayer, showAbove, showBelow, onLayerChange, onShowAbove, onShowBelow }: {
  activeLayer: number | null;
  topLayer: number;
  showAbove: boolean;
  showBelow: boolean;
  onLayerChange: (layer: number | null) => void;
  onShowAbove: (visible: boolean) => void;
  onShowBelow: (visible: boolean) => void;
}) {
  const { t } = useI18n();
  return <div className="absolute bottom-4 left-4 right-4 z-20 rounded-lg border border-white/15 bg-black/75 p-2 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-44 sm:p-3">
    <p className="hidden text-center text-xs font-bold text-emerald-300 sm:block">{t("blueprints.layer")}</p>
    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px_auto] items-center gap-2 sm:block">
      <button className="focus-ring rounded-md bg-white/10 py-2 text-xl disabled:opacity-30 sm:mt-2 sm:w-full" disabled={activeLayer === topLayer} type="button" onClick={() => onLayerChange(Math.min(topLayer, (activeLayer ?? -1) + 1))}>↑</button>
      <div className="text-center text-lg font-black tabular-nums sm:my-2 sm:text-2xl">{activeLayer === null ? t("blueprints.allLayers") : activeLayer}</div>
      <button className="focus-ring rounded-md bg-white/10 py-2 text-xl disabled:opacity-30 sm:w-full" disabled={activeLayer === 0} type="button" onClick={() => onLayerChange(Math.max(0, (activeLayer ?? topLayer + 1) - 1))}>↓</button>
      <button className={`focus-ring rounded-md px-3 py-2 text-sm font-black sm:mt-2 sm:w-full ${activeLayer === null ? "bg-emerald-500 text-black" : "bg-white/10"}`} type="button" onClick={() => onLayerChange(null)}>{t("blueprints.allLayers")}</button>
    </div>
    {activeLayer !== null ? <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs sm:mt-3 sm:grid sm:justify-stretch sm:gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={showAbove} onChange={(event) => onShowAbove(event.target.checked)} />{t("blueprints.showUpperContext")}</label><label className="flex items-center gap-2"><input type="checkbox" checked={showBelow} onChange={(event) => onShowBelow(event.target.checked)} />{t("blueprints.showLowerContext")}</label></div> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="mt-1 text-lg font-black">{value}</dd></div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-black text-[var(--accent)]">{children}</span>; }
function materialDetailsURL(material?: BlueprintMaterial) { if (!material?.sourceModSiteId || !material.sourceRevisionId) return ""; const query = new URLSearchParams({ registry: "blocks", objectId: material.blockId }); if (material.entityId) query.set("entityId", material.entityId); return `/mods/${encodeURIComponent(material.sourceModSiteId)}/data/${encodeURIComponent(material.sourceRevisionId)}/itemsBlocks/entry?${query}`; }
function normalizeBlueprintFormat(value: string) { const normalized = value.toLowerCase().replace(/^\./, ""); return normalized === "schematic" ? "schem" : normalized; }
function stateLabel(id: string, properties: Record<string, string>) { const values = Object.entries(properties); return values.length ? `${id}[${values.map(([key, value]) => `${key}=${value}`).join(",")}]` : id; }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function cleanError(error: unknown) { return error instanceof Error ? error.message : String(error); }
async function readResponseError(response: Response) { const body = await response.json().catch(() => ({})) as { error?: string }; return body.error || `HTTP ${response.status}`; }
