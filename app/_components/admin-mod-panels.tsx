"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { MinecraftVersionConfig } from "../_lib/mod-api";
import { cacheMinecraftVersionConfig, loadMinecraftVersionConfig } from "../_lib/minecraft-version-api";
import { minecraftLoaderCodeKey } from "../_lib/minecraft-version-selection.mts";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { formatBytes } from "../_lib/oss-upload";
import { useAuthSnapshot } from "../_lib/auth";
import { LoginRequiredState } from "./page-feedback";
import type { ProjectEditorApplication } from "./project-editor-application";
import { mergeProjectEditorReviewPage, projectEditorReviewPagePath } from "../_lib/project-editor-review-pagination.mts";

type ModContentReviewItem = {
  id: string;
  source: string;
  modSiteId: string;
  modName: string;
  userId?: string;
  username: string;
  title: string;
  summary: string;
  createdAt: string;
  reviewUrl: string;
  category: string;
  operation: string;
  aggregateType: string;
  projectType?: string;
  projectId?: string;
  reviewerScope: "global" | "project";
};

type ReviewQueueFacet = { value: string; count: number };
type ReviewQueueResponse = {
  items: ModContentReviewItem[];
  total: number;
  facets: { categories: ReviewQueueFacet[]; operations: ReviewQueueFacet[]; projectTypes: ReviewQueueFacet[] };
};

function versionSourceName(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname;
    return hostname.includes("bangbang93.com") ? "BMCLAPI" : hostname;
  } catch {
    return sourceUrl;
  }
}

function loaderSyncSourceURLs(status: NonNullable<MinecraftVersionConfig["loaderSyncs"]>[number]) {
  return [...(status.sourceUrls ?? []), status.sourceUrl]
    .map((sourceUrl) => sourceUrl.trim())
    .filter((sourceUrl, index, sourceUrls) => sourceUrl !== "" && sourceUrls.indexOf(sourceUrl) === index);
}

export function MinecraftVersionConfigPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<MinecraftVersionConfig | null>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionType, setVersionType] = useState<MinecraftVersionConfig["versions"][number]["type"]>("release");
  const [loaderCode, setLoaderCode] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMinecraftVersionConfig({ refresh: true })
      .then((result) => { if (!cancelled) setConfig(result); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("admin.minecraftVersions.loadFailed")); });
    return () => { cancelled = true; };
  }, [t]);

  if (!config) return <section className="surface p-5"><p className="font-bold text-[var(--muted)]">{message || t("common.loading")}</p></section>;

  function addVersion() {
    const code = versionCode.trim();
    if (!code || config!.versions.some((item) => item.code === code)) return;
    setConfig((current) => current ? { ...current, versions: [...current.versions, { code, type: versionType }] } : current);
    setVersionCode("");
  }

  function removeVersion(code: string) {
    setConfig((current) => current ? {
      ...current,
      versions: current.versions.filter((item) => item.code !== code),
      loaders: current.loaders.map((loader) => ({ ...loader, versions: loader.versions.filter((version) => version !== code) })),
    } : current);
  }

  function addLoader() {
    const code = loaderCode.trim();
    if (!code || config!.loaders.some((item) => minecraftLoaderCodeKey(item.code) === minecraftLoaderCodeKey(code))) return;
    setConfig((current) => current ? { ...current, loaders: [...current.loaders, { code, name: code, versions: [] }] } : current);
    setLoaderCode("");
  }

  function updateLoader(code: string, update: (loader: MinecraftVersionConfig["loaders"][number]) => MinecraftVersionConfig["loaders"][number]) {
    setConfig((current) => current ? { ...current, loaders: current.loaders.map((loader) => loader.code === code ? update(loader) : loader) } : current);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const saved = await apiRequest<MinecraftVersionConfig>("/api/v1/admin/config/minecraft-versions", { method: "PUT", body: JSON.stringify(config) }, token);
      cacheMinecraftVersionConfig(saved);
      setConfig(saved);
      setMessage(t("admin.minecraftVersions.saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.minecraftVersions.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function syncVersions() {
    setSyncing(true);
    setMessage("");
    try {
      const synced = await apiRequest<MinecraftVersionConfig>("/api/v1/admin/config/minecraft-versions/sync", { method: "POST" }, token);
      cacheMinecraftVersionConfig(synced);
      setConfig(synced);
      const failedCount = synced.loaderSyncs?.filter((item) => item.status === "failed").length ?? 0;
      setMessage(failedCount > 0 ? t("admin.minecraftVersions.syncedPartial", { count: failedCount }) : t("admin.minecraftVersions.synced"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.minecraftVersions.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-2xl font-black">{t("admin.minecraftVersions.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.minecraftVersions.description")}</p></div>
      <div className="flex flex-wrap gap-2"><button className="button-secondary focus-ring" disabled={saving || syncing} type="button" onClick={() => void syncVersions()}>{syncing ? t("admin.minecraftVersions.syncing") : t("admin.minecraftVersions.sync")}</button><button className="button-primary focus-ring" disabled={saving || syncing} type="button" onClick={() => void save()}>{saving ? t("admin.minecraftVersions.saving") : t("common.save")}</button></div>
    </header>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[var(--muted)]">
      <span>{t("admin.minecraftVersions.source")}: {config.sourceUrl ? <a className="text-[var(--accent)] hover:underline" href={config.sourceUrl} rel="noopener noreferrer" target="_blank">{versionSourceName(config.sourceUrl)}</a> : "-"}</span>
      <span>{config.lastSyncedAt ? t("admin.minecraftVersions.lastSynced", { time: config.lastSyncedAt.replace("T", " ").replace("Z", " UTC") }) : t("admin.minecraftVersions.neverSynced")}</span>
      {config.latestRelease ? <span>{t("admin.minecraftVersions.latestRelease", { version: config.latestRelease })}</span> : null}
      {config.latestSnapshot ? <span>{t("admin.minecraftVersions.latestSnapshot", { version: config.latestSnapshot })}</span> : null}
    </div>
    {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold">{message}</p> : null}
    <section className="surface p-5"><h3 className="text-lg font-black">{t("admin.minecraftVersions.versionList")}</h3><div className="mt-3 flex flex-wrap gap-2"><input className="field max-w-xs" value={versionCode} placeholder="1.21.1" onChange={(event) => setVersionCode(event.target.value)} /><select className="field w-auto" value={versionType} onChange={(event) => setVersionType(event.target.value as typeof versionType)}>{(["release", "snapshot", "april_fools", "legacy"] as const).map((type) => <option key={type} value={type}>{t(`admin.minecraftVersions.types.${type}`)}</option>)}</select><button className="button-secondary focus-ring" type="button" onClick={addVersion}>+ {t("common.create")}</button></div><div className="mt-4 flex max-h-80 flex-wrap gap-2 overflow-auto">{config.versions.map((version) => <span key={version.code} className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm font-bold">{version.code}<small className="text-[var(--muted)]">{t(`admin.minecraftVersions.types.${version.type}`)}</small><button className="text-[var(--red)]" type="button" onClick={() => removeVersion(version.code)}>×</button></span>)}</div></section>
    <section className="surface p-5">
      <h3 className="text-lg font-black">{t("admin.minecraftVersions.loaderList")}</h3>
      <div className="mt-3 flex gap-2">
        <input className="field max-w-sm" value={loaderCode} placeholder="Forge" onChange={(event) => setLoaderCode(event.target.value)} />
        <button className="button-secondary focus-ring" type="button" onClick={addLoader}>+ {t("common.create")}</button>
      </div>
      <div className="mt-5 grid gap-4">
        {config.loaders.map((loader) => {
          const syncStatus = config.loaderSyncs?.find((item) => item.code.toLowerCase() === loader.code.toLowerCase());
          const syncSourceURLs = syncStatus ? loaderSyncSourceURLs(syncStatus) : [];
          return <article key={loader.code} className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input className="field max-w-xs font-bold" value={loader.name} onChange={(event) => updateLoader(loader.code, (item) => ({ ...item, name: event.target.value }))} />
              <code className="text-xs text-[var(--muted)]">{loader.code}</code>
              {syncStatus ? <span className={`rounded-full border px-2 py-1 text-xs font-bold ${syncStatus.status === "synced" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--red)] text-[var(--red)]"}`}>{t(`admin.minecraftVersions.syncStatus.${syncStatus.status}`)}</span> : <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{t("admin.minecraftVersions.syncStatus.manual")}</span>}
              <button className="button-secondary focus-ring ml-auto" type="button" onClick={() => updateLoader(loader.code, (item) => ({ ...item, versions: config.versions.map((version) => version.code) }))}>{t("admin.minecraftVersions.selectAll")}</button>
              <button className="button-secondary focus-ring" type="button" onClick={() => updateLoader(loader.code, (item) => ({ ...item, versions: [] }))}>{t("admin.minecraftVersions.clear")}</button>
              <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => setConfig((current) => current ? { ...current, loaders: current.loaders.filter((item) => item.code !== loader.code) } : current)}>{t("common.delete")}</button>
            </div>
            {syncStatus ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[var(--panel-subtle)] px-3 py-2 text-xs text-[var(--muted)]">
              {syncSourceURLs.map((sourceUrl, sourceIndex) => <a key={sourceUrl} className="text-[var(--accent)] hover:underline" href={sourceUrl} rel="noopener noreferrer" target="_blank">{t("admin.minecraftVersions.loaderSource")}{syncSourceURLs.length > 1 ? ` ${sourceIndex + 1}` : ""}: {versionSourceName(sourceUrl)}</a>)}
              <span>{t("admin.minecraftVersions.supportedCount", { count: syncStatus.versionCount })}</span>
              {syncStatus.usedFallback ? <span>{t("admin.minecraftVersions.fallbackUsed")}</span> : null}
              <span>{syncStatus.lastSyncedAt ? t("admin.minecraftVersions.lastSynced", { time: syncStatus.lastSyncedAt.replace("T", " ").replace("Z", " UTC") }) : t("admin.minecraftVersions.neverSynced")}</span>
            </div> : null}
            {syncStatus?.error ? <p className="mt-2 break-words text-xs text-[var(--red)]">{t("admin.minecraftVersions.sourceError")}: {syncStatus.error}</p> : null}
            <MinecraftVersionPicker className="mt-3 w-full" config={config} values={loader.versions} onChange={(versions) => updateLoader(loader.code, (item) => ({ ...item, versions }))} />
          </article>;
        })}
      </div>
    </section>
  </section>;
}

export function ModReviewQueuePanel({ kind, token }: { kind: "content" | "editor"; token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<Array<ModContentReviewItem | ProjectEditorApplication>>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [operation, setOperation] = useState("");
  const [projectType, setProjectType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ReviewQueueResponse["facets"]>({ categories: [], operations: [], projectTypes: [] });
  const [editorNextCursor, setEditorNextCursor] = useState("");
  const [editorLoadingMore, setEditorLoadingMore] = useState(false);
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const pageSize = 50;
  const contentSearch = new URLSearchParams();
  if (category) contentSearch.set("category", category);
  if (operation) contentSearch.set("operation", operation);
  if (projectType) contentSearch.set("projectType", projectType);
  if (search) contentSearch.set("q", search);
  contentSearch.set("limit", String(pageSize));
  contentSearch.set("offset", String(page * pageSize));
  const contentEndpoint = `/api/v1/reviews/content?${contentSearch}`;
  const load = useCallback(async (editorCursor = "") => {
    const appendEditorPage = kind === "editor" && Boolean(editorCursor);
    const generation = ++requestGeneration.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (appendEditorPage) setEditorLoadingMore(true);
    else if (kind === "editor") setEditorNextCursor("");
    try {
      const endpoint = kind === "content"
        ? contentEndpoint
        : projectEditorReviewPagePath("pending", pageSize, editorCursor);
      const result = await apiRequest<{
        items: Array<ModContentReviewItem | ProjectEditorApplication>;
        total?: number;
        facets?: ReviewQueueResponse["facets"];
        hasMore?: boolean;
        nextCursor?: string;
      }>(endpoint, { signal: controller.signal }, token);
      if (generation !== requestGeneration.current) return;
      setItems((current) => appendEditorPage ? mergeProjectEditorReviewPage(current, result.items) : result.items);
      if (kind === "content") {
        if (result.facets) setFacets(result.facets);
        setTotal(result.total ?? result.items.length);
      } else {
        setEditorNextCursor(result.hasMore ? result.nextCursor ?? "" : "");
      }
      setMessage("");
    } catch (error) {
      if (generation !== requestGeneration.current || (error as { name?: string }).name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : t("admin.reviews.loadFailed"));
    } finally {
      if (generation === requestGeneration.current) setEditorLoadingMore(false);
    }
  }, [contentEndpoint, kind, t, token]);
  useEffect(() => {
    queueMicrotask(() => void load());
    return () => {
      requestGeneration.current += 1;
      requestController.current?.abort();
    };
  }, [load]);

  async function review(item: ModContentReviewItem | ProjectEditorApplication, status: "approved" | "rejected") {
    const url = "reviewUrl" in item ? item.reviewUrl : `/api/v1/admin/project-editor-applications/${item.id}`;
    try {
      await apiRequest(url, { method: "PATCH", body: JSON.stringify({ status, note: notes[item.id] ?? "" }) }, token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.reviews.reviewFailed"));
    }
  }

  async function openAttachment(applicationID: string, attachmentID: string) {
    try {
      const result = await apiRequest<{ url: string }>(`/api/v1/admin/project-editor-applications/${applicationID}/attachments/${attachmentID}/presign`, { method: "POST" }, token);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.reviews.attachmentFailed"));
    }
  }

return <section>
  <p className="text-sm text-[var(--muted)]">{t(`admin.reviews.${kind}Description`)}</p>
  {kind === "content" ? <form className="surface mt-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(150px,210px))_auto]" onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()); }}>
    <input className="field" type="search" value={searchInput} placeholder={t("admin.reviews.searchPlaceholder")} onChange={(event) => setSearchInput(event.target.value)} />
    <select className="field" value={category} onChange={(event) => { setPage(0); setCategory(event.target.value); }}>
      <option value="">{t("admin.reviews.allCategories")}</option>
      {facets.categories.map((facet) => <option key={facet.value} value={facet.value}>{reviewFacetLabel(t, "categories", facet.value)} ({facet.count})</option>)}
    </select>
    <select className="field" value={operation} onChange={(event) => { setPage(0); setOperation(event.target.value); }}>
      <option value="">{t("admin.reviews.allOperations")}</option>
      {facets.operations.map((facet) => <option key={facet.value} value={facet.value}>{reviewFacetLabel(t, "operations", facet.value)} ({facet.count})</option>)}
    </select>
    <select className="field" value={projectType} onChange={(event) => { setPage(0); setProjectType(event.target.value); }}>
      <option value="">{t("admin.reviews.allProjectTypes")}</option>
      {facets.projectTypes.map((facet) => <option key={facet.value} value={facet.value}>{reviewFacetLabel(t, "categories", facet.value)} ({facet.count})</option>)}
    </select>
    <div className="flex gap-2"><button className="button-primary focus-ring" type="submit">{t("common.search")}</button><button className="button-secondary focus-ring" type="button" onClick={() => { setPage(0); setCategory(""); setOperation(""); setProjectType(""); setSearchInput(""); setSearch(""); }}>{t("common.clear")}</button></div>
  </form> : null}
  {message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
  <div className="mt-5 grid gap-4">{items.map((item) => { const content = "reviewUrl" in item; const title = content ? item.title : t("admin.reviews.applicationKinds.editor"); const summary = content ? item.summary : item.proofMarkdown; const name = item.username; const projectName = content ? item.modName : item.targetName; const historyHref = content ? contentReviewHistoryHref(item) : item.targetUrl; return <article key={`${content ? item.source : "editor"}-${item.id}`} className="surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2">{content ? <><span className="rounded-full bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">{reviewFacetLabel(t, "categories", item.category)}</span><span className="rounded-full bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-bold">{reviewFacetLabel(t, "operations", item.operation)}</span>{item.reviewerScope === "project" ? <span className="rounded-full border border-[var(--accent)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">{t("admin.reviews.projectScoped")}</span> : null}</> : null}</div><h3 className="break-words text-lg font-black">{projectName} · {title}</h3><p className="mt-1 text-sm text-[var(--muted)]">{name} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p>{content && item.projectId ? <p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.projectType}: {item.projectId}</p> : !content ? <p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.targetType}: {item.targetId}</p> : null}</div>{historyHref ? <Link className="button-secondary focus-ring" href={historyHref} target={content && (item.source === "blueprint" || item.source === "skin") ? "_blank" : undefined}>{t("admin.reviews.viewDetails")}</Link> : null}</div><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{summary || t("admin.reviews.noDescription")}</p>{!content && item.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((attachment) => <button key={attachment.id} className="button-secondary focus-ring" type="button" onClick={() => void openAttachment(item.id, attachment.id)}>{attachment.originalName} · {formatBytes(attachment.sizeBytes)}</button>)}</div> : null}<textarea className="field mt-4 min-h-20 resize-y" value={notes[item.id] ?? ""} placeholder={t("admin.reviews.notePlaceholder")} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /><div className="mt-3 flex justify-end gap-2"><button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => void review(item, "rejected")}>{t("admin.reviews.reject")}</button><button className="button-primary focus-ring" type="button" onClick={() => void review(item, "approved")}>{t("admin.reviews.approve")}</button></div></article>; })}{items.length === 0 ? <div className="surface grid min-h-52 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("admin.reviews.empty")}</div> : null}</div>
  {kind === "content" && total > pageSize ? <nav className="mt-5 flex items-center justify-between gap-3" aria-label={t("admin.reviews.paginationLabel")}><button className="button-secondary focus-ring" disabled={page === 0} type="button" onClick={() => setPage((current) => Math.max(0, current - 1))}>{t("common.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{t("admin.reviews.pageSummary", { page: page + 1, pages: Math.max(1, Math.ceil(total / pageSize)), total })}</span><button className="button-secondary focus-ring" disabled={(page + 1) * pageSize >= total} type="button" onClick={() => setPage((current) => current + 1)}>{t("common.next")}</button></nav> : null}
  {kind === "editor" && editorNextCursor ? <button className="button-secondary focus-ring mt-5 w-full" disabled={editorLoadingMore} type="button" onClick={() => void load(editorNextCursor)}>{editorLoadingMore ? t("common.loading") : t("admin.reviews.loadMore")}</button> : null}
</section>;
}
export function ProjectReviewQueuePage() {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  if (!ready) return <section className="surface p-6 font-bold text-[var(--muted)]">{t("common.loading")}</section>;
  if (!token) return <LoginRequiredState nextPath="/reviews" description={t("admin.reviews.loginRequired")} />;
  return <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6"><header className="mb-6"><p className="text-sm font-black text-[var(--accent)]">{t("admin.reviews.projectQueueKicker")}</p><h1 className="mt-1 text-3xl font-black">{t("admin.reviews.projectQueueTitle")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.reviews.projectQueueDescription")}</p></header><ModReviewQueuePanel kind="content" token={token} /></section>;
}

function reviewFacetLabel(t: (key: string, values?: Record<string, string | number>) => string, group: "categories" | "operations", value: string) {
  return t(`admin.reviews.${group}.${value}`);
}

function contentReviewHistoryHref(item: ModContentReviewItem) {
  if (!item.modSiteId) return "";
  switch (item.source) {
    case "blueprint": return `/blueprints/${item.modSiteId}`;
    case "skin": return `/skins/${item.modSiteId}`;
    case "changelog": return item.modSiteId ? `${item.modSiteId}?tab=changelog` : "";
    case "tutorial": return `/tutorials/${item.modSiteId}`;
    case "issue": return `/issues/${item.modSiteId}`;
    case "news": return `/news/${item.modSiteId}`;
    case "discussion": return `/discussions/${item.modSiteId}`;
    case "modpack": return `/modpacks/${item.modSiteId}/history`;
    case "plugin": return `/plugins/${item.modSiteId}/history`;
    case "map": return `/maps/${item.modSiteId}/history`;
    case "resource_pack": return `/resource-packs/${item.modSiteId}/history`;
    case "shader_pack": return `/shaders/${item.modSiteId}/history`;
    case "datapack": return `/datapacks/${item.modSiteId}/history`;
    case "addon": return `/addons/${item.modSiteId}/history`;
    default: return `/mods/${item.modSiteId}/history`;
  }
}
