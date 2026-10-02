"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { backendFetch, isBearerAccessToken } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import { catalogRegistryForKind } from "../_lib/catalog-resource-identifiers";
import type { CatalogResourceVersion } from "../_lib/editor-types";
import {
  loadModContentResource,
  loadModContentSimilarResources,
  modContentResourceAssetURL,
  type ModContentLocalization,
  type ModContentEntryType,
  type ModContentResource,
  type ModContentSimilarResource,
  type ModContentTemplateDefinition,
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
import { ContentMetricsPanel } from "./content-metrics-panel";

const BlockModelCanvas = dynamic(() => import("@/components/mcmods-exporter/BlockModelCanvas").then((module) => module.BlockModelCanvas), { ssr: false });

export function ModContentResourceDetail({ siteId, resourceId, versionId, sectionId }: { siteId: string; resourceId: string; versionId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const capabilityRequestKey = `${siteId}\u0000${resourceId}\u0000${token}`;
  const [detail, setDetail] = useState<ModContentResource>();
  const [detailCapabilityKey, setDetailCapabilityKey] = useState("");
  const [similarResources, setSimilarResources] = useState<ModContentSimilarResource[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadModContentResource(siteId, resourceId, token)
      .then((value) => { if (!cancelled) { setDetail(value); setDetailCapabilityKey(capabilityRequestKey); setSimilarResources([]); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [capabilityRequestKey, resourceId, siteId, token]);

  useEffect(() => {
    if (!detail) return;
    const requestedIndex = detail.versions.findIndex((item) => item.publicId === versionId);
    const firstDetailedIndex = detail.versions.findIndex((item) => item.hasDetail);
    const currentVersionId = detail.versions[requestedIndex >= 0 ? requestedIndex : Math.max(0, firstDetailedIndex)]?.publicId;
    if (!currentVersionId) return;
    let cancelled = false;
    loadModContentSimilarResources(siteId, resourceId, currentVersionId, locale, token)
      .then((result) => { if (!cancelled) setSimilarResources(result.items); })
      .catch(() => { if (!cancelled) setSimilarResources([]); });
    return () => { cancelled = true; };
  }, [detail, locale, resourceId, siteId, token, versionId]);

  if (!detail) return <main className="grid min-h-[65vh] place-items-center p-6">{error || t("common.loading")}</main>;

  const requestedIndex = detail.versions.findIndex((item) => item.publicId === versionId);
  const firstDetailedIndex = detail.versions.findIndex((item) => item.hasDetail);
  const currentIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, firstDetailedIndex);
  const current = detail.versions[currentIndex];
  const versionDetail = detail.details.find((item) => item.versionPublicId === current?.publicId);
  const canEditResource = detailCapabilityKey === capabilityRequestKey && detail.capabilities.editResource;
  const localization = resolveVersionLocalization(versionDetail?.localizations || [], locale, versionDetail?.defaultLocale || "en-US");

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-5">
      <Link className="font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><h1 className="text-3xl font-black">{localization?.name || detail.canonicalId}</h1>{current ? <div className="flex flex-wrap gap-2"><Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}/history?version=${encodeURIComponent(current.publicId)}&section=${encodeURIComponent(sectionId)}`}>{t("contentHistory.title")}</Link>{canEditResource && versionDetail ? <Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}/edit?version=${encodeURIComponent(current.publicId)}&section=${encodeURIComponent(sectionId)}`}>{t("common.edit")}</Link> : null}</div> : null}</div>
      <div className="mt-4 flex gap-1 overflow-x-auto">{detail.versions.map((version, index) => {
        const href = version.detailUrl || `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(version.publicId)}`;
        return <Link className={`focus-ring shrink-0 rounded px-2 py-1 text-xs font-black ${index === currentIndex ? "bg-[var(--accent)] text-[var(--on-accent)]" : version.hasDetail ? "bg-[var(--panel-subtle)]" : "border border-[var(--red)] text-[var(--red)]"}`} href={href} key={version.publicId}>{version.label}</Link>;
      })}</div>
    </header>
    {current && similarResources.length > 1 ? <SimilarResourceStrip currentResourceId={resourceId} locale={locale} resources={similarResources} sectionId={sectionId} siteId={siteId} versionId={current.publicId} /> : null}
    {!current || !versionDetail ? <section className="mt-8 rounded-lg border border-dashed border-[var(--red)] bg-[var(--panel)] p-8 text-center"><h2 className="text-xl font-black">{current?.label}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionContentMissing")}</p></section> : <ResourcePresentation canonicalId={detail.canonicalId} current={current} definition={versionDetail.definition} entryTypeCode={versionDetail.entryTypeCode} key={current.publicId} kindCode={detail.kindCode} name={localization?.name || detail.canonicalId} resourceId={resourceId} schemaDefinition={versionDetail.schemaDefinition}>
      {localization?.contentMarkdown ? <div className="markdown-preview mt-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.contentMarkdown} /></div> : <p className="mt-5 text-[var(--muted)]">{t("mods.exportImport.entry.noIntroduction")}</p>}
    </ResourcePresentation>}
    <ContentMetricsPanel pageKey={current ? `version:${current.publicId}` : "detail"} publicId={resourceId} />
    {current && versionDetail ? <CommentSection targetKey={`${resourceId}~${current.publicId}`} targetType="mod_resource" /> : null}
  </article></main>;
}

function SimilarResourceStrip({ siteId, sectionId, versionId, currentResourceId, resources, locale }: { siteId: string; sectionId: string; versionId: string; currentResourceId: string; resources: ModContentSimilarResource[]; locale: string }) {
  const { t } = useI18n();
  return <section className="mt-5 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-3">
    <h2 className="text-sm font-black text-[var(--accent)]">{t("modContent.similarResources")}</h2>
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{resources.map((resource) => {
      const active = resource.resourcePublicId === currentResourceId;
      const name = similarResourceName(resource, locale) || resource.canonicalId || resource.resourcePublicId;
      const href = `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resource.resourcePublicId)}?version=${encodeURIComponent(versionId)}&section=${encodeURIComponent(sectionId)}`;
      const iconURL = similarResourceIconURL(resource);
      return <Link aria-current={active ? "page" : undefined} className={`focus-ring flex min-w-40 shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]"}`} href={href} key={resource.resourcePublicId} title={`${name}\n${resource.canonicalId || ""}`}>
        {iconURL ? <Image unoptimized alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" height={32} src={iconURL} width={32} /> : <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)]">?</span>}
        <span className="min-w-0"><strong className="block truncate text-sm">{name}</strong><code className="block truncate text-[10px] text-[var(--muted)]">{resource.canonicalId}</code></span>
      </Link>;
    })}</div>
  </section>;
}

function similarResourceIconURL(resource: ModContentSimilarResource) {
  if (resource.iconFileId) return modContentResourceAssetURL(resource.resourcePublicId, resource.versionPublicId, "icon-small");
  return resource.revisionId && resource.iconPath ? modExportAssetURL(resource.revisionId, resource.iconPath) : "";
}

function similarResourceName(resource: ModContentSimilarResource, locale: string) {
  const names = resource.names || {};
  for (const candidate of contentLanguageCandidates(locale, "en-US")) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = Object.entries(names).find(([key]) => normalizeContentLanguage(key).toLowerCase() === normalized);
    if (match?.[1]) return match[1];
  }
  return Object.values(names).find(Boolean) || "";
}

function ResourcePresentation({
  canonicalId,
  children,
  current,
  definition,
  entryTypeCode,
  kindCode,
  name,
  resourceId,
  schemaDefinition,
}: {
  canonicalId: string;
  children: ReactNode;
  current: CatalogResourceVersion;
  definition: Record<string, unknown>;
  entryTypeCode: string;
  kindCode: string;
  name: string;
  resourceId: string;
  schemaDefinition?: ModContentTemplateDefinition;
}) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [loadedDetail, setLoadedDetail] = useState<{ key: string; detail?: ModExportEntryDetail; error?: string }>();
  const [display3D, setDisplay3D] = useState(false);
  const registry = current.registry || catalogRegistryForKind(kindCode) || "";
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
        return backendFetch(input, { ...init, credentials: init.credentials ?? "include", headers });
      },
    );
  }, [modelAssetPaths, revisionId, token]);
  const schemaEntryType = schemaDefinition?.entryTypes?.find((entryType) => entryType.code === entryTypeCode);
  const defaultBlockState = useMemo(() => objectValue(definition.defaultState), [definition]);
  const canShow3D = Boolean(entryDetail?.modelAvailable && modelSource);

  return <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="order-2 min-w-0 lg:order-1">
      {children}
      {registry === "loot_tables" ? <ModLootTableView data={definition} /> : null}
      {detailError ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{detailError}</p> : null}
      {entryDetail?.recipes.length ? <ModRecipeGallery title={t("mods.exportImport.entry.recipes")} recipes={entryDetail.recipes} revisionId={revisionId} /> : null}
      {entryDetail?.uses.length ? <ModRecipeGallery title={t("mods.exportImport.entry.uses")} recipes={entryDetail.uses} revisionId={revisionId} /> : null}
    </div>
    <aside className="order-1 lg:sticky lg:top-5 lg:order-2 lg:self-start">
      {imageURL || canShow3D ? <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]">
        <div className="grid aspect-square place-items-center p-5">
          {display3D && modelSource
            ? <BlockModelCanvas assetSource={modelSource} blockEntityModel={entryDetail?.blockEntityModel} blockId={canonicalId} blockState={defaultBlockState} className="h-full w-full" />
            : imageURL
              ? <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={256} src={imageURL} width={256} />
              : <strong className="text-[var(--muted)]">{registry}</strong>}
        </div>
        {canShow3D ? <div className="grid grid-cols-2 border-t border-[var(--line)]">
          <button className={`focus-ring p-3 font-bold ${!display3D ? "bg-[var(--accent)] text-[var(--on-accent)]" : ""}`} type="button" onClick={() => setDisplay3D(false)}>2D</button>
          <button className={`focus-ring p-3 font-bold ${display3D ? "bg-[var(--accent)] text-[var(--on-accent)]" : ""}`} type="button" onClick={() => setDisplay3D(true)}>3D</button>
        </div> : null}
      </div> : null}
      <dl className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
        <dt className="font-bold text-[var(--muted)]">{t("resourceEditor.kind")}</dt><dd>{kindCode}</dd>
        <dt className="font-bold text-[var(--muted)]">ID</dt><dd className="break-all font-mono">{canonicalId}</dd>
        {hasPermission(user, "global_resource.view") ? <><dt className="font-bold text-[var(--muted)]">全局资源</dt><dd><Link className="font-bold text-[var(--accent)] hover:underline" href={`/admin/global-resources?publicId=${encodeURIComponent(resourceId)}`}>查看绑定的全局资源</Link></dd></> : null}
      </dl>
      <CollapsibleResourceProperties data={definition} entryType={schemaEntryType} registry={registry} />
    </aside>
  </div>;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function CollapsibleResourceProperties({ data, entryType, registry }: { data: Record<string, unknown>; entryType?: ModContentEntryType; registry: string }) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canCollapse, setCanCollapse] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setCanCollapse(content.scrollHeight > 448);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [data, registry]);

  return <div className="relative">
    <div ref={contentRef} className={!expanded && canCollapse ? "max-h-[28rem] overflow-hidden lg:max-h-none lg:overflow-visible" : ""}>
      <ModResourceProperties data={data} entryType={entryType} registry={registry} />
    </div>
    {!expanded && canCollapse ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-12 h-20 bg-gradient-to-t from-[var(--background)] to-transparent lg:hidden" /> : null}
    {canCollapse ? <button className="button-secondary focus-ring mt-3 w-full lg:hidden" type="button" onClick={() => setExpanded((value) => !value)}>{t(expanded ? "common.collapse" : "common.expand")}</button> : null}
  </div>;
}

function resolveVersionLocalization(values: ModContentLocalization[], locale: string, defaultLocale: string) {
  for (const candidate of contentLanguageCandidates(locale, "", defaultLocale)) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = values.find((item) => normalizeContentLanguage(item.locale).toLowerCase() === normalized);
    if (match) return match;
  }
  return values[0];
}
