"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  catalogAssetURL,
  catalogQueryLocales,
  contentLocales,
  GlobalRecipe,
  GlobalRecipeType,
  GlobalRecipeTypeDetail,
  GlobalResource,
  GlobalTag,
  GlobalTagDetail,
  loadGlobalRecipeTypeDetail,
  loadGlobalRecipeTypes,
  loadGlobalTagDetail,
  loadGlobalTags,
  localizedCatalogName,
  RecipeCatalyst,
} from "../_lib/global-catalog-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { RecipeResourceVisual, recipeSlotPresentation } from "./recipe-resource-slot";
import { ToolsPlayground } from "./tools-playground";

const pageSize = 24;

export function ModTagCatalog() {
	const searchParams = useSearchParams();
	const registry = searchParams.get("registry") || "";
	const tagId = searchParams.get("tagId") || "";
	const entityId = searchParams.get("entityId") || "";
	return registry && tagId ? <ModTagDetail entityId={entityId} registry={registry} tagId={tagId} /> : <ModTagList />;
}

function ModTagList() {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<{ items: GlobalTag[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: searchParams.get("q") || "", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalTags(params, token).then((value) => { if (!cancelled) { setResult(value); setError(""); } })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [page, searchParams, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    router.push(`/mods-tag${next.size ? `?${next}` : ""}`);
  }

  return <CatalogFrame active="tags" description={t("globalCatalog.tags.description")} title={t("globalCatalog.tags.title")}>
    <CatalogToolbar query={query} placeholder={t("globalCatalog.tags.search")} onQuery={setQuery} onSubmit={search} />
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((tag) => <TagCard key={`${tag.registry}:${tag.tagId}`} locale={locale} tag={tag} />)}</div>
    {!error && !result.items.length ? <Empty text={t("globalCatalog.tags.empty")} /> : null}
    <CatalogPagination base="/mods-tag" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function TagCard({ tag, locale }: { tag: GlobalTag; locale: string }) {
  const { t } = useI18n();
  const preview = useRotatingValue(tag.previews);
  const href = `/mods-tag?entityId=${encodeURIComponent(tag.entityId)}&registry=${encodeURIComponent(tag.registry)}&tagId=${encodeURIComponent(tag.tagId)}`;
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={href}>
    <ResourceIcon resource={preview} size={56} />
    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[var(--muted)]">{tag.registry}</span><strong className="mt-1 block break-all text-lg">#{tag.tagId}</strong><span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.memberCount", { count: tag.memberCount })}{preview ? ` / ${localizedCatalogName(preview.names, locale, preview.id)}` : ""}</span></span>
  </Link>;
}

function ModTagDetail({ entityId, registry, tagId }: { entityId: string; registry: string; tagId: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [detail, setDetail] = useState<GlobalTagDetail>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [memberText, setMemberText] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ registry, tagId, ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (entityId) params.set("entityId", entityId);
    loadGlobalTagDetail(params, token).then((value) => { if (!cancelled) { setDetail(value); setMarkdown(value.contentMarkdown); setError(""); } })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, locale, page, registry, tagId, token]);

  async function beginEdit() {
    if (!detail) return;
    setEditing(true);
    setMarkdown(detail.contentMarkdown);
    try {
      const ids: string[] = [];
      for (let offset = 0; offset < detail.memberCount; offset += 200) {
        const params = new URLSearchParams({ registry, tagId, ...catalogQueryLocales(locale), limit: "200", offset: String(offset) });
        if (detail.entityId) params.set("entityId", detail.entityId);
        const value = await loadGlobalTagDetail(params, token);
        ids.push(...value.members.map((member) => member.id));
      }
      setMemberText([...new Set(ids)].join("\n"));
    } catch (reason) { setError(errorText(reason)); }
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const memberIds = uniqueLines(memberText);
      const response = await apiRequest<{ status: string }>("/api/v1/mod-tags/detail", { method: "PUT", body: JSON.stringify({ entityId: detail?.entityId || entityId, registry, tagId, locale: catalogQueryLocales(locale).locale, contentMarkdown: markdown, memberIds }) }, token);
      setEditing(false);
      if (response.status === "approved") setDetail((current) => current ? { ...current, contentMarkdown: markdown, memberCount: memberIds.length } : current);
      else setError(t("globalCatalog.reviewPending"));
    } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); }
  }

  if (!detail) return <CatalogFrame active="tags" description={registry} title={`#${tagId}`}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  return <CatalogFrame active="tags" description={`${registry} / ${t("globalCatalog.memberCount", { count: detail.memberCount })}`} title={`#${tagId}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href="/mods-tag">{t("globalCatalog.backToTags")}</Link>{user ? <button className="button-secondary focus-ring" type="button" onClick={() => editing ? setEditing(false) : void beginEdit()}>{editing ? t("common.cancel") : t("common.edit")}</button> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    {editing ? <div className="mt-5 grid gap-5"><ToolsPlayground embedded editorTitle={`#${tagId}`} value={markdown} onChange={setMarkdown} /><label className="grid gap-2 font-bold">{t("globalCatalog.tags.membersEditor")}<textarea className="field min-h-52 font-mono text-sm" value={memberText} onChange={(event) => setMemberText(event.target.value)} /></label><div className="flex justify-end"><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></div></div> : <section className="mt-5"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2>{detail.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p>}</section>}
    <section className="mt-8"><h2 className="text-xl font-black">{t("globalCatalog.tags.items")}</h2><div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">{detail.members.map((member) => <GlobalResourceLink key={`${member.registry}:${member.id}`} locale={locale} resource={member} />)}</div></section>
    <CatalogPagination base={`/mods-tag?entityId=${encodeURIComponent(detail.entityId)}&registry=${encodeURIComponent(registry)}&tagId=${encodeURIComponent(tagId)}`} page={page} query="" total={detail.memberCount} queryMode />
  </CatalogFrame>;
}

export function RecipeTypeCatalog() {
	const searchParams = useSearchParams();
	const id = searchParams.get("id") || "";
	const entityId = searchParams.get("entityId") || "";
	return id ? <RecipeTypeDetail entityId={entityId} id={id} /> : <RecipeTypeList />;
}

function RecipeTypeList() {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<{ items: GlobalRecipeType[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: searchParams.get("q") || "", ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalRecipeTypes(params, token).then((value) => { if (!cancelled) { setResult(value); setError(""); } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [locale, page, searchParams, token]);
  function search(event: FormEvent) { event.preventDefault(); const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim()); router.push(`/recipe-types${params.size ? `?${params}` : ""}`); }
  return <CatalogFrame active="recipes" description={t("globalCatalog.recipeTypes.description")} title={t("globalCatalog.recipeTypes.title")}>
    <CatalogToolbar query={query} placeholder={t("globalCatalog.recipeTypes.search")} onQuery={setQuery} onSubmit={search} />
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((item) => <RecipeTypeCard item={item} key={item.recipeTypeId} locale={locale} />)}</div>
    <CatalogPagination base="/recipe-types" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function RecipeTypeCard({ item, locale }: { item: GlobalRecipeType; locale: string }) {
  const { t } = useI18n();
  const catalyst = useRotatingValue(item.catalysts);
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={`/recipe-types?entityId=${encodeURIComponent(item.entityId)}&id=${encodeURIComponent(item.recipeTypeId)}`}><CatalystIcon catalyst={catalyst} size={56} /><span className="min-w-0"><strong className="block text-lg">{localizedCatalogName(item.names, locale, item.recipeTypeId)}</strong><code className="mt-1 block break-all text-xs text-[var(--muted)]">{item.recipeTypeId}</code><span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.recipeCount", { count: item.recipeCount })}</span></span></Link>;
}

function RecipeTypeDetail({ entityId, id }: { entityId: string; id: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [detail, setDetail] = useState<GlobalRecipeTypeDetail>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [catalysts, setCatalysts] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ id, ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (entityId) params.set("entityId", entityId);
    loadGlobalRecipeTypeDetail(params, token).then((value) => { if (!cancelled) { setDetail(value); setMarkdown(value.contentMarkdown); setCatalysts(value.catalysts.map(catalystID).filter(Boolean).join("\n")); setError(""); } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, id, locale, page, token]);
  async function save() {
    setSaving(true); setError("");
    try {
      const payload = { entityId: detail?.entityId || entityId, recipeTypeId: id, locale: catalogQueryLocales(locale).locale, contentMarkdown: markdown, catalysts: uniqueLines(catalysts).map((item) => ({ type: "item_stack", item, resource_location: item, count: 1 })) };
      const response = await apiRequest<{ status: string }>("/api/v1/recipe-types/detail", { method: "PUT", body: JSON.stringify(payload) }, token);
      setEditing(false); if (response.status !== "approved") setError(t("globalCatalog.reviewPending"));
    } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); }
  }
  if (!detail) return <CatalogFrame active="recipes" description={id} title={id}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  return <CatalogFrame active="recipes" description={id} title={localizedCatalogName(detail.names, locale, id)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href="/recipe-types">{t("globalCatalog.backToRecipeTypes")}</Link>{user ? <button className="button-secondary focus-ring" type="button" onClick={() => setEditing((value) => !value)}>{editing ? t("common.cancel") : t("common.edit")}</button> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    {editing ? <div className="mt-5 grid gap-5"><ToolsPlayground embedded editorTitle={id} value={markdown} onChange={setMarkdown} /><label className="grid gap-2 font-bold">{t("globalCatalog.recipeTypes.catalystsEditor")}<textarea className="field min-h-36 font-mono text-sm" value={catalysts} onChange={(event) => setCatalysts(event.target.value)} /></label><div className="flex justify-end"><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></div></div> : <><section className="mt-5"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2>{detail.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p>}</section><section className="mt-7"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.catalysts")}</h2><div className="mt-3 flex flex-wrap gap-2">{detail.catalysts.map((item) => <CatalystChip catalyst={item} key={catalystID(item)} locale={locale} />)}</div></section></>}
    <section className="mt-8"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.recipes")}</h2><div className="mt-4 grid gap-5 xl:grid-cols-2">{detail.recipes.map((recipe) => <GlobalRecipeCard key={recipe.recipeKey} recipe={recipe} />)}</div></section>
    <CatalogPagination base={`/recipe-types?entityId=${encodeURIComponent(detail.entityId)}&id=${encodeURIComponent(id)}`} page={page} query="" total={detail.total} queryMode />
  </CatalogFrame>;
}

function GlobalRecipeCard({ recipe }: { recipe: GlobalRecipe }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const layout = recipe.layout || {};
  const slots = Array.isArray(layout.slots) ? layout.slots.map(record).filter((slot) => slot.ingredient_present !== false && slot.coordinates_available !== false) : [];
  const background = typeof layout.background === "string" ? layout.background : "";
  const canvas = record(layout.canvas);
  const displayScale = 2;
  const width = numberValue(canvas.width, 185) * displayScale;
  const height = numberValue(canvas.height, 93) * displayScale;
  const contains = layout.background_contains_ingredients === true;
  const sourceMod = typeof layout.source_mod_id === "string" ? layout.source_mod_id : "";
  const sourceVersion = typeof layout.source_mod_version === "string" ? layout.source_mod_version : "";
  const inputs = slots.filter((slot) => slot.role === "input");
  const totalMaterials = inputs.reduce((total, slot) => { const item = record((Array.isArray(slot.alternatives) ? slot.alternatives : [])[0]); return total + numberValue(item.amount ?? item.count, 1); }, 0);
  const layoutKind = typeof layout.layout_kind === "string" ? layout.layout_kind : "unknown";
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(recipe.note || "");
  const [layoutText, setLayoutText] = useState(JSON.stringify(layout, null, 2));
  const [error, setError] = useState("");
  async function save() { try { const layoutOverride = JSON.parse(layoutText); await apiRequest(`/api/v1/recipes/${encodeURIComponent(recipe.recipeKey)}`, { method: "PUT", body: JSON.stringify({ recipeKey: recipe.recipeKey, note, layoutOverride }) }, token); setEditing(false); } catch (reason) { setError(errorText(reason)); } }
  return <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]"><header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><code className="truncate font-bold">{recipe.recipeId}</code><span className="rounded bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold">{t(`globalCatalog.recipeLayoutKinds.${layoutKind}`)}</span></div><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]"><code>{recipe.recipeIdSource}</code><span>{recipe.recipeIdCanonical ? t("globalCatalog.canonicalRecipeId") : t("globalCatalog.packageScopedRecipeId")}</span>{sourceMod ? <code>{sourceMod}{sourceVersion ? `@${sourceVersion}` : ""}</code> : null}</span></div>{user ? <button className="button-secondary focus-ring px-3 py-1.5 text-sm" type="button" onClick={() => setEditing((value) => !value)}>{t("common.edit")}</button> : null}</header>
    {editing ? <div className="grid gap-3 p-4"><textarea className="field min-h-56 font-mono text-xs" value={layoutText} onChange={(event) => setLayoutText(event.target.value)} /><textarea className="field min-h-20" placeholder={t("globalCatalog.recipeNote")} value={note} onChange={(event) => setNote(event.target.value)} />{error ? <ErrorBox text={error} /> : null}<button className="button-primary focus-ring justify-self-end" type="button" onClick={() => void save()}>{t("common.save")}</button></div> : <div className="grid md:grid-cols-[120px_minmax(0,1fr)_150px]"><aside className="grid place-items-center border-b border-[var(--line)] p-4 text-center md:border-b-0 md:border-r"><div><strong className="text-3xl">{totalMaterials}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{t("globalCatalog.materialCount")}</span></div></aside><div className="overflow-auto bg-[#c6c6c6] p-4"><div className="relative mx-auto" style={{ width, height }}>{background ? <Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={catalogAssetURL(recipe.revisionId, background)} /> : null}{slots.map((slot, index) => <RecipeSlot canvasWidth={width} key={index} locale={locale} scale={displayScale} showVisual={!contains} slot={slot} />)}{slots.map((slot, index) => <GlobalRecipeChanceLabel key={`chance:${index}`} locale={locale} scale={displayScale} slot={slot} />)}</div></div><aside className="border-t border-[var(--line)] p-4 md:border-l md:border-t-0"><strong className="text-sm">{t("globalCatalog.recipeNote")}</strong><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{recipe.note || t("globalCatalog.noNote")}</p></aside></div>}
  </article>;
}

function GlobalRecipeChanceLabel({ slot, scale, locale }: { slot: Record<string, unknown>; scale: number; locale: string }) {
  if (slot.chance_available !== true) return null;
  const texts = record(slot.chance_texts);
  const preferredLocale = contentLocales(locale).primary;
  const percent = numberValue(slot.chance_percent, numberValue(slot.chance, Number.NaN) * 100);
  const chanceText = typeof texts[preferredLocale] === "string"
    ? texts[preferredLocale] as string
    : typeof slot.chance_text === "string" && slot.chance_text
      ? slot.chance_text
      : Number.isFinite(percent)
        ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`
        : "";
  if (!chanceText) return null;
  const badgeText = Number.isFinite(percent) ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%` : chanceText;
  const rect = record(slot.rect);
  const x = numberValue(rect.x, 0) + numberValue(rect.width, 16) / 2;
  const y = numberValue(rect.y, 0) + numberValue(rect.height, 16);
  return <span className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded bg-[#242424] px-1 py-0.5 text-[9px] font-black leading-none text-white shadow" style={{ left: x * scale, top: y * scale }} title={chanceText}>{badgeText}</span>;
}

function RecipeSlot({ slot, scale, locale, canvasWidth, showVisual }: { slot: Record<string, unknown>; scale: number; locale: string; canvasWidth: number; showVisual: boolean }) {
  const alternatives = Array.isArray(slot.alternatives) ? slot.alternatives.map(record) : [];
  const item = useRotatingValue(alternatives);
  if (!item) return null;
  const itemId = String(item.item || item.resource_location || "");
  const tagId = typeof slot.tag === "string" ? slot.tag : typeof item.tag === "string" ? item.tag : "";
  const sourceRevisionId = typeof item.sourceRevisionId === "string" ? item.sourceRevisionId : "";
  const sourceModSiteId = typeof item.sourceModSiteId === "string" ? item.sourceModSiteId : "";
  const sourceRegistry = typeof item.sourceRegistry === "string" ? item.sourceRegistry : "items";
  const sourceEntityId = typeof item.entityId === "string" ? item.entityId : "";
  const sourcePublicId = typeof item.publicId === "string" ? item.publicId : "";
  const sourceObjectId = typeof item.sourceObjectId === "string" ? item.sourceObjectId : itemId;
  const iconPath = typeof item.iconPath === "string" ? item.iconPath : "";
  const tagEntityId = typeof slot.tagEntityId === "string" ? slot.tagEntityId : "";
  const resourceId = tagId ? `#${tagId}` : itemId;
  const displayName = tagId ? resourceId : localizedCatalogName(recordStrings(item.names), locale, itemId);
  const presentation = recipeSlotPresentation(slot, item, scale);
  const src = iconPath && sourceRevisionId ? catalogAssetURL(sourceRevisionId, iconPath) : "";
  const content = <RecipeResourceVisual canvasWidth={canvasWidth} fallback={tagId ? "#" : "?"} name={displayName} presentation={presentation} resourceId={resourceId} showVisual={showVisual} src={src} />;
  const label = `${displayName || resourceId} (${resourceId})`;
  const slotClass = "group focus-ring absolute z-10 hover:z-40 focus-visible:z-40";
  if (tagId) return <Link aria-label={label} className={slotClass} href={`/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`} style={presentation.style}>{content}</Link>;
  if (itemId && sourceRevisionId && sourceModSiteId) return <Link aria-label={label} className={slotClass} href={resourceHref({ entityId: sourceEntityId, publicId: sourcePublicId, id: sourceObjectId, registry: sourceRegistry, names: {}, revisionId: sourceRevisionId, modSiteId: sourceModSiteId, iconPath })} target="_blank" style={presentation.style}>{content}</Link>;
  return <span aria-label={label} className="group absolute z-10 hover:z-40 focus-visible:z-40" style={presentation.style} tabIndex={resourceId ? 0 : undefined}>{content}</span>;
}

function CatalogFrame({ active, title, description, children }: { active: "tags" | "recipes"; title: string; description: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1600px]"><header className="border-b border-[var(--line)] pb-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">{t("globalCatalog.kicker")}</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 max-w-3xl text-[var(--muted)]">{description}</p></div><nav className="flex rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1"><Link className={`rounded-md px-4 py-2 font-bold ${active === "tags" ? "bg-[var(--accent)] text-white" : ""}`} href="/mods-tag">{t("globalCatalog.tags.short")}</Link><Link className={`rounded-md px-4 py-2 font-bold ${active === "recipes" ? "bg-[var(--accent)] text-white" : ""}`} href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link></nav></div></header>{children}</div></main>;
}

function CatalogToolbar({ query, placeholder, onQuery, onSubmit }: { query: string; placeholder: string; onQuery: (value: string) => void; onSubmit: (event: FormEvent) => void }) { const { t } = useI18n(); return <form className="mt-5 flex gap-2" onSubmit={onSubmit}><input className="field h-11 min-w-0 flex-1" type="search" placeholder={placeholder} value={query} onChange={(event) => onQuery(event.target.value)} /><button className="button-primary focus-ring" type="submit">{t("globalCatalog.searchAction")}</button></form>; }
function GlobalResourceLink({ resource, locale }: { resource: GlobalResource; locale: string }) {
  const content = <><ResourceIcon resource={resource} size={40} /><span className="min-w-0"><strong className="block truncate">{localizedCatalogName(resource.names, locale, resource.id)}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{resource.id}</code></span></>;
  if (!resource.entityId || !resource.revisionId || !resource.modSiteId) return <div className="flex min-h-20 items-center gap-3 bg-[var(--panel)] p-4">{content}</div>;
  return <Link className="focus-ring flex min-h-20 items-center gap-3 bg-[var(--panel)] p-4 hover:bg-[var(--panel-subtle)]" href={resourceHref(resource)} target="_blank">{content}</Link>;
}
function ResourceIcon({ resource, size }: { resource?: GlobalResource; size: number }) { const src = resource ? catalogAssetURL(resource.revisionId, resource.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)]" style={{ width: size, height: size }}>TAG</span>; }
function CatalystIcon({ catalyst, size }: { catalyst?: RecipeCatalyst; size: number }) { const src = catalyst ? catalogAssetURL(catalyst.revisionId, catalyst.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black" style={{ width: size, height: size }}>GUI</span>; }
function CatalystChip({ catalyst, locale }: { catalyst: RecipeCatalyst; locale: string }) { return <span className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><CatalystIcon catalyst={catalyst} size={32} /><span className="font-bold">{localizedCatalogName(catalyst.names, locale, catalystID(catalyst))}</span></span>; }
function CatalogPagination({ base, page, total, query, queryMode = false }: { base: string; page: number; total: number; query: string; queryMode?: boolean }) { const { t } = useI18n(); const pages = Math.max(1, Math.ceil(total / pageSize)); if (pages <= 1) return null; const href = (next: number) => { const separator = queryMode || base.includes("?") ? "&" : "?"; const queryPart = query ? `${separator}q=${encodeURIComponent(query)}&page=${next}` : `${separator}page=${next}`; return `${base}${queryPart}`; }; return <nav className="mt-7 flex items-center justify-center gap-3"><Link className={`button-secondary focus-ring ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={href(Math.max(1, page - 1))}>{t("globalCatalog.previous")}</Link><span className="text-sm font-bold text-[var(--muted)]">{page} / {pages}</span><Link className={`button-secondary focus-ring ${page >= pages ? "pointer-events-none opacity-40" : ""}`} href={href(Math.min(pages, page + 1))}>{t("globalCatalog.next")}</Link></nav>; }
function useRotatingValue<T>(values: T[] | undefined) { const [index, setIndex] = useState(0); useEffect(() => { if (!values || values.length <= 1) return; const timer = window.setInterval(() => setIndex((value) => (value + 1) % values.length), 1000); return () => window.clearInterval(timer); }, [values]); return values?.[index % Math.max(1, values.length)]; }
function resourceHref(resource: GlobalResource) { return `/mods/${encodeURIComponent(resource.modSiteId)}/data/${encodeURIComponent(resource.revisionId)}/itemsBlocks/entry?entityId=${encodeURIComponent(resource.entityId)}&registry=${encodeURIComponent(resource.registry || "items")}&objectId=${encodeURIComponent(resource.id)}`; }
function catalystID(value: RecipeCatalyst) { return value.item || value.resource_location || ""; }
function uniqueLines(value: string) { return [...new Set(value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean))]; }
function positivePage(value: string | null) { const parsed = Number.parseInt(value || "1", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function recordStrings(value: unknown): Record<string, string> { const source = record(value); return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string")); }
function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function ErrorBox({ text }: { text: string }) { return <p className="mt-4 rounded-lg border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_7%,transparent)] p-3 font-bold text-[var(--red)]">{text}</p>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">{text}</div>; }
function Loading() { const { t } = useI18n(); return <div className="grid min-h-72 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div>; }
