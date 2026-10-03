"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlueprintBlock, StructureRendererLoadResult } from "@/lib/mcmods-exporter/renderer";
import { IndexedHttpAssetSource } from "@/lib/mcmods-exporter/renderer";
import { API_BASE_URL, backendFetch, isBearerAccessToken } from "../_lib/api";
import type { BlueprintDetailRecord, BlueprintMaterial } from "../_lib/blueprint-api";
import { useI18n } from "../_lib/i18n-provider";
import { modExportAssetURL } from "../_lib/mod-export-api";

const StructureCanvas = dynamic(
  () => import("@/components/mcmods-exporter/StructureCanvas").then((module) => module.StructureCanvas),
  { ssr: false },
);

export function BlueprintViewer({
  publicId,
  record,
  token = "",
  compact = false,
  detailHref,
  onRenderedCover,
}: {
  publicId: string;
  record: BlueprintDetailRecord;
  token?: string;
  compact?: boolean;
  detailHref?: string;
  onRenderedCover?: (cover: Blob) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [topLayer, setTopLayer] = useState(Math.max(0, record.size[1] - 1));
  const [activeLayer, setActiveLayer] = useState<number | null>(null);
  const [showBelow, setShowBelow] = useState(true);
  const [showAbove, setShowAbove] = useState(true);
  const [cullFaces, setCullFaces] = useState(true);
  const [renderStats, setRenderStats] = useState<StructureRendererLoadResult | null>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<BlueprintBlock | null>(null);

  useEffect(() => {
    const update = () => {
      const enabled = document.fullscreenElement === viewerRef.current;
      setFullscreen(enabled);
      if (!enabled) setFirstPerson(false);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const revisionByPath = useMemo(() => {
    const index = new Map<string, string>();
    for (const revision of record.assetRevisions ?? []) {
      for (const path of revision.paths) if (!index.has(path)) index.set(path, revision.id);
    }
    return index;
  }, [record.assetRevisions]);
  const assetSource = useMemo(
    () => new IndexedHttpAssetSource(revisionByPath.keys(), (path) => modExportAssetURL(revisionByPath.get(path) || "", path, true)),
    [revisionByPath],
  );
  const structureSource = useMemo(() => ({
    key: `${publicId}:${record.updatedAt}`,
    name: `${publicId}.json`,
    load: async (signal?: AbortSignal) => {
      const headers = isBearerAccessToken(token) ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await backendFetch(`${API_BASE_URL}/api/v1/blueprints/${encodeURIComponent(publicId)}/render`, {
        credentials: "include",
        headers,
        signal,
      });
      if (!response.ok) throw new Error(await readResponseError(response));
      return new Uint8Array(await response.arrayBuffer());
    },
  }), [publicId, record.updatedAt, token]);
  const selectedMaterial = useMemo(
    () => selectedBlock ? record.materials.find((item) => item.blockId === selectedBlock.state.id) : undefined,
    [record.materials, selectedBlock],
  );
  const layerMin = activeLayer ?? 0;
  const layerMax = activeLayer ?? topLayer;
  const culledPercent = renderStats?.cullableFaceInstances
    ? Math.round(renderStats.culledFaceInstances / renderStats.cullableFaceInstances * 100)
    : 0;

  async function toggleFullscreen() {
    if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
    else await viewerRef.current?.requestFullscreen();
  }

  if (!record.renderAvailable) return null;
  return (
    <section ref={viewerRef} className="relative overflow-hidden rounded-lg bg-[#0d1310] text-white">
      <StructureCanvas
        assetSource={assetSource}
        className={fullscreen ? "h-screen w-full" : compact ? "h-[min(62vh,36rem)] min-h-80 w-full" : "h-[72vh] min-h-[560px] w-full"}
        cullInvisibleFaces={cullFaces}
        firstPerson={firstPerson}
        layerMax={layerMax}
        layerMin={layerMin}
        outsideLayerMode={activeLayer === null ? "visible" : "transparent"}
        showContextAbove={showAbove}
        showContextBelow={showBelow}
        source={structureSource}
        onLoaded={(result: StructureRendererLoadResult) => {
          setTopLayer(Math.max(0, result.blueprint.size[1] - 1));
          setRenderStats(result);
        }}
        onRenderedCover={onRenderedCover}
        onSelectBlock={setSelectedBlock}
      />
      <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-12rem)] flex-wrap items-center gap-2 sm:left-4 sm:top-4">
        <ViewerButton active={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? t("blueprints.exitFullscreen") : t("blueprints.fullscreen")}</ViewerButton>
        {fullscreen ? <ViewerButton active={firstPerson} onClick={() => setFirstPerson((value) => !value)}>{t("blueprints.firstPerson")}</ViewerButton> : null}
        <ViewerButton active={cullFaces} onClick={() => setCullFaces((value) => !value)}>{t("blueprints.faceCulling")}</ViewerButton>
        {detailHref ? <Link className="focus-ring rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-black text-[var(--on-accent)]" href={detailHref}>{t("markdown.references.openBlueprint")}</Link> : null}
        {renderStats?.cullableFaceInstances ? <span className="hidden rounded-md bg-black/65 px-3 py-2 text-xs font-bold text-white backdrop-blur lg:inline">{t("blueprints.faceCullingStats", { culled: renderStats.culledFaceInstances.toLocaleString(), total: renderStats.cullableFaceInstances.toLocaleString(), percent: culledPercent })}</span> : null}
      </div>
      <LayerControl activeLayer={activeLayer} topLayer={topLayer} showAbove={showAbove} showBelow={showBelow} onLayerChange={setActiveLayer} onShowAbove={setShowAbove} onShowBelow={setShowBelow} />
      {firstPerson ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center"><span className="text-xl text-white/80">+</span><span className="absolute bottom-5 rounded bg-black/60 px-3 py-2 text-xs">WASD · Space · Ctrl · Shift</span></div> : null}
      {selectedBlock ? <BlockPopover block={selectedBlock} material={selectedMaterial} detailsURL={blueprintMaterialDetailsURL(selectedMaterial)} onClose={() => setSelectedBlock(null)} /> : null}
    </section>
  );
}

function BlockPopover({ block, material, detailsURL, onClose }: { block: BlueprintBlock; material?: BlueprintMaterial; detailsURL: string; onClose: () => void }) {
  const { t } = useI18n();
  return <aside className="absolute bottom-4 left-4 right-4 z-20 max-w-sm rounded-lg border border-white/20 bg-[#101914]/95 p-4 shadow-xl backdrop-blur-sm sm:right-auto sm:w-96"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{material?.iconPath && material.sourceRevisionId ? <Image unoptimized alt="" className="h-12 w-12 shrink-0 object-contain [image-rendering:pixelated]" height={48} width={48} src={modExportAssetURL(material.sourceRevisionId, material.iconPath)} /> : null}<div className="min-w-0"><p className="text-xs font-bold text-emerald-300">{t("blueprints.selectedBlock")}</p><h2 className="mt-1 truncate text-lg font-black text-white">{material?.name || block.state.id}</h2></div></div><button className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/20 text-xl text-white hover:bg-white/10" type="button" aria-label={t("common.close")} onClick={onClose}>×</button></div><code className="mt-3 block break-all text-xs leading-5 text-slate-300">{stateLabel(block.state.id, block.state.properties || {})}</code><p className="mt-2 text-xs text-slate-400">X {block.position[0]} · Y {block.position[1]} · Z {block.position[2]}</p>{detailsURL ? <Link className="button-primary focus-ring mt-4 inline-flex" href={detailsURL} target="_blank" rel="noopener noreferrer">{t("mods.card.details")}</Link> : null}</aside>;
}

function ViewerButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`focus-ring rounded-md px-3 py-2 text-sm font-black backdrop-blur ${active ? "bg-emerald-500 text-black" : "bg-black/65 text-white"}`} type="button" onClick={onClick}>{children}</button>;
}

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
  return <div className="absolute bottom-3 left-3 right-3 z-20 rounded-lg border border-white/15 bg-black/75 p-2 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-44 sm:p-3"><p className="hidden text-center text-xs font-bold text-emerald-300 sm:block">{t("blueprints.layer")}</p><div className="grid grid-cols-[44px_minmax(0,1fr)_44px_auto] items-center gap-2 sm:block"><button className="focus-ring rounded-md bg-white/10 py-2 text-xl disabled:opacity-30 sm:mt-2 sm:w-full" disabled={activeLayer === topLayer} type="button" onClick={() => onLayerChange(Math.min(topLayer, (activeLayer ?? -1) + 1))}>↑</button><div className="text-center text-lg font-black tabular-nums sm:my-2 sm:text-2xl">{activeLayer === null ? t("blueprints.allLayers") : activeLayer}</div><button className="focus-ring rounded-md bg-white/10 py-2 text-xl disabled:opacity-30 sm:w-full" disabled={activeLayer === 0} type="button" onClick={() => onLayerChange(Math.max(0, (activeLayer ?? topLayer + 1) - 1))}>↓</button><button className={`focus-ring rounded-md px-3 py-2 text-sm font-black sm:mt-2 sm:w-full ${activeLayer === null ? "bg-emerald-500 text-black" : "bg-white/10"}`} type="button" onClick={() => onLayerChange(null)}>{t("blueprints.allLayers")}</button></div>{activeLayer !== null ? <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs sm:mt-3 sm:grid sm:justify-stretch sm:gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={showAbove} onChange={(event) => onShowAbove(event.target.checked)} />{t("blueprints.showUpperContext")}</label><label className="flex items-center gap-2"><input type="checkbox" checked={showBelow} onChange={(event) => onShowBelow(event.target.checked)} />{t("blueprints.showLowerContext")}</label></div> : null}</div>;
}

export function blueprintMaterialDetailsURL(material?: BlueprintMaterial) {
  if (material?.detailUrl) return material.detailUrl;
  if (!material?.sourceModSiteId || !material.sourceVersionPublicId || !material.publicId) return "";
  return `/mods/${encodeURIComponent(material.sourceModSiteId)}/resources/${encodeURIComponent(material.publicId)}?version=${encodeURIComponent(material.sourceVersionPublicId)}`;
}

function stateLabel(id: string, properties: Record<string, string>) {
  const values = Object.entries(properties);
  return values.length ? `${id}[${values.map(([key, value]) => `${key}=${value}`).join(",")}]` : id;
}

async function readResponseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || `HTTP ${response.status}`;
}
