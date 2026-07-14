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
  ModExportTagDetail,
  saveModExportEntryContent,
} from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolsPlayground } from "./tools-playground";
import { IndexedHttpAssetSource } from "@/lib/mcmods-exporter/renderer";

const BlockModelCanvas = dynamic(() => import("@/components/mcmods-exporter/BlockModelCanvas").then((module) => module.BlockModelCanvas), { ssr: false });

type CategoryPageProps = { siteId: string; revisionId: string; categoryKey: string };
type EntryPageProps = CategoryPageProps & { entityId: string; registry: string; objectId: string };

export function ModExportCategoryPage({ siteId, revisionId, categoryKey }: CategoryPageProps) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [revision, setRevision] = useState<ModExportRevision>();
  const [entries, setEntries] = useState<ModExportRegistryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const category = useMemo(() => findModExportCategory(revision, categoryKey), [categoryKey, revision]);

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
    const params = new URLSearchParams({ all: "1", summary: "1", locale: minecraftLocale(locale) });
    if (category.documentKind) params.set("kind", category.documentKind);
    else if (!category.tags) params.set("registries", category.registries.join(","));
    loadAllModExportEntries(
      `/api/v1/export-revisions/${encodeURIComponent(revisionId)}/${category.tags ? "tags" : category.documentKind ? "document-entries" : "registry-entries"}`,
      params,
      token,
      (items) => { if (!cancelled) setEntries(items); },
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
	  {!revision || !category ? <Loading /> : category.key === "tags" ? <TagIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : category.key === "achievements" ? <AdvancementIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : category.key === "itemsBlocks" ? <DenseIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : category.key === "lootTables" ? <LootTableIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} /> : <CardIndex entries={filtered} locale={locale} revisionId={revisionId} siteId={siteId} categoryKey={categoryKey} />}
    </div>
  </main>;
}

function DenseIndex({ entries, ...props }: IndexProps) {
  const { t } = useI18n();
	const groups = [
		{ registry: "blocks", entries: entries.filter((entry) => entry.registry === "blocks") },
		{ registry: "items", entries: entries.filter((entry) => entry.registry === "items") },
	].filter((group) => group.entries.length);
  return <div className="mt-5 divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">{groups.map((group) => <section className="grid lg:grid-cols-[140px_minmax(0,1fr)]" key={group.registry}><h2 className="bg-[var(--panel-subtle)] p-4 font-black text-[var(--accent)]">{t(`mods.exportImport.registries.${group.registry}`)}</h2><div className="flex flex-wrap gap-x-3 gap-y-2 p-4">{group.entries.map((entry) => <EntryLink entry={entry} key={`${entry.registry}:${entry.id}`} {...props} compact />)}</div></section>)}</div>;
}

type IndexProps = CategoryPageProps & { entries: ModExportRegistryEntry[]; locale: string };

function TagIndex({ entries, revisionId, siteId, categoryKey }: IndexProps) {
  const { t } = useI18n();
  const groups = useMemo(() => {
    const grouped = new Map<string, ModExportRegistryEntry[]>();
    for (const entry of entries) grouped.set(entry.registry, [...(grouped.get(entry.registry) ?? []), entry]);
    return [...grouped.entries()];
  }, [entries]);
  return <div className="mt-5 space-y-4">{groups.map(([registry, registryEntries]) => <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]" key={registry}>
    <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><h2 className="break-all font-black">{registry}</h2><span className="text-sm text-[var(--muted)]">{t("mods.exportImport.tagCount", { count: registryEntries.length })}</span></header>
    <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{registryEntries.map((entry) => {
      const href = exportEntryHref(siteId, revisionId, categoryKey, entry);
      return <Link className="focus-ring flex min-w-0 items-center justify-between gap-3 bg-[var(--panel)] p-4 hover:bg-[var(--panel-subtle)]" href={href} key={`${entry.registry}:${entry.id}`} target="_blank" rel="noopener noreferrer"><code className="truncate font-bold text-[var(--accent)]">#{entry.id}</code><span className="shrink-0 text-sm text-[var(--muted)]">{t("mods.exportImport.memberCount", { count: numberValue(entry.data.memberCount, 0) })}</span></Link>;
    })}</div>
  </section>)}</div>;
}

function CardIndex({ entries, ...props }: IndexProps) {
  return <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{entries.map((entry) => <EntryLink entry={entry} key={`${entry.registry}:${entry.id}`} {...props} />)}</div>;
}

function LootTableIndex({ entries, revisionId, siteId, categoryKey }: IndexProps) {
	const { t } = useI18n();
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const timer = window.setInterval(() => setTick((current) => current + 1), 1000);
		return () => window.clearInterval(timer);
	}, []);
	const groups = useMemo(() => {
		const grouped = new Map<string, ModExportRegistryEntry[]>();
		for (const entry of entries) {
			const category = lootTableCategory(entry.data);
			grouped.set(category, [...(grouped.get(category) ?? []), entry]);
		}
		const order = ["blocks", "chests", "entities", "fishing", "archaeology", "equipment", "gameplay", "other"];
		return [...grouped.entries()].sort(([left], [right]) => order.indexOf(left) - order.indexOf(right));
	}, [entries]);
	return <div className="mt-5 space-y-5">{groups.map(([category, categoryEntries]) => <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]" key={category}>
		<header className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><h2 className="font-black">{t(`mods.exportImport.entry.loot.categories.${category}`)}</h2><span className="text-sm text-[var(--muted)]">{categoryEntries.length.toLocaleString()}</span></header>
		<div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{categoryEntries.map((entry) => {
			const href = exportEntryHref(siteId, revisionId, categoryKey, entry);
			const previews = arrayRecords(entry.data.previewResources);
			const preview = previews.length ? previews[tick % previews.length] : {};
			const sourceRevisionId = stringValue(preview.sourceRevisionId);
			const iconPath = stringValue(preview.iconPath);
			return <Link className="focus-ring flex min-h-20 min-w-0 items-center gap-3 bg-[var(--panel)] p-4 hover:bg-[var(--panel-subtle)]" href={href} key={entry.id} target="_blank" rel="noopener noreferrer">
				{sourceRevisionId && iconPath ? <Image unoptimized alt="" className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" height={40} width={40} src={modExportAssetURL(sourceRevisionId, iconPath)} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-xs font-black">LT</span>}
				<span className="min-w-0"><strong className="block truncate">{entry.id.split(":").pop()}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{entry.id}</code></span>
			</Link>;
		})}</div>
	</section>)}</div>;
}

function EntryLink({ entry, revisionId, siteId, categoryKey, locale, compact = false }: Omit<IndexProps, "entries"> & { entry: ModExportRegistryEntry; compact?: boolean }) {
  const name = localizedName(entry, locale);
  const href = exportEntryHref(siteId, revisionId, categoryKey, entry);
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

export function ModExportEntryPage(props: EntryPageProps) {
  return props.categoryKey === "tags" ? <ModExportTagEntryPage {...props} /> : <ModExportRegistryEntryPage {...props} />;
}

function ModExportTagEntryPage({ siteId, revisionId, categoryKey, entityId, registry, objectId }: EntryPageProps) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [detail, setDetail] = useState<ModExportTagDetail>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ registry, tagId: objectId, locale: minecraftLocale(locale) });
    if (entityId) params.set("entityId", entityId);
    apiRequest<ModExportTagDetail>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}/tag-detail?${params}`, {}, token)
      .then((result) => { if (!cancelled) setDetail(result); })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, locale, objectId, registry, revisionId, token]);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]"><article className="mx-auto max-w-[1500px]">
    <header className="border-b border-[var(--line)] pb-5"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(revisionId)}/${encodeURIComponent(categoryKey)}`}>{t("mods.exportImport.backToCategories")}</Link><p className="mt-3 text-sm font-bold text-[var(--muted)]">{registry}</p><h1 className="mt-1 break-all text-3xl font-black">#{objectId}</h1>{detail ? <p className="mt-2 text-[var(--muted)]">{t("mods.exportImport.memberCount", { count: detail.memberCount })}</p> : null}</header>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
    {!detail ? <Loading /> : detail.members.length ? <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{detail.members.map((member) => <TagMember key={member.id} member={member} locale={locale} revisionId={revisionId} siteId={siteId} />)}</div> : <p className="py-12 text-center text-[var(--muted)]">{t("mods.exportImport.noTagMembers")}</p>}
  </article></main>;
}

function TagMember({ member, locale, revisionId, siteId }: { member: ModExportTagDetail["members"][number]; locale: string; revisionId: string; siteId: string }) {
  const category = tagMemberCategory(member.registry);
  const content = <>{member.iconPath ? <Image unoptimized alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" height={32} width={32} src={modExportAssetURL(revisionId, member.iconPath)} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-[10px] font-bold text-[var(--muted)]">TAG</span>}<span className="min-w-0"><strong className="block truncate">{member.names[minecraftLocale(locale)] || member.names.en_us || member.names.zh_cn || member.id}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{member.id}</code></span></>;
  if (!category || !member.registry) return <div className="flex min-h-20 items-center gap-3 bg-[var(--panel)] p-4">{content}</div>;
  const href = exportEntryHref(siteId, revisionId, category, member);
  return <Link className="focus-ring flex min-h-20 items-center gap-3 bg-[var(--panel)] p-4 hover:bg-[var(--panel-subtle)]" href={href} target="_blank" rel="noopener noreferrer">{content}</Link>;
}

function tagMemberCategory(registry: string) {
  if (registry === "items" || registry === "blocks") return "itemsBlocks";
  if (registry === "entity_types") return "entities";
  if (registry === "enchantments") return "enchantments";
  if (registry === "mob_effects" || registry === "potions") return "buffs";
  if (registry === "biomes") return "biomes";
  if (registry === "fluids") return "fluids";
  return "";
}

function ModExportRegistryEntryPage({ siteId, revisionId, categoryKey, entityId, registry, objectId }: EntryPageProps) {
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
    const documentKind = documentRegistryKind(registry);
    const params = new URLSearchParams({ q: objectId, locale: normalized, limit: "100" });
    if (documentKind) params.set("kind", documentKind); else params.set("registries", registry);
    const detailRequest = getModExportEntryDetail(revisionId, registry, entityId, objectId, normalized, token)
      .catch((reason) => documentKind && reason instanceof ApiError && reason.status === 404
        ? emptyEntryDetail(normalized)
        : Promise.reject(reason));
    Promise.all([
      apiRequest<{ items: ModExportRegistryEntry[] }>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}/${documentKind ? "document-entries" : "registry-entries"}?${params}`, {}, token),
      detailRequest,
    ]).then(([list, nextDetail]) => {
      if (cancelled) return;
      const found = list.items.find((item) => entityId ? item.entityId === entityId : item.registry === registry && item.id === objectId);
      if (!found) throw new Error(t("mods.exportImport.noEntries"));
      setEntry(found); setDetail(nextDetail); setMarkdown(nextDetail.contentMarkdown || "");
      setModelPaths(nextDetail.modelAssetPaths || []);
    }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, normalized, objectId, registry, revisionId, t, token]);

  async function save() {
    setSaving(true); setError("");
    try {
      const result = await saveModExportEntryContent(siteId, registry, detail?.entityId || entityId, objectId, normalized, markdown, token);
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

  function show3D() {
    setDisplay3D(true);
  }

  if (!entry || !detail) return <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">{error ? <p className="mx-auto max-w-4xl rounded-lg border border-[var(--red)] p-4 text-[var(--red)]">{error}</p> : <Loading />}</main>;
  const name = localizedName(entry, locale);
  const display = record(entry.data.display);
  const documentDescription = localizedRecordValue(display.description_names, normalized);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]"><article className="mx-auto max-w-[1500px]">
    <header className="flex items-start gap-4 border-b border-[var(--line)] pb-5">{entry.iconPath ? <Image unoptimized alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" height={64} width={64} src={modExportAssetURL(revisionId, entry.iconPath)} /> : null}<div className="min-w-0 flex-1"><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(revisionId)}/${encodeURIComponent(categoryKey)}`}>← {t("mods.exportImport.backToCategories")}</Link><h1 className="mt-2 text-3xl font-black">{name}</h1><code className="block break-all text-sm text-[var(--muted)]">{entry.id}</code></div></header>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{error}</p> : null}
    <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0"><section><div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2"><h2 className="text-xl font-black">{t("mods.exportImport.entry.introduction")}</h2>{token ? <button className="button-secondary focus-ring" type="button" onClick={() => setEditing((current) => !current)}>{editing ? t("common.cancel") : t("mods.exportImport.entry.editIntroduction")}</button> : null}</div>{editing ? <div className="mt-4"><ToolsPlayground embedded editorTitle={name} value={markdown} onChange={setMarkdown} /><div className="mt-3 flex justify-end"><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></div></div> : detail.contentMarkdown ? <div className="markdown-preview mt-4"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="py-8 text-[var(--muted)]">{documentDescription || t("mods.exportImport.entry.noIntroduction")}</p>}</section>
	  {registry === "blocks" ? <BlockProperties data={entry.data} /> : null}
	  {registry === "loot_tables" ? <LootTableVisualizer data={entry.data} revisionId={revisionId} /> : null}
      {isTechnicalDocumentRegistry(registry) ? <details className="mt-7 border-t border-[var(--line)] pt-5"><summary className="cursor-pointer text-xl font-black">{t("mods.exportImport.entry.technicalData")}</summary><pre className="mt-4 max-h-[70vh] overflow-auto rounded-lg bg-[#111820] p-4 text-xs leading-6 text-slate-100">{JSON.stringify(entry.data, null, 2)}</pre></details> : null}
      {detail.recipes.length ? <RecipeGallery title={t("mods.exportImport.entry.recipes")} recipes={detail.recipes} revisionId={revisionId} /> : null}{detail.uses.length ? <RecipeGallery title={t("mods.exportImport.entry.uses")} recipes={detail.uses} revisionId={revisionId} /> : null}
    </div><aside className="lg:sticky lg:top-5 lg:self-start"><div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]"><div className="grid aspect-square place-items-center p-5">{display3D && modelSource ? <BlockModelCanvas assetSource={modelSource} blockId={entry.id} className="h-full w-full" /> : entry.previewPath || entry.iconPath ? <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={256} width={256} src={modExportAssetURL(revisionId, entry.previewPath || entry.iconPath)} /> : <strong className="text-[var(--muted)]">{entry.registry}</strong>}</div>{detail.modelAvailable ? <div className="grid grid-cols-2 border-t border-[var(--line)]"><button className={`focus-ring p-3 font-bold ${!display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => setDisplay3D(false)}>2D</button><button className={`focus-ring p-3 font-bold ${display3D ? "bg-[var(--accent)] text-white" : ""}`} type="button" onClick={() => void show3D()}>3D</button></div> : null}</div><dl className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm"><dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.entry.registry")}</dt><dd>{entry.registry}</dd><dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.entry.namespace")}</dt><dd>{entry.namespace}</dd></dl></aside></div>
  </article></main>;
}

function BlockProperties({ data }: { data: Record<string, unknown> }) {
	const { t } = useI18n();
	const rows = [
		["hardness", data.hardness],
		["explosionResistance", data.explosion_resistance],
		["requiresCorrectTool", data.requires_correct_tool],
		["preferredTools", data.preferred_tools],
		["miningTags", data.mining_tags],
		["tierTags", data.tier_tags],
		["lightEmission", data.light_emission],
		["friction", data.friction],
		["speedFactor", data.speed_factor],
		["jumpFactor", data.jump_factor],
		["pistonReaction", data.piston_reaction],
		["lootTable", data.loot_table],
	].filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0));
	if (!rows.length) return null;
	return <section className="mt-8 border-t border-[var(--line)] pt-5"><h2 className="text-xl font-black">{t("mods.exportImport.entry.blockProperties.title")}</h2><dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">{rows.map(([key, value]) => <div className="bg-[var(--panel)] p-4" key={String(key)}><dt className="text-sm font-bold text-[var(--muted)]">{t(`mods.exportImport.entry.blockProperties.${key}`)}</dt><dd className="mt-1 break-words font-semibold">{formatExportProperty(value, t)}</dd></div>)}</dl></section>;
}

function LootTableVisualizer({ data, revisionId }: { data: Record<string, unknown>; revisionId: string }) {
  const { t } = useI18n();
  const definition = record(data.definition);
  const pools = Array.isArray(definition.pools) ? definition.pools.map(record) : [];
  const references = Array.isArray(data.referenced_loot_tables) ? data.referenced_loot_tables.map(String) : [];
	const resourceSources = record(data.resourceSources);
  return <section className="mt-8 border-t border-[var(--line)] pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">{t("mods.exportImport.entry.loot.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("mods.exportImport.entry.loot.poolCount", { count: pools.length })}</p></div>{typeof definition.type === "string" ? <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs">{definition.type}</code> : null}</div>
	<div className="mt-4 grid gap-4">{pools.map((pool, index) => <LootPool key={index} index={index} pool={pool} revisionId={revisionId} resourceSources={resourceSources} />)}</div>
    {references.length ? <div className="mt-5"><h3 className="font-black">{t("mods.exportImport.entry.loot.references")}</h3><div className="mt-2 flex flex-wrap gap-2">{references.map((item) => <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs" key={item}>{item}</code>)}</div></div> : null}
  </section>;
}

function LootPool({ pool, index, revisionId, resourceSources }: { pool: Record<string, unknown>; index: number; revisionId: string; resourceSources: Record<string, unknown> }) {
  const { t } = useI18n();
  const entries = Array.isArray(pool.entries) ? pool.entries.map(record) : [];
  const conditions = Array.isArray(pool.conditions) ? pool.conditions.map(record) : [];
  const functions = Array.isArray(pool.functions) ? pool.functions.map(record) : [];
  return <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><h3 className="font-black">{t("mods.exportImport.entry.loot.pool", { number: index + 1 })}</h3><div className="flex flex-wrap gap-3 text-sm"><span>{t("mods.exportImport.entry.loot.rolls")}: <strong>{lootValue(pool.rolls)}</strong></span><span>{t("mods.exportImport.entry.loot.bonusRolls")}: <strong>{lootValue(pool.bonus_rolls)}</strong></span></div></header>
	<div className="divide-y divide-[var(--line)]">{entries.map((entry, entryIndex) => <LootEntry key={entryIndex} entry={entry} revisionId={revisionId} resourceSources={resourceSources} />)}</div>
    {entries.length === 0 ? <p className="p-4 text-sm text-[var(--muted)]">{t("mods.exportImport.entry.loot.noEntries")}</p> : null}
    <LootRules conditions={conditions} functions={functions} />
  </article>;
}

function LootEntry({ entry, revisionId, resourceSources, depth = 0 }: { entry: Record<string, unknown>; revisionId: string; resourceSources: Record<string, unknown>; depth?: number }) {
  const { t } = useI18n();
  const type = String(entry.type || "minecraft:unknown");
  const name = String(entry.name || entry.value || type);
  const item = type === "minecraft:item" && name.includes(":") ? name : "";
  const childrenValue = Array.isArray(entry.children) ? entry.children : Array.isArray(entry.entries) ? entry.entries : [];
  const children = childrenValue.map(record);
  const conditions = Array.isArray(entry.conditions) ? entry.conditions.map(record) : [];
  const functions = Array.isArray(entry.functions) ? entry.functions.map(record) : [];
	const source = item ? record(resourceSources[item]) : {};
	const sourceRevisionId = stringValue(source.sourceRevisionId) || revisionId;
	const sourceSiteId = stringValue(source.sourceModSiteId);
	const sourceRegistry = stringValue(source.sourceRegistry) || "items";
	const sourceEntityId = stringValue(source.entityId);
	const sourceObjectId = stringValue(source.sourceObjectId) || item;
	const iconPath = stringValue(source.iconPath);
	const icon = iconPath ? <Image unoptimized alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" height={32} width={32} src={modExportAssetURL(sourceRevisionId, iconPath)} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-xs font-black">{type.split(":").pop()?.slice(0, 2).toUpperCase()}</span>;
	const sourceCategory = exportCategoryForRegistry(sourceRegistry);
	const itemContent = item && sourceSiteId ? <Link className="focus-ring flex min-w-0 items-center gap-3 hover:text-[var(--accent)]" href={exportEntryHref(sourceSiteId, sourceRevisionId, sourceCategory, { entityId: sourceEntityId, registry: sourceRegistry, id: sourceObjectId })} target="_blank" rel="noopener noreferrer">{icon}<div className="min-w-0 flex-1"><strong className="block break-all">{name}</strong><code className="block break-all text-xs text-[var(--muted)]">{type}</code></div></Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{icon}<div className="min-w-0 flex-1"><strong className="block break-all">{name}</strong><code className="block break-all text-xs text-[var(--muted)]">{type}</code></div></div>;
  return <div className="px-4 py-3" style={{ paddingLeft: `${16 + depth * 24}px` }}>
	<div className="flex min-w-0 items-center gap-3">{itemContent}<div className="shrink-0 text-right text-xs text-[var(--muted)]">{entry.weight !== undefined ? <span className="block">{t("mods.exportImport.entry.loot.weight")}: {lootValue(entry.weight)}</span> : null}{entry.quality !== undefined ? <span className="block">{t("mods.exportImport.entry.loot.quality")}: {lootValue(entry.quality)}</span> : null}</div></div>
    <LootRules conditions={conditions} functions={functions} compact />
	{children.length ? <div className="mt-2 border-l border-[var(--line)]">{children.map((child, index) => <LootEntry depth={depth + 1} entry={child} key={index} revisionId={revisionId} resourceSources={resourceSources} />)}</div> : null}
  </div>;
}

function LootRules({ conditions, functions, compact = false }: { conditions: Record<string, unknown>[]; functions: Record<string, unknown>[]; compact?: boolean }) {
  const { t } = useI18n();
  if (!conditions.length && !functions.length) return null;
  return <div className={`${compact ? "mt-2" : "border-t border-[var(--line)] px-4 py-3"} flex flex-wrap gap-2 text-xs`}>{conditions.map((condition, index) => <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300" key={`c:${index}`} title={JSON.stringify(condition)}>{t("mods.exportImport.entry.loot.condition")}: {String(condition.condition || condition.predicate || "unknown")}</span>)}{functions.map((fn, index) => <span className="rounded bg-sky-500/10 px-2 py-1 text-sky-800 dark:text-sky-300" key={`f:${index}`} title={JSON.stringify(fn)}>{t("mods.exportImport.entry.loot.function")}: {String(fn.function || fn.type || "unknown")}</span>)}</div>;
}

function lootValue(value: unknown) {
  if (typeof value === "number" || typeof value === "string") return String(value);
  const provider = record(value);
  if (provider.min !== undefined || provider.max !== undefined) return `${String(provider.min ?? "?")}–${String(provider.max ?? "?")}`;
  return typeof provider.type === "string" ? provider.type : "0";
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
    {background ? <div className="overflow-auto bg-[#c6c6c6] p-3"><div className="relative mx-auto" style={{ width, height }}><Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={modExportAssetURL(revisionId, background)} />{!containsIngredients ? slots.map((value, index) => <ModRecipeSlot key={index} scale={scale} slot={record(value)} />) : null}</div></div> : <div className="grid min-h-32 place-items-center p-4 text-sm text-[var(--muted)]">{String(recipe.type || "Recipe")}</div>}
    <code className="block break-all border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">{String(recipe.id || recipe.type || "")}</code>
  </article>;
}

function ModRecipeSlot({ slot, scale }: { slot: Record<string, unknown>; scale: number }) {
  const rect = record(slot.rect);
  const alternatives = Array.isArray(slot.alternatives) ? slot.alternatives : [];
  const item = record(alternatives[0]);
  const itemId = stringValue(item.item) || stringValue(item.resource_location);
  const tagId = stringValue(slot.tag) || stringValue(item.tag);
  const tagEntityId = stringValue(slot.tagEntityId);
  const sourceRevisionId = stringValue(item.sourceRevisionId);
  const sourceSiteId = stringValue(item.sourceModSiteId);
  const sourceRegistry = stringValue(item.sourceRegistry) || "items";
  const sourceEntityId = stringValue(item.entityId);
  const sourceObjectId = stringValue(item.sourceObjectId) || itemId;
  const iconPath = stringValue(item.iconPath);
  const style = {
    left: numberValue(rect.x, 0) * scale,
    top: numberValue(rect.y, 0) * scale,
    width: numberValue(rect.width, 16) * scale,
    height: numberValue(rect.height, 16) * scale,
  };
  const content = iconPath && sourceRevisionId ? <Image unoptimized alt={itemId} className="h-full w-full object-contain [image-rendering:pixelated]" height={style.height} width={style.width} src={modExportAssetURL(sourceRevisionId, iconPath)} /> : <span className="grid h-full w-full place-items-center text-[10px] font-black">{tagId ? "#" : "?"}</span>;
  if (tagId) return <Link className="focus-ring absolute" href={`/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`} style={style} title={`#${tagId}`}>{content}</Link>;
  if (itemId && sourceSiteId && sourceRevisionId) {
    const href = exportEntryHref(sourceSiteId, sourceRevisionId, exportCategoryForRegistry(sourceRegistry), { entityId: sourceEntityId, registry: sourceRegistry, id: sourceObjectId });
    return <Link className="focus-ring absolute" href={href} style={style} target="_blank" rel="noopener noreferrer" title={itemId}>{content}</Link>;
  }
  return <span className="absolute" style={style}>{content}</span>;
}

function exportCategoryForRegistry(registry: string) {
  if (registry === "fluids") return "fluids";
  if (registry === "ingredients") return "industrialMedia";
  return "itemsBlocks";
}

function exportEntryHref(siteId: string, revisionId: string, category: string, entry: Pick<ModExportRegistryEntry, "entityId" | "registry" | "id">) {
  const params = new URLSearchParams({ registry: entry.registry, objectId: entry.id });
  if (entry.entityId) params.set("entityId", entry.entityId);
  return `/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(revisionId)}/${encodeURIComponent(category)}/entry?${params}`;
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
function lootTableCategory(data: Record<string, unknown>) {
	const category = stringValue(data.category).toLowerCase();
	const path = stringValue(data.path).toLowerCase();
	if (category === "blocks" || path.startsWith("blocks/")) return "blocks";
	if (category === "chests" || path.startsWith("chests/")) return "chests";
	if (category === "entities" || path.startsWith("entities/")) return "entities";
	if (path.includes("fishing") || category === "fishing") return "fishing";
	if (category === "archaeology" || path.startsWith("archaeology/")) return "archaeology";
	if (category === "equipment" || path.startsWith("equipment/")) return "equipment";
	if (category === "gameplay" || path.startsWith("gameplay/")) return "gameplay";
	return "other";
}
function arrayRecords(value: unknown) { return Array.isArray(value) ? value.map(record) : []; }
function formatExportProperty(value: unknown, t: (key: string, values?: Record<string, string | number>) => string) {
	if (typeof value === "boolean") return t(value ? "common.yes" : "common.no");
	if (Array.isArray(value)) return value.map(String).join(", ");
	if (value && typeof value === "object") return JSON.stringify(value);
	return String(value);
}
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
async function loadAllModExportEntries(endpoint: string, parameters: URLSearchParams, token: string, onProgress?: (items: ModExportRegistryEntry[]) => void) {
  const firstParameters = new URLSearchParams(parameters);
  firstParameters.delete("all");
  firstParameters.set("limit", "100");
  firstParameters.set("offset", "0");
  const first = await apiRequest<{ items: ModExportRegistryEntry[]; total: number }>(`${endpoint}?${firstParameters}`, {}, token);
  onProgress?.(first.items);
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
    onProgress?.([...items]);
  }
  return items;
}

function documentRegistryKind(registry: string) {
  return ["advancements", "key_mappings", "biomes", "dimensions", "natural_generation", "world_structures", "loot_tables", "ingredients", "worldgen_data"].includes(registry) ? registry : "";
}
function isTechnicalDocumentRegistry(registry: string) {
  return documentRegistryKind(registry) !== "" && registry !== "advancements" && registry !== "key_mappings";
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function emptyEntryDetail(locale: string): ModExportEntryDetail { return { entityId: "", publicId: "", contentMarkdown: "", contentLocale: locale, modelAvailable: false, modelAssetPaths: [], recipes: [], uses: [] }; }
function Loading() { const { t } = useI18n(); return <div className="grid min-h-64 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div>; }
