"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { isBearerAccessToken } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import type { CatalogResourceVersion } from "../_lib/editor-types";
import {
  loadModContentResource,
  modContentResourceAssetURL,
  type ModContentLocalization,
  type ModContentResource,
} from "../_lib/mod-content-api";
import {
  getModExportEntryDetail,
  minecraftLocale,
  modExportAssetURL,
  type ModExportEntryDetail,
} from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { IndexedHttpAssetSource } from "@/lib/mcmods-exporter/renderer";
import { MarkdownRenderer } from "./markdown-renderer";
import { CommentSection } from "./comment-section";
import { ModLootTableView, ModRecipeGallery, ModResourceProperties } from "./mod-resource-components";

const BlockModelCanvas = dynamic(() => import("@/components/mcmods-exporter/BlockModelCanvas").then((module) => module.BlockModelCanvas), { ssr: false });

export function ModContentResourceDetail({ siteId, resourceId, versionId, sectionId }: { siteId: string; resourceId: string; versionId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [detail, setDetail] = useState<ModContentResource>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadModContentResource(siteId, resourceId, token)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [resourceId, siteId, token]);

  if (!detail) return <main className="grid min-h-[65vh] place-items-center p-6">{error || t("common.loading")}</main>;

  const requestedIndex = detail.versions.findIndex((item) => item.publicId === versionId);
  const firstDetailedIndex = detail.versions.findIndex((item) => item.hasDetail);
  const currentIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, firstDetailedIndex);
  const current = detail.versions[currentIndex];
  const versionDetail = detail.details.find((item) => item.versionPublicId === current?.publicId);
  const localization = resolveVersionLocalization(versionDetail?.localizations || [], locale, versionDetail?.defaultLocale || "en-US");

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-5">
      <Link className="font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black">{localization?.name || detail.canonicalId}</h1><code className="mt-1 block text-sm text-[var(--muted)]">{detail.canonicalId}</code></div>{token && versionDetail && current ? <Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}/edit?version=${encodeURIComponent(current.publicId)}&section=${encodeURIComponent(sectionId)}`}>{t("common.edit")}</Link> : null}</div>
      <div className="mt-4 flex gap-1 overflow-x-auto">{detail.versions.map((version, index) => {
        const href = version.detailUrl || `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(version.publicId)}`;
        return <Link className={`focus-ring shrink-0 rounded px-2 py-1 text-xs font-black ${index === currentIndex ? "bg-[var(--accent)] text-white" : version.hasDetail ? "bg-[var(--panel-subtle)]" : "border border-[var(--red)] text-[var(--red)]"}`} href={href} key={version.publicId}>{version.label}</Link>;
      })}</div>
    </header>
    {!current || !versionDetail ? <section className="mt-8 rounded-lg border border-dashed border-[var(--red)] bg-[var(--panel)] p-8 text-center"><h2 className="text-xl font-black">{current?.label}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionContentMissing")}</p></section> : <ResourcePresentation canonicalId={detail.canonicalId} current={current} definition={versionDetail.definition} key={current.publicId} kindCode={detail.kindCode} name={localization?.name || detail.canonicalId} resourceId={resourceId}>
      {localization?.summary ? <p className="leading-7 text-[var(--muted)]">{localization.summary}</p> : null}
      {localization?.contentMarkdown ? <div className="markdown-preview mt-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.contentMarkdown} /></div> : <p className="mt-5 text-[var(--muted)]">{t("mods.exportImport.entry.noIntroduction")}</p>}
    </ResourcePresentation>}
    {current && versionDetail ? <CommentSection targetKey={`${resourceId}~${current.publicId}`} targetType="mod_resource" /> : null}
  </article></main>;
}

function ResourcePresentation({
  canonicalId,
  children,
  current,
  definition,
  kindCode,
  name,
  resourceId,
}: {
  canonicalId: string;
  children: ReactNode;
  current: CatalogResourceVersion;
  definition: Record<string, unknown>;
  kindCode: string;
  name: string;
  resourceId: string;
}) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [loadedDetail, setLoadedDetail] = useState<{ key: string; detail?: ModExportEntryDetail; error?: string }>();
  const [display3D, setDisplay3D] = useState(false);
  const registry = current.registry || registryForKind(kindCode);
  const revisionId = current.revisionId;
  const requestKey = `${revisionId}\u0000${registry}\u0000${resourceId}\u0000${canonicalId}\u0000${minecraftLocale(locale)}`;
  const entryDetail = loadedDetail?.key === requestKey ? loadedDetail.detail : undefined;
  const detailError = loadedDetail?.key === requestKey ? loadedDetail.error || "" : "";
  const previewPath = current.previewPath || current.iconPath;
  const manualAssetURL = current.renderFileId
    ? modContentResourceAssetURL(resourceId, current.publicId, "render")
    : current.iconFileId
      ? modContentResourceAssetURL(resourceId, current.publicId, "icon")
      : "";
  const imageURL = manualAssetURL || (revisionId && previewPath ? modExportAssetURL(revisionId, previewPath) : current.iconUrl || "");

  useEffect(() => {
    if (!revisionId || !registry) return;
    getModExportEntryDetail(revisionId, registry, resourceId, canonicalId, minecraftLocale(locale), token)
      .then((value) => setLoadedDetail({ key: requestKey, detail: value }))
      .catch((reason) => setLoadedDetail({ key: requestKey, error: reason instanceof Error ? reason.message : String(reason) }));
  }, [canonicalId, locale, registry, requestKey, resourceId, revisionId, token]);

  const modelAssetPaths = entryDetail?.modelAssetPaths;
  const modelSource = useMemo(() => {
    if (!revisionId || !modelAssetPaths?.length) return null;
    return new IndexedHttpAssetSource(
      modelAssetPaths,
      (path) => modExportAssetURL(revisionId, path, true),
      async (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (isBearerAccessToken(token)) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, credentials: init.credentials ?? "include", headers });
      },
    );
  }, [modelAssetPaths, revisionId, token]);
  const effectiveDefinition = useMemo(() => ({
    ...objectValue(entryDetail?.data),
    ...definition,
  }), [definition, entryDetail]);
  const defaultBlockState = useMemo(() => objectValue(effectiveDefinition.default_state), [effectiveDefinition]);
  const canShow3D = Boolean(entryDetail?.modelAvailable && modelSource);

  return <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0">
      {children}
      {registry === "loot_tables" ? <ModLootTableView data={effectiveDefinition} /> : null}
      {detailError ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{detailError}</p> : null}
      {entryDetail?.recipes.length ? <ModRecipeGallery title={t("mods.exportImport.entry.recipes")} recipes={entryDetail.recipes} revisionId={revisionId} /> : null}
      {entryDetail?.uses.length ? <ModRecipeGallery title={t("mods.exportImport.entry.uses")} recipes={entryDetail.uses} revisionId={revisionId} /> : null}
    </div>
    <aside className="lg:sticky lg:top-5 lg:self-start">
      {imageURL || canShow3D ? <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]">
        <div className="grid aspect-square place-items-center p-5">
          {display3D && modelSource
            ? <BlockModelCanvas assetSource={modelSource} blockEntityModel={entryDetail?.blockEntityModel} blockId={canonicalId} blockState={defaultBlockState} className="h-full w-full" />
            : imageURL
              ? <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={256} src={imageURL} width={256} />
              : <strong className="text-[var(--muted)]">{registry}</strong>}
        </div>
        {canShow3D ? <div className="grid grid-cols-2 border-t border-[var(--line)]">
          <button className={`focus-ring p-3 font-bold ${!display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => setDisplay3D(false)}>2D</button>
          <button className={`focus-ring p-3 font-bold ${display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => setDisplay3D(true)}>3D</button>
        </div> : null}
      </div> : null}
      <dl className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
        <dt className="font-bold text-[var(--muted)]">{t("resourceEditor.kind")}</dt><dd>{kindCode}</dd>
        <dt className="font-bold text-[var(--muted)]">ID</dt><dd className="break-all font-mono">{canonicalId}</dd>
      </dl>
      <ModResourceProperties data={effectiveDefinition} registry={registry} />
    </aside>
  </div>;
}

function registryForKind(kindCode: string) {
  const normalized = kindCode.toLowerCase();
  if (normalized.includes("block")) return "blocks";
  if (normalized.includes("item")) return "items";
  if (normalized.includes("entity")) return "entity_types";
  if (normalized.includes("fluid")) return "fluids";
  if (normalized.includes("effect") || normalized.includes("potion")) return "mob_effects";
  if (normalized.includes("natural_generation")) return "natural_generation";
  if (normalized.includes("world_structure") || normalized.includes("structure")) return "world_structures";
  if (normalized.includes("loot_table")) return "loot_tables";
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveVersionLocalization(values: ModContentLocalization[], locale: string, defaultLocale: string) {
  for (const candidate of contentLanguageCandidates(locale, "", defaultLocale)) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = values.find((item) => normalizeContentLanguage(item.locale).toLowerCase() === normalized);
    if (match) return match;
  }
  return values[0];
}
