"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { findModExportCategory, modExportCategoryTitle } from "../_lib/mod-export-catalog";
import {
  getModExportEntryDetail,
  minecraftLocale,
  modExportAssetURL,
  ModExportEntryDetail,
  ModExportRegistryEntry,
  ModExportRevision,
  saveModExportEntryContent,
} from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolsPlayground } from "./tools-playground";
import { IndexedHttpAssetSource } from "@/lib/mcmods-exporter/renderer";

const BlockModelCanvas = dynamic(() => import("@/components/mcmods-exporter/BlockModelCanvas").then((module) => module.BlockModelCanvas), { ssr: false });

type CategoryPageProps = { siteId: string; revisionId: string; categoryKey: string };
type EntryPageProps = CategoryPageProps & { registry: string; objectId: string };

export function ModExportCategoryPage({ siteId, revisionId, categoryKey }: CategoryPageProps) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [revision, setRevision] = useState<ModExportRevision>();
  const [entries, setEntries] = useState<ModExportRegistryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const category = findModExportCategory(revision, categoryKey);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items: ModExportRevision[] }>(`/api/v1/mods/${encodeURIComponent(siteId)}/export-data`, {}, token)
      .then((result) => {
        if (cancelled) return;
        const current = result.items.find((item) => item.id === revisionId);
        if (!current) throw new Error(t("mods.exportImport.errors.load"));
        setRevision(current);
      })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [revisionId, siteId, t, token]);

  useEffect(() => {
    if (!category || category.structures) return;
    let cancelled = false;
    const params = new URLSearchParams({ all: "1", locale: minecraftLocale(locale) });
    if (category.documentKind) params.set("kind", category.documentKind);
    else params.set("registries", category.registries.join(","));
    loadAllModExportEntries(
      `/api/v1/export-revisions/${encodeURIComponent(revisionId)}/${category.documentKind ? "document-entries" : "registry-entries"}`,
      params,
      token,
    ).then((items) => { if (!cancelled) setEntries(items); })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [category, locale, revisionId, token]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) => entry.id.toLocaleLowerCase().includes(keyword)
      || Object.values(entry.names).some((name) => name.toLocaleLowerCase().includes(keyword)));
  }, [entries, query]);

  const title = category ? modExportCategoryTitle(category, t) : t("common.loading");
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
    <div className="mx-auto max-w-[1680px]">
      <header className="flex flex-wrap items-end gap-4 border-b border-[var(--line)] pb-4">
        <div className="min-w-0 flex-1"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.exportImport.backToCategories")}</Link><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-1 text-sm text-[var(--muted)]">{revision ? `${revision.minecraftVersion} · ${revision.loader} · ${filtered.length.toLocaleString()}` : t("common.loading")}</p></div>
        <input className="field w-full sm:w-80" type="search" value={query} placeholder={t("mods.exportImport.searchEntries")} onChange={(event) => setQuery(event.target.value)} />
      </header>
      {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
      {!revision || !category ? <Loading /> : category.key === "achievements" ? <AdvancementIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : category.key === "itemsBlocks" ? <DenseIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : <CardIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} />}
    </div>
  </main>;
}

function DenseIndex({ entries, ...props }: IndexProps) {
  const { t } = useI18n();
  const groups = ["blocks", "items"].map((registry) => ({ registry, entries: entries.filter((entry) => entry.registry === registry) })).filter((group) => group.entries.length);
  return <div className="mt-5 divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">{groups.map((group) => <section className="grid lg:grid-cols-[140px_minmax(0,1fr)]" key={group.registry}><h2 className="bg-[var(--panel-subtle)] p-4 font-black text-[var(--accent)]">{t(`mods.exportImport.registries.${group.registry}`)}</h2><div className="flex flex-wrap gap-x-3 gap-y-2 p-4">{group.entries.map((entry) => <EntryLink entry={entry} key={`${entry.registry}:${entry.id}`} {...props} compact />)}</div></section>)}</div>;
}

type IndexProps = CategoryPageProps & { entries: ModExportRegistryEntry[]; locale: string };

function CardIndex({ entries, ...props }: IndexProps) {
  return <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{entries.map((entry) => <EntryLink entry={entry} key={`${entry.registry}:${entry.id}`} {...props} />)}</div>;
}

function EntryLink({ entry, revisionId, siteId, categoryKey, locale, compact = false }: Omit<IndexProps, "entries"> & { entry: ModExportRegistryEntry; compact?: boolean }) {
  const name = localizedName(entry, locale);
  const href = `/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(revisionId)}/${encodeURIComponent(categoryKey)}/entry?registry=${encodeURIComponent(entry.registry)}&objectId=${encodeURIComponent(entry.id)}`;
  return <Link className={`focus-ring flex items-center gap-2 bg-[var(--panel)] text-left hover:bg-[var(--panel-subtle)] ${compact ? "max-w-72 rounded px-1.5 py-1 text-[var(--accent)]" : "min-h-20 p-4"}`} href={href} target="_blank" rel="noopener noreferrer">
    {entry.iconPath ? <Image unoptimized alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" height={32} width={32} src={modExportAssetURL(revisionId, entry.iconPath)} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-[10px] font-bold text-[var(--muted)]">{entry.registry.slice(0, 2).toUpperCase()}</span>}
    <span className="min-w-0"><strong className="block truncate">{name}</strong>{!compact ? <code className="mt-1 block truncate text-xs text-[var(--muted)]">{entry.id}</code> : null}</span>
  </Link>;
}

function AdvancementIndex(props: IndexProps) {
  const roots = useMemo(() => advancementRoots(props.entries), [props.entries]);
  return <div className="mt-5 space-y-5">{roots.map((group) => <AdvancementBoard key={group.root.id} {...props} entries={group.entries} />)}</div>;
}

function AdvancementBoard({ entries, ...props }: IndexProps) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const positions = entries.map((entry, index) => {
    const display = record(entry.data.display);
    return { entry, x: numberValue(display.x, advancementDepth(entry, byId)) * 170 + 70, y: numberValue(display.y, index) * 74 + 60 };
  });
  const width = Math.max(760, ...positions.map((item) => item.x + 170));
  const height = Math.max(260, ...positions.map((item) => item.y + 90));
  const points = new Map(positions.map((item) => [item.entry.id, item]));
  return <section className="overflow-auto rounded-lg border border-[#4a4335] bg-[#2b261f] shadow-inner">
    <div className="relative" style={{ width, height, backgroundImage: "linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>{positions.map(({ entry, x, y }) => { const parent = typeof entry.data.parent === "string" ? points.get(entry.data.parent) : undefined; return parent ? <path key={entry.id} d={`M ${parent.x + 24} ${parent.y + 24} H ${x - 18} V ${y + 24} H ${x}`} fill="none" stroke="#8b8b8b" strokeWidth="3" /> : null; })}</svg>
      {positions.map(({ entry, x, y }) => { const display = record(entry.data.display); const frame = typeof display.frame === "string" ? display.frame : "task"; return <div className="absolute" key={entry.id} style={{ left: x, top: y }}><EntryLink entry={entry} {...props} compact /><span className={`pointer-events-none absolute -inset-1 rounded border-2 ${frame === "challenge" ? "border-fuchsia-500" : frame === "goal" ? "border-amber-400" : "border-slate-400"}`} /></div>; })}
    </div>
  </section>;
}

export function ModExportEntryPage({ siteId, revisionId, categoryKey, registry, objectId }: EntryPageProps) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const normalized = minecraftLocale(locale);
  const [entry, setEntry] = useState<ModExportRegistryEntry>();
  const [detail, setDetail] = useState<ModExportEntryDetail>();
  const [markdown, setMarkdown] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [display3D, setDisplay3D] = useState(false);
  const [modelPaths, setModelPaths] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const documentKind = registry === "advancements" ? "advancements" : registry === "key_mappings" ? "key_mappings" : "";
    const params = new URLSearchParams({ q: objectId, locale: normalized, limit: "100" });
    if (documentKind) params.set("kind", documentKind); else params.set("registries", registry);
    const detailRequest = getModExportEntryDetail(revisionId, registry, objectId, normalized, token)
      .catch((reason) => documentKind && reason instanceof ApiError && reason.status === 404
        ? emptyEntryDetail(normalized)
        : Promise.reject(reason));
    Promise.all([
      apiRequest<{ items: ModExportRegistryEntry[] }>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}/${documentKind ? "document-entries" : "registry-entries"}?${params}`, {}, token),
      detailRequest,
    ]).then(async ([list, nextDetail]) => {
      if (cancelled) return;
      const found = list.items.find((item) => item.registry === registry && item.id === objectId);
      if (!found) throw new Error(t("mods.exportImport.noEntries"));
      const hydratedDetail = await hydrateRecipeLayouts(nextDetail, revisionId, token);
      if (cancelled) return;
      setEntry(found); setDetail(hydratedDetail); setMarkdown(hydratedDetail.contentMarkdown || "");
    }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [normalized, objectId, registry, revisionId, t, token]);

  async function save() {
    setSaving(true); setError("");
    try {
      const result = await saveModExportEntryContent(siteId, registry, objectId, normalized, markdown, token);
      setDetail((current) => current ? { ...current, contentMarkdown: result.contentMarkdown, contentLocale: result.locale } : current);
      setEditing(false);
    } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); }
  }

  const modelSource = useMemo(() => modelPaths.length ? new IndexedHttpAssetSource(
    modelPaths,
    (path) => modExportAssetURL(revisionId, path, true),
    async (input, init = {}) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  ) : null, [modelPaths, revisionId, token]);

  async function show3D() {
    setDisplay3D(true);
    if (modelPaths.length) return;
    try {
      const result = await apiRequest<{ items: string[] }>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}/assets?pathsOnly=1`, {}, token);
      setModelPaths(result.items);
    } catch (reason) { setError(errorText(reason)); }
  }

  if (!entry || !detail) return <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">{error ? <p className="mx-auto max-w-4xl rounded-lg border border-[var(--red)] p-4 text-[var(--red)]">{error}</p> : <Loading />}</main>;
  const name = localizedName(entry, locale);
  const display = record(entry.data.display);
  const documentDescription = localizedRecordValue(display.description_names, normalized);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]"><article className="mx-auto max-w-[1500px]">
    <header className="flex items-start gap-4 border-b border-[var(--line)] pb-5">{entry.iconPath ? <Image unoptimized alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" height={64} width={64} src={modExportAssetURL(revisionId, entry.iconPath)} /> : null}<div className="min-w-0 flex-1"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(revisionId)}/${encodeURIComponent(categoryKey)}`}>← {t("mods.exportImport.backToCategories")}</Link><h1 className="mt-2 text-3xl font-black">{name}</h1><code className="block break-all text-sm text-[var(--muted)]">{entry.id}</code></div></header>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
    <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0"><section><div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2"><h2 className="text-xl font-black">{t("mods.exportImport.entry.introduction")}</h2>{token ? <button className="button-secondary focus-ring" type="button" onClick={() => setEditing((current) => !current)}>{editing ? t("common.cancel") : t("mods.exportImport.entry.editIntroduction")}</button> : null}</div>{editing ? <div className="mt-4"><ToolsPlayground embedded editorTitle={name} value={markdown} onChange={setMarkdown} /><div className="mt-3 flex justify-end"><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></div></div> : detail.contentMarkdown ? <div className="markdown-preview mt-4"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="py-8 text-[var(--muted)]">{documentDescription || t("mods.exportImport.entry.noIntroduction")}</p>}</section>
      {detail.recipes.length ? <RecipeGallery title={t("mods.exportImport.entry.recipes")} recipes={detail.recipes} revisionId={revisionId} /> : null}{detail.uses.length ? <RecipeGallery title={t("mods.exportImport.entry.uses")} recipes={detail.uses} revisionId={revisionId} /> : null}
    </div><aside className="lg:sticky lg:top-5 lg:self-start"><div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]"><div className="grid aspect-square place-items-center p-5">{display3D && modelSource ? <BlockModelCanvas assetSource={modelSource} blockId={entry.id} className="h-full w-full" /> : entry.previewPath || entry.iconPath ? <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={256} width={256} src={modExportAssetURL(revisionId, entry.previewPath || entry.iconPath)} /> : <strong className="text-[var(--muted)]">{entry.registry}</strong>}</div>{detail.modelAvailable ? <div className="grid grid-cols-2 border-t border-[var(--line)]"><button className={`focus-ring p-3 font-bold ${!display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => setDisplay3D(false)}>2D</button><button className={`focus-ring p-3 font-bold ${display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => void show3D()}>3D</button></div> : null}</div><dl className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm"><dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.entry.registry")}</dt><dd>{entry.registry}</dd><dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.entry.namespace")}</dt><dd>{entry.namespace}</dd></dl></aside></div>
  </article></main>;
}

function RecipeGallery({ title, recipes, revisionId }: { title: string; recipes: Record<string, unknown>[]; revisionId: string }) {
  return <section className="mt-8 border-t border-[var(--line)] pt-5"><h2 className="text-xl font-black">{title}</h2><div className="mt-4 grid gap-4 xl:grid-cols-2">{recipes.map((recipe, index) => <RecipeLayoutCard key={`${String(recipe.id)}:${index}`} recipe={recipe} revisionId={revisionId} />)}</div></section>;
}

function RecipeLayoutCard({ recipe, revisionId }: { recipe: Record<string, unknown>; revisionId: string }) {
  const layout = record(recipe.jeiLayout);
  const background = typeof layout.background === "string" ? layout.background : "";
  const pixels = record(layout.image_pixels);
  const scale = numberValue(layout.image_scale, 2);
  const width = numberValue(pixels.width, 370);
  const height = numberValue(pixels.height, 186);
  const slots = Array.isArray(layout.slots) ? layout.slots : [];
  const containsIngredients = layout.background_contains_ingredients === true;
  return <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    {background ? <div className="overflow-auto bg-[#c6c6c6] p-3"><div className="relative mx-auto" style={{ width, height }}><Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={modExportAssetURL(revisionId, background)} />{!containsIngredients ? slots.map((value, index) => { const slot = record(value); const rect = record(slot.rect); const alternatives = Array.isArray(slot.alternatives) ? slot.alternatives : []; const item = record(alternatives[0]); const itemId = typeof item.item === "string" ? item.item : ""; if (!itemId) return null; return <Image unoptimized alt="" className="absolute object-contain [image-rendering:pixelated]" height={numberValue(rect.height, 16) * scale} width={numberValue(rect.width, 16) * scale} key={`${itemId}:${index}`} src={modExportAssetURL(revisionId, itemIconPath(itemId))} style={{ left: numberValue(rect.x, 0) * scale, top: numberValue(rect.y, 0) * scale }} />; }) : null}</div></div> : <div className="grid min-h-32 place-items-center p-4 text-sm text-[var(--muted)]">{String(recipe.type || "Recipe")}</div>}
    <code className="block break-all border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">{String(recipe.id || recipe.type || "")}</code>
  </article>;
}

function advancementRoots(entries: ModExportRegistryEntry[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const groups = new Map<string, ModExportRegistryEntry[]>();
  for (const entry of entries) {
    let current = entry;
    const visited = new Set<string>();
    while (typeof current.data.parent === "string" && byId.has(current.data.parent) && !visited.has(current.id)) { visited.add(current.id); current = byId.get(current.data.parent)!; }
    const group = groups.get(current.id) ?? [];
    group.push(entry); groups.set(current.id, group);
  }
  return [...groups.entries()].map(([id, groupEntries]) => ({ root: byId.get(id) ?? groupEntries[0], entries: groupEntries }));
}

function advancementDepth(entry: ModExportRegistryEntry, entries: Map<string, ModExportRegistryEntry>) { let depth = 0; let current = entry; const seen = new Set<string>(); while (typeof current.data.parent === "string" && entries.has(current.data.parent) && !seen.has(current.id)) { seen.add(current.id); current = entries.get(current.data.parent)!; depth++; } return depth; }
function localizedName(entry: ModExportRegistryEntry, locale: string) { const key = minecraftLocale(locale); return entry.names[key] || entry.names.en_us || entry.names.zh_cn || entry.id; }
function localizedRecordValue(value: unknown, locale: string) { const values = record(value); return typeof values[locale] === "string" ? values[locale] as string : typeof values.zh_cn === "string" ? values.zh_cn as string : typeof values.en_us === "string" ? values.en_us as string : ""; }
function itemIconPath(itemId: string) { const separator = itemId.indexOf(":"); const namespace = separator >= 0 ? itemId.slice(0, separator) : "minecraft"; const path = separator >= 0 ? itemId.slice(separator + 1) : itemId; return `icons/items/32/${namespace}/${path}.png`; }
async function loadAllModExportEntries(endpoint: string, parameters: URLSearchParams, token: string) {
  const firstParameters = new URLSearchParams(parameters);
  firstParameters.set("all", "1");
  firstParameters.set("limit", "100");
  firstParameters.set("offset", "0");
  const first = await apiRequest<{ items: ModExportRegistryEntry[]; total: number }>(`${endpoint}?${firstParameters}`, {}, token);
  if (first.items.length >= first.total) return first.items;
  const items = [...first.items];
  const pageSize = 100;
  for (let batchStart = first.items.length; batchStart < first.total; batchStart += pageSize * 4) {
    const requests: Promise<{ items: ModExportRegistryEntry[] }>[] = [];
    for (let offset = batchStart; offset < Math.min(first.total, batchStart + pageSize * 4); offset += pageSize) {
      const pageParameters = new URLSearchParams(parameters);
      pageParameters.delete("all");
      pageParameters.set("limit", String(pageSize));
      pageParameters.set("offset", String(offset));
      requests.push(apiRequest<{ items: ModExportRegistryEntry[] }>(`${endpoint}?${pageParameters}`, {}, token));
    }
    const pages = await Promise.all(requests);
    pages.forEach((page) => items.push(...page.items));
  }
  return items;
}

async function hydrateRecipeLayouts(detail: ModExportEntryDetail, revisionId: string, token: string): Promise<ModExportEntryDetail> {
  const cache = new Map<string, Promise<Record<string, unknown> | null>>();
  const hydrate = async (recipe: Record<string, unknown>) => {
    if (record(recipe.jeiLayout).background) return recipe;
    const path = recipeLayoutPath(String(recipe.type || ""), String(recipe.id || ""));
    if (!path) return recipe;
    let request = cache.get(path);
    if (!request) {
      request = fetch(modExportAssetURL(revisionId, path), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
        .then(async (response) => response.ok ? record(await response.json()) : null)
        .catch(() => null);
      cache.set(path, request);
    }
    const layout = await request;
    return layout ? { ...recipe, jeiLayout: layout } : recipe;
  };
  return {
    ...detail,
    recipes: await Promise.all(detail.recipes.map(hydrate)),
    uses: await Promise.all(detail.uses.map(hydrate)),
  };
}

function recipeLayoutPath(recipeType: string, recipeId: string) {
  if (!recipeType || !recipeId) return "";
  const category = recipeType === "minecraft:smelting" ? "minecraft:furnace" : recipeType === "minecraft:campfire_cooking" ? "minecraft:campfire" : recipeType;
  const separator = category.indexOf(":");
  if (separator <= 0 || separator === category.length - 1) return "";
  return `recipes/jei/layouts/${category.slice(0, separator)}/${category.slice(separator + 1)}/${recipeId.replace(":", "__")}.json`;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function emptyEntryDetail(locale: string): ModExportEntryDetail { return { contentMarkdown: "", contentLocale: locale, modelAvailable: false, recipes: [], uses: [] }; }
function Loading() { const { t } = useI18n(); return <div className="grid min-h-64 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div>; }
