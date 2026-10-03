"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { loadCatalogTagForEditing } from "../_lib/catalog-editor-api";
import { resolveAvailableLocalization } from "../_lib/content-language";
import { loadRecipe, loadRecipeTemplate, loadRecipeTemplates } from "../_lib/recipe-editor-api";
import type { CatalogResourceRef, CatalogResourceVersion, LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import type { RecipeEditorLabels } from "./editor/recipe-editor";
import type { RecipeTemplateEditorLabels } from "./editor/recipe-template-editor";
import {
  catalogAssetURL,
  catalogDirectAssetURL,
  catalogQueryLocales,
  GlobalRecipeType,
  GlobalRecipeTypeCatalog,
  GlobalResource,
  GlobalTag,
  loadGlobalRecipeTypeCatalog,
  loadGlobalRecipeTypes,
  loadGlobalTags,
  localizedCatalogName,
  RecipeCatalyst,
} from "../_lib/global-catalog-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { CatalogRecipeTypeEditor, CatalogTagEditor } from "./catalog-manual-editors";
import { LoginRequiredState } from "./page-feedback";
import { LocalizationStatusBadge } from "./editor/localization-status-badge";
import { RecipeEditor } from "./editor/recipe-editor";
import { RecipeTemplateEditor } from "./editor/recipe-template-editor";
import { ContentTranslationControl } from "./editor/content-translation-control";
import { CommentSection } from "./comment-section";
import { GlobalRecipeCard } from "./global-recipe-card";
import { useRotatingValue } from "./rotating-resource";

const pageSize = 24;

export function ModTagCatalog() {
  const { token, user } = useAuthSnapshot();
  const { locale } = useI18n();
  const scope = `${user?.id || "guest"}:${token || "guest"}`;
	const searchParams = useSearchParams();
	const editor = searchParams.get("editor") || "";
	const publicId = searchParams.get("publicId") || "";
	if (editor === "create") return <CatalogTagEditor mode="create" />;
	if (editor === "edit" && publicId) return <CatalogTagEditor mode="edit" publicId={publicId} />;
	if (publicId) return <CanonicalTagDetail key={`${scope}:${publicId}:${locale}`} publicId={publicId} />;
  const canonicalId = searchParams.get("tagId") || "";
  if (canonicalId) return <ResolveCanonicalCatalogRoute key={`${scope}:tag:${canonicalId}:${searchParams.get("registry") || "minecraft:item"}`} kind="tag" canonicalId={canonicalId} registry={searchParams.get("registry") || "minecraft:item"} />;
	return <ModTagList key={`${scope}:${searchParams.get("q") || ""}`} />;
}

function ModTagList() {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const queryString = searchParams.toString();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<{ items: GlobalTag[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const currentQuery = new URLSearchParams(queryString);
    const params = new URLSearchParams({ q: currentQuery.get("q") || "", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalTags(params, token).then((value) => { if (!cancelled) { setResult(value); setError("");
      const lastPage = Math.max(1, Math.ceil(value.total / pageSize));
      if (page > lastPage) {
        const next = new URLSearchParams(queryString);
        if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
        router.replace(`${location.pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      } } })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [page, queryString, ready, router, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    router.push(`/mods-tag${next.size ? `?${next}` : ""}`);
  }

  return <CatalogFrame active="tags" description={t("globalCatalog.tags.description")} title={t("globalCatalog.tags.title")}>
    <div className="mt-5 flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><CatalogToolbar compact query={query} placeholder={t("globalCatalog.tags.search")} onQuery={setQuery} onSubmit={search} /></div>{user ? <Link className="button-primary focus-ring" href="/mods-tag?editor=create">{t("catalogEditor.tagCreate")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((tag) => <TagCard key={tag.publicId} locale={locale} tag={tag} />)}</div>
    {!error && !result.items.length ? <Empty text={t("globalCatalog.tags.empty")} /> : null}
    <GlobalCatalogPagination base="/mods-tag" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function TagCard({ tag, locale }: { tag: GlobalTag; locale: string }) {
  const { t } = useI18n();
  const preview = useRotatingValue(tag.previews);
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={`/mods-tag?publicId=${encodeURIComponent(tag.publicId)}`}>
    <ResourceIcon resource={preview} size={56} />
    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[var(--muted)]">{tag.registry}</span><strong className="mt-1 block break-all text-lg">{tag.name || `#${tag.canonicalId}`}</strong>{tag.name ? <code className="mt-1 block break-all text-xs text-[var(--muted)]">#{tag.canonicalId}</code> : null}<span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.memberCount", { count: tag.memberCount })}{preview ? ` / ${localizedCatalogName(preview.names, locale, preview.id)}` : ""}</span></span>
  </Link>;
}

export function RecipeTypeCatalog() {
  const { token, user } = useAuthSnapshot();
  const { locale } = useI18n();
  const scope = `${user?.id || "guest"}:${token || "guest"}`;
	const searchParams = useSearchParams();
	const editor = searchParams.get("editor") || "";
	const publicId = searchParams.get("publicId") || "";
	const templatePublicId = searchParams.get("templatePublicId") || "";
	const recipePublicId = searchParams.get("recipePublicId") || "";
	if (editor === "template-create" && publicId) return <CatalogRecipeTemplateEditorRoute key={`${scope}:${publicId}:create`} recipeTypePublicId={publicId} />;
	if (editor === "template-edit" && publicId && templatePublicId) return <CatalogRecipeTemplateEditorRoute key={`${scope}:${publicId}:${templatePublicId}`} recipeTypePublicId={publicId} templatePublicId={templatePublicId} />;
	if (editor === "recipe-create" && publicId) return <CatalogRecipeEditorRoute key={`${scope}:${publicId}:create`} recipeTypePublicId={publicId} />;
	if (editor === "recipe-edit" && publicId && recipePublicId) return <CatalogRecipeEditorRoute key={`${scope}:${publicId}:${recipePublicId}`} recipePublicId={recipePublicId} recipeTypePublicId={publicId} />;
  if (editor === "recipe-edit" && recipePublicId) return <ResolveRecipeEditorRoute key={`${scope}:${recipePublicId}`} recipePublicId={recipePublicId} />;
	if (editor === "create") return <CatalogRecipeTypeEditor mode="create" />;
	if (editor === "edit" && publicId) return <CatalogRecipeTypeEditor mode="edit" publicId={publicId} />;
	if (publicId) return <RecipeTypeDetail publicId={publicId} key={`${scope}:${publicId}:${locale}`} />;
  const canonicalId = searchParams.get("id") || "";
  if (canonicalId) return <ResolveCanonicalCatalogRoute key={`${scope}:recipe-type:${canonicalId}`} kind="recipe-type" canonicalId={canonicalId} />;
	return <RecipeTypeList key={`${scope}:${searchParams.get("q") || ""}`} />;
}

// Exported data retains canonical Minecraft identifiers. Resolve them through
// exact, visibility-filtered server queries before navigating to public IDs.
function ResolveCanonicalCatalogRoute({ kind, canonicalId, registry = "" }: { kind: "tag" | "recipe-type"; canonicalId: string; registry?: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const failedMessage = useEffectEvent(() => t("catalogEditor.loadFailed"));
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const exact = new URLSearchParams({ canonicalId, limit: "2", offset: "0" });
    if (kind === "tag") exact.set("registry", registry);
    const request = kind === "tag"
      ? loadGlobalTags(exact, token, controller.signal)
      : loadGlobalRecipeTypes(exact, token, controller.signal);
    request.then(page => {
      if (controller.signal.aborted) return;
      const matches = page.items.filter(item => item.canonicalId === canonicalId && (kind !== "tag" || "registry" in item && item.registry === registry));
      if (page.total !== 1 || matches.length !== 1 || !matches[0].publicId) throw new Error(failedMessage());
      const next = new URLSearchParams(query);
      next.set("publicId", matches[0].publicId);
      next.delete(kind === "tag" ? "tagId" : "id");
      if (kind === "tag") next.delete("registry");
      next.delete("page");
      router.replace(`${kind === "tag" ? "/mods-tag" : "/recipe-types"}?${next}`, { scroll: false });
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [attempt, canonicalId, kind, query, ready, registry, router, token]);
  return <CatalogFrame active={kind === "tag" ? "tags" : "recipes"} description={canonicalId} title={t(kind === "tag" ? "globalCatalog.tags.title" : "globalCatalog.recipeTypes.title")}>
    {error ? <><ErrorBox text={error} /><button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>{t("common.retry")}</button></> : <Loading />}
  </CatalogFrame>;
}

// Imported recipe cards identify the recipe itself. Resolve its authoritative
// type ID instead of treating a Minecraft canonical identifier as a public ID.
function ResolveRecipeEditorRoute({ recipePublicId }: { recipePublicId: string }) {
  const { ready, token, user } = useAuthSnapshot();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready || !user || !token) return;
    const controller = new AbortController();
    loadRecipe(recipePublicId, token, controller.signal).then((recipe) => {
      if (controller.signal.aborted) return;
      if (!recipe?.recipeTypePublicId) throw new Error(t("catalogEditor.loadFailed"));
      const next = new URLSearchParams(query);
      next.set("publicId", recipe.recipeTypePublicId);
      next.delete("id");
      router.replace(`/recipe-types?${next}`, { scroll: false });
    }).catch((reason) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [attempt, query, ready, recipePublicId, router, t, token, user]);
  return <CatalogFrame active="recipes" description={recipePublicId} title={t("catalogEditor.recipeEdit")}>
    {!ready ? <Loading /> : !user ? <LoginRequiredState compact nextPath={`/recipe-types?${query}`} description={t("catalogEditor.loginRequired")} /> : error ? <><ErrorBox text={error} /><button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>{t("common.retry")}</button></> : <Loading />}
  </CatalogFrame>;
}

function CanonicalTagDetail({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadCatalogTagForEditing>>>();
  const [resolvedLocalization, setResolvedLocalization] = useState<LocalizationVersion<LocalizedContentFields>>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadCatalogTagForEditing(publicId, token, locale).then((value) => {
      if (!cancelled) { setDetail(value); setError(""); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorText(reason));
    });
    return () => { cancelled = true; };
  }, [locale, publicId, token]);
  if (!detail) return <CatalogFrame active="tags" description={publicId} title={publicId}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  const localization = resolvedLocalization ?? resolveAvailableLocalization(detail.localizations, locale, "", detail.defaultLocale) ?? emptyCatalogLocalization(detail.defaultLocale);
  const title = localization?.fields.name || `#${detail.canonicalId}`;
  return <CatalogFrame active="tags" description={`${detail.registry} / ${t("globalCatalog.memberCount", { count: detail.members.length })}`} title={title}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
      <Link className="font-bold text-[var(--accent)] hover:underline" href="/mods-tag">{t("globalCatalog.backToTags")}</Link>
      {user ? <Link className="button-secondary focus-ring" href={`/mods-tag?editor=edit&publicId=${encodeURIComponent(publicId)}`}>{t("common.edit")}</Link> : null}
    </div>
    <section className="mt-5"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2><LocalizationStatusBadge version={localization} /></div><ContentTranslationControl publicId={publicId} onResolved={setResolvedLocalization} />{localization?.fields.summary ? <p className="mt-3 text-base leading-7 text-[var(--muted)]">{localization.fields.summary}</p> : null}{localization?.fields.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.fields.contentMarkdown} /></div> : !localization?.fields.summary ? <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p> : null}</section>
    <section className="mt-8"><h2 className="text-xl font-black">{t("globalCatalog.tags.items")}</h2><div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">{detail.members.map((member) => <GlobalResourceLink key={member.publicId} locale={locale} resource={catalogRefToGlobalResource(member)} />)}</div></section>
    <CommentSection targetKey={publicId} targetType="tag" />
  </CatalogFrame>;
}

function RecipeTypeList() {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const queryString = searchParams.toString();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<{ items: GlobalRecipeType[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const currentQuery = new URLSearchParams(queryString);
    const params = new URLSearchParams({ q: currentQuery.get("q") || "", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalRecipeTypes(params, token).then((value) => { if (!cancelled) { setResult(value); setError("");
      const lastPage = Math.max(1, Math.ceil(value.total / pageSize));
      if (page > lastPage) {
        const next = new URLSearchParams(queryString);
        if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
        router.replace(`${location.pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      } } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [page, queryString, ready, router, token]);
  function search(event: FormEvent) { event.preventDefault(); const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim()); router.push(`/recipe-types${params.size ? `?${params}` : ""}`); }
  return <CatalogFrame active="recipes" description={t("globalCatalog.recipeTypes.description")} title={t("globalCatalog.recipeTypes.title")}>
    <div className="mt-5 flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><CatalogToolbar compact query={query} placeholder={t("globalCatalog.recipeTypes.search")} onQuery={setQuery} onSubmit={search} /></div>{user ? <Link className="button-primary focus-ring" href="/recipe-types?editor=create">{t("catalogEditor.recipeTypeCreate")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((item) => <RecipeTypeCard item={item} key={item.publicId} locale={locale} />)}</div>
    <GlobalCatalogPagination base="/recipe-types" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function RecipeTypeCard({ item, locale }: { item: GlobalRecipeType; locale: string }) {
  const { t } = useI18n();
  const catalyst = useRotatingValue(item.catalysts);
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={`/recipe-types?publicId=${encodeURIComponent(item.publicId)}`}><CatalystIcon catalyst={catalyst} size={56} /><span className="min-w-0"><strong className="block text-lg">{localizedCatalogName(item.names, locale, item.canonicalId)}</strong><code className="mt-1 block break-all text-xs text-[var(--muted)]">{item.canonicalId}</code><span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.recipeCount", { count: item.recipeCount })}{typeof item.templateCount === "number" ? ` · ${t("catalogEditor.templateCount", { count: item.templateCount })}` : ""}</span></span></Link>;
}

function CatalogRecipeTemplateEditorRoute({ recipeTypePublicId, templatePublicId = "" }: { recipeTypePublicId: string; templatePublicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const { initialValue, loading, error } = useScopedRecipeEditorRecord(templatePublicId, recipeTypePublicId, token, loadRecipeTemplate, t("catalogEditor.loadFailed"));
  const title = t(templatePublicId ? "catalogEditor.templateEdit" : "catalogEditor.templateCreate");
  if (!ready) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (!user) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><LoginRequiredState compact nextPath={`/recipe-types?editor=${templatePublicId ? "template-edit" : "template-create"}&publicId=${encodeURIComponent(recipeTypePublicId)}${templatePublicId ? `&templatePublicId=${encodeURIComponent(templatePublicId)}` : ""}`} description={t("catalogEditor.loginRequired")} /></CatalogFrame>;
  if (loading) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (error || templatePublicId && !initialValue) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><ErrorBox text={error || t("catalogEditor.loadFailed")} /></CatalogFrame>;
  return <CatalogFrame active="recipes" description={t("catalogEditor.templateDescription")} title={title}>
    <div className="mb-5 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href={`/recipe-types?publicId=${encodeURIComponent(recipeTypePublicId)}`}>{t("globalCatalog.backToRecipeTypes")}</Link></div>
    <RecipeTemplateEditor
      defaultLocale={locale}
      initialValue={initialValue}
      labels={recipeTemplateLabels(t)}
      recipeTypePublicId={recipeTypePublicId}
      token={token}
      onDeleted={(result) => { if (result.reviewStatus === "approved") router.replace(`/recipe-types?publicId=${encodeURIComponent(recipeTypePublicId)}`); }}
      onSaved={(result) => {
        if (!templatePublicId && result.reviewStatus === "approved" && result.objectPublicId) router.replace(`/recipe-types?editor=template-edit&publicId=${encodeURIComponent(recipeTypePublicId)}&templatePublicId=${encodeURIComponent(result.objectPublicId)}`);
      }}
    />
  </CatalogFrame>;
}

function CatalogRecipeEditorRoute({ recipeTypePublicId, recipePublicId = "" }: { recipeTypePublicId: string; recipePublicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const closeOnComplete = useSearchParams().get("closeOnComplete") === "1";
  const { initialValue, loading, error } = useScopedRecipeEditorRecord(recipePublicId, recipeTypePublicId, token, loadRecipe, t("catalogEditor.loadFailed"));
  const title = t(recipePublicId ? "catalogEditor.recipeEdit" : "catalogEditor.recipeCreate");
  if (!ready) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (!user) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><LoginRequiredState compact nextPath={`/recipe-types?editor=${recipePublicId ? "recipe-edit" : "recipe-create"}&publicId=${encodeURIComponent(recipeTypePublicId)}${recipePublicId ? `&recipePublicId=${encodeURIComponent(recipePublicId)}` : ""}`} description={t("catalogEditor.loginRequired")} /></CatalogFrame>;
  if (loading) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (error || recipePublicId && !initialValue) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><ErrorBox text={error || t("catalogEditor.loadFailed")} /></CatalogFrame>;
  const seed = initialValue ?? { recipeTypePublicId, templatePublicId: "", applicableVersionIds: [], canonicalSourceId: "", definition: {}, bindings: {}, defaultLocale: locale };
  const returnHref = `/recipe-types?publicId=${encodeURIComponent(recipeTypePublicId)}`;
  const finishEditing = () => {
    if (!closeOnComplete) {
      router.replace(returnHref);
      return;
    }
    window.close();
    window.setTimeout(() => {
      if (!window.closed) router.replace(returnHref);
    }, 100);
  };
  return <CatalogFrame active="recipes" description={t("catalogEditor.recipeDescription")} title={title}>
    <div className="mb-5 border-b border-[var(--line)] pb-3">{closeOnComplete ? <button className="font-bold text-[var(--accent)] hover:underline" type="button" onClick={finishEditing}>{t("globalCatalog.backToRecipeTypes")}</button> : <Link className="font-bold text-[var(--accent)] hover:underline" href={returnHref}>{t("globalCatalog.backToRecipeTypes")}</Link>}</div>
    <RecipeEditor
      defaultLocale={locale}
      initialValue={seed}
      labels={recipeEditorLabels(t)}
      token={token}
      onCancel={finishEditing}
      onDeleted={(result) => {
        if (closeOnComplete || result.reviewStatus === "approved") finishEditing();
      }}
      onSaved={(result) => {
        if (closeOnComplete) {
          finishEditing();
          return;
        }
        if (!recipePublicId && result.reviewStatus === "approved" && result.objectPublicId) router.replace(`/recipe-types?editor=recipe-edit&publicId=${encodeURIComponent(recipeTypePublicId)}&recipePublicId=${encodeURIComponent(result.objectPublicId)}`);
      }}
    />
  </CatalogFrame>;
}

function useScopedRecipeEditorRecord<T extends { recipeTypePublicId: string }>(
  publicId: string,
  recipeTypePublicId: string,
  token: string,
  load: (publicId: string, token: string, signal?: AbortSignal) => Promise<T | undefined>,
  loadFailed: string,
) {
  const [initialValue, setInitialValue] = useState<T>();
  const [loading, setLoading] = useState(Boolean(publicId));
  const [error, setError] = useState("");
  const failureMessage = useEffectEvent(() => loadFailed);
  useEffect(() => {
    if (!publicId || !token) return;
    let cancelled = false;
    const controller = new AbortController();
    load(publicId, token, controller.signal).then((value) => {
      if (cancelled) return;
      const valid = value?.recipeTypePublicId === recipeTypePublicId;
      setInitialValue(valid ? value : undefined);
      setError(valid ? "" : failureMessage());
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [load, publicId, recipeTypePublicId, token]);
  return { initialValue, loading, error };
}

type CatalogTranslator = (key: string, params?: Record<string, string | number>) => string;

function recipeTemplateLabels(t: CatalogTranslator): RecipeTemplateEditorLabels {
  return {
    localization: t("catalogEditor.editLanguage"),
    localizedName: t("catalogEditor.localizedName"),
    localizedSummary: t("catalogEditor.summary"),
    localizedDescription: t("catalogEditor.contentMarkdown"),
    invariantSettings: t("catalogEditor.invariantFields"),
    templateKey: t("catalogEditor.templateKey"),
    background: t("catalogEditor.background"),
    uploadBackground: t("catalogEditor.uploadBackground"),
    uploadingBackground: t("catalogEditor.uploadingBackground"),
    removeBackground: t("catalogEditor.removeBackground"),
    canvas: t("catalogEditor.canvas"),
    canvasWidth: t("catalogEditor.canvasWidth"),
    canvasHeight: t("catalogEditor.canvasHeight"),
    imageScale: t("catalogEditor.imageScale"),
    slotPalette: t("catalogEditor.slotPalette"),
    roleInput: t("catalogEditor.roleInput"),
    roleOutput: t("catalogEditor.roleOutput"),
    roleCatalyst: t("catalogEditor.roleCatalyst"),
    addSlotHint: t("catalogEditor.addSlotHint"),
    slots: t("catalogEditor.slots"),
    emptySlots: t("catalogEditor.emptySlots"),
    slotKey: t("catalogEditor.slotKey"),
    slotRole: t("catalogEditor.slotRole"),
    outputIndex: t("catalogEditor.outputIndex"),
    x: t("catalogEditor.x"),
    y: t("catalogEditor.y"),
    width: t("catalogEditor.width"),
    height: t("catalogEditor.height"),
    removeSlot: t("catalogEditor.removeSlot"),
    changeReason: t("catalogEditor.changeReason"),
    save: t("common.save"),
    saving: t("common.saving"),
    delete: t("catalogEditor.archive"),
    deleting: t("catalogEditor.archiving"),
    deleteConfirm: t("catalogEditor.archiveConfirm"),
    deleted: t("catalogEditor.savedApproved"),
    saved: t("catalogEditor.savedApproved"),
    reviewPending: t("catalogEditor.savedPending"),
    validationSummary: t("catalogEditor.validationSummary"),
    required: t("catalogEditor.required"),
    duplicateSlotKey: t("catalogEditor.duplicateSlotKey"),
    invalidCanvas: t("catalogEditor.invalidCanvas"),
    slotOutsideCanvas: t("catalogEditor.slotOutsideCanvas"),
    invalidSlotSize: t("catalogEditor.invalidSlotSize"),
    invalidOutputIndex: t("catalogEditor.invalidOutputIndex"),
    outputIndexOnly: t("catalogEditor.outputIndexOnly"),
    uploadFailed: t("catalogEditor.uploadFailed"),
    saveFailed: t("catalogEditor.saveFailed"),
    deleteFailed: t("catalogEditor.deleteFailed"),
  };
}

function recipeEditorLabels(t: CatalogTranslator): RecipeEditorLabels {
  return {
    localization: t("catalogEditor.editLanguage"),
    localizedName: t("catalogEditor.localizedName"),
    localizedNote: t("globalCatalog.recipeNote"),
    invariantSettings: t("catalogEditor.invariantFields"),
    recipeType: t("globalCatalog.recipeTypes.title"),
    selectRecipeType: t("catalogEditor.selectRecipeType"),
    loadingRecipeTypes: t("catalogEditor.loadingRecipeTypes"),
    noRecipeTypes: t("catalogEditor.noRecipeTypes"),
    sourceVersion: t("catalogEditor.sourceVersion"),
    sourceVersionHint: t("catalogEditor.sourceVersionHint"),
    noSourceVersion: t("catalogEditor.noSourceVersion"),
    loadingSourceVersions: t("catalogEditor.loadingSourceVersions"),
    noSourceVersions: t("catalogEditor.noSourceVersions"),
    template: t("catalogEditor.templates"),
    selectTemplate: t("catalogEditor.selectTemplate"),
    loadingTemplates: t("catalogEditor.loadingTemplates"),
    noTemplates: t("catalogEditor.noTemplates"),
    canonicalSourceId: t("catalogEditor.canonicalSourceId"),
    definition: t("catalogEditor.definition"),
    canvas: t("catalogEditor.canvas"),
    selectSlotHint: t("catalogEditor.selectSlotHint"),
    slotInput: t("catalogEditor.roleInput"),
    slotOutput: t("catalogEditor.roleOutput"),
    slotCatalyst: t("catalogEditor.roleCatalyst"),
    selectedSlot: t("catalogEditor.selectedSlot"),
    noSelectedSlot: t("catalogEditor.noSelectedSlot"),
    candidates: t("catalogEditor.candidates"),
    chooseResources: t("catalogEditor.chooseResources"),
    clearResources: t("common.clear"),
    amount: t("catalogEditor.amount"),
    probabilityPercent: t("catalogEditor.probabilityPercent"),
    byproduct: t("catalogEditor.byproduct"),
    outputCandidateHint: t("catalogEditor.outputCandidateHint"),
    removeCandidate: t("catalogEditor.removeResource"),
    changeReason: t("catalogEditor.changeReason"),
    cancel: t("common.cancel"),
    save: t("common.save"),
    saving: t("common.saving"),
    delete: t("catalogEditor.archive"),
    deleting: t("catalogEditor.archiving"),
    deleteConfirm: t("catalogEditor.archiveConfirm"),
    deleted: t("catalogEditor.savedApproved"),
    saved: t("catalogEditor.savedApproved"),
    reviewPending: t("catalogEditor.savedPending"),
    validationSummary: t("catalogEditor.validationSummary"),
    required: t("catalogEditor.required"),
    invalidDefinition: t("catalogEditor.invalidDefinition"),
    invalidAmount: t("catalogEditor.invalidAmount"),
    invalidProbability: t("catalogEditor.invalidProbability"),
    missingOutput: t("catalogEditor.missingOutput"),
    loadFailed: t("catalogEditor.loadFailed"),
    saveFailed: t("catalogEditor.saveFailed"),
    deleteFailed: t("catalogEditor.deleteFailed"),
    resourcePicker: {
      title: t("catalogEditor.recipeResourcePickerTitle"),
      description: t("catalogEditor.recipeResourcePickerDescription"),
      searchPlaceholder: t("catalogEditor.resourceSearch"),
      empty: t("catalogEditor.noResources"),
      selected: t("catalogEditor.selectedResources"),
      remove: t("catalogEditor.removeResource"),
    },
  };
}

function RecipeTypeDetail({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = positivePage(searchParams.get("page"));
  const [detail, setDetail] = useState<GlobalRecipeTypeCatalog>();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof loadRecipeTemplates>>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalRecipeTypeCatalog(publicId, params, token).then((value) => { if (!cancelled) { setDetail(value); setError("");
      const lastPage = Math.max(1, Math.ceil(value.total / pageSize));
      if (page > lastPage) {
        const next = new URLSearchParams(searchParams.toString());
        if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
        router.replace(`/recipe-types?${next}`, { scroll: false });
      }
    } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [locale, page, publicId, router, searchParams, token]);
  const recipeTypePublicId = detail?.publicId || "";
  useEffect(() => {
    if (!recipeTypePublicId) return;
    let cancelled = false;
    const controller = new AbortController();
    loadRecipeTemplates(recipeTypePublicId, token, controller.signal).then((items) => {
      if (!cancelled) { setTemplates(items); setTemplateError(""); }
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setTemplateError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setTemplatesLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [recipeTypePublicId, token]);
  if (!detail) return <CatalogFrame active="recipes" description={publicId} title={publicId}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  const templateCount = templatesLoading ? detail.templateCount ?? 0 : templates.length;
  return <CatalogFrame active="recipes" description={detail.canonicalId} title={localizedCatalogName(detail.names, locale, detail.canonicalId)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href="/recipe-types">{t("globalCatalog.backToRecipeTypes")}</Link>{user && detail.publicId ? <Link className="button-secondary focus-ring" href={`/recipe-types?editor=edit&publicId=${encodeURIComponent(detail.publicId)}`}>{t("common.edit")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <section className="mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2><span className="rounded-md bg-[var(--panel-subtle)] px-3 py-1.5 text-sm font-bold">{t("catalogEditor.templateCount", { count: templateCount })}</span></div>{detail.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p>}</section>
    <section className="mt-7"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.catalysts")}</h2><div className="mt-3 flex flex-wrap gap-2">{detail.catalysts.map((item) => <CatalystChip catalyst={item} key={catalystID(item)} locale={locale} />)}</div></section>
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("catalogEditor.templates")}</h2>{user ? <Link className="button-primary focus-ring" href={`/recipe-types?editor=template-create&publicId=${encodeURIComponent(detail.publicId)}`}>{t("catalogEditor.templateCreate")}</Link> : null}</div>
      {templateError ? <ErrorBox text={templateError} /> : null}
      {templatesLoading ? <Loading /> : templates.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" key={template.publicId || template.templateKey}><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate font-mono">{template.templateKey}</strong><span className="mt-2 block text-sm text-[var(--muted)]">{template.canvas.width} × {template.canvas.height} / {t("catalogEditor.slotCount", { count: template.slotCount ?? 0 })}</span></div>{user && template.publicId ? <Link className="button-secondary focus-ring shrink-0 px-3 py-1.5 text-sm" href={`/recipe-types?editor=template-edit&publicId=${encodeURIComponent(detail.publicId)}&templatePublicId=${encodeURIComponent(template.publicId)}`}>{t("common.edit")}</Link> : null}</div></article>)}</div> : <Empty text={t("catalogEditor.noTemplates")} />}
    </section>
    <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.recipes")}</h2>{user && templates.length ? <Link className="button-primary focus-ring" href={`/recipe-types?editor=recipe-create&publicId=${encodeURIComponent(detail.publicId)}`}>{t("catalogEditor.recipeCreate")}</Link> : null}</div><div className="mt-4 grid items-start gap-5 xl:grid-cols-2">{detail.recipes.map((recipe) => <div id={`recipe-${recipe.publicId}`} key={recipe.publicId}><GlobalRecipeCard editHref={user && detail.publicId && recipe.publicId ? `/recipe-types?editor=recipe-edit&publicId=${encodeURIComponent(detail.publicId)}&recipePublicId=${encodeURIComponent(recipe.publicId)}` : undefined} recipe={recipe} /></div>)}</div></section>
    <GlobalCatalogPagination base={`/recipe-types?publicId=${encodeURIComponent(detail.publicId)}`} page={page} query="" total={detail.total} queryMode />
    <CommentSection targetKey={detail.publicId} targetType="recipe_type" />
  </CatalogFrame>;
}

function CatalogFrame({ active, title, description, children }: { active: "tags" | "recipes"; title: string; description: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1600px]"><header className="border-b border-[var(--line)] pb-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">{t("globalCatalog.kicker")}</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 max-w-3xl text-[var(--muted)]">{description}</p></div><nav className="flex flex-wrap rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1"><Link className={`rounded-md px-4 py-2 font-bold ${active === "tags" ? "bg-[var(--accent)] text-[var(--on-accent)]" : ""}`} href="/mods-tag">{t("globalCatalog.tags.short")}</Link><Link className={`rounded-md px-4 py-2 font-bold ${active === "recipes" ? "bg-[var(--accent)] text-[var(--on-accent)]" : ""}`} href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link></nav></div></header>{children}</div></main>;
}

function CatalogToolbar({ query, placeholder, onQuery, onSubmit, compact = false }: { query: string; placeholder: string; onQuery: (value: string) => void; onSubmit: (event: FormEvent) => void; compact?: boolean }) { const { t } = useI18n(); return <form className={`${compact ? "" : "mt-5"} flex gap-2`} onSubmit={onSubmit}><input className="field h-11 min-w-0 flex-1" type="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => onQuery(event.target.value)} /><button className="button-primary focus-ring" type="submit">{t("globalCatalog.searchAction")}</button></form>; }
function GlobalResourceLink({ resource, locale }: { resource: GlobalResource; locale: string }) {
  const { t } = useI18n();
  const versions = Array.isArray(resource.versions) ? resource.versions : [];
  const matchingVersionIndex = versions.findIndex((version) => version.revisionId === resource.revisionId);
  const initialIndex = Math.max(0, matchingVersionIndex >= 0
    ? matchingVersionIndex
    : versions.findIndex((version) => version.hasDetail));
  const [versionIndex, setVersionIndex] = useState(initialIndex);
  const activeVersionIndex = versions.length ? Math.min(versionIndex, versions.length - 1) : 0;
  const version = versions[activeVersionIndex];
  const displayed = version ? resourceAtVersion(resource, version) : resource;
  const content = <><ResourceIcon resource={displayed} size={48} /><span className="min-w-0 flex-1"><strong className="block truncate">{localizedCatalogName(displayed.names, locale, displayed.id)}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{displayed.id}</code>{version ? <span className={`mt-1 block truncate text-xs font-bold ${version.hasDetail ? "text-[var(--muted)]" : "text-[var(--red)]"}`}>{version.label}</span> : null}</span></>;
  const linked = displayed.publicId && displayed.detailUrl
    ? <Link className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-md p-2 hover:bg-[var(--panel-subtle)]" href={displayed.detailUrl} target="_blank" rel="noopener noreferrer">{content}</Link>
    : <div className="flex min-w-0 flex-1 items-center gap-3 p-2" title={version && !version.hasDetail ? t("globalCatalog.versionNoDetail") : undefined}>{content}</div>;
  return <article className="min-h-28 bg-[var(--panel)] p-2">
    <div className="flex items-center gap-1">
      {versions.length > 1 ? <button aria-label={t("globalCatalog.previousVersion")} className="focus-ring grid h-8 w-7 shrink-0 place-items-center rounded hover:bg-[var(--panel-subtle)]" type="button" onClick={() => setVersionIndex((value) => (value - 1 + versions.length) % versions.length)}>‹</button> : null}
      {linked}
      {versions.length > 1 ? <button aria-label={t("globalCatalog.nextVersion")} className="focus-ring grid h-8 w-7 shrink-0 place-items-center rounded hover:bg-[var(--panel-subtle)]" type="button" onClick={() => setVersionIndex((value) => (value + 1) % versions.length)}>›</button> : null}
    </div>
    {versions.length ? <div className="mt-1 flex gap-1 overflow-x-auto px-2 pb-1">{versions.map((item, index) => <button className={`focus-ring shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${index === activeVersionIndex ? "bg-[var(--accent)] text-[var(--on-accent)]" : item.hasDetail ? "bg-[var(--panel-subtle)] text-[var(--foreground)]" : "bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]"}`} key={item.publicId} type="button" onClick={() => setVersionIndex(index)}>{item.label}</button>)}</div> : null}
  </article>;
}
function ResourceIcon({ resource, size }: { resource?: GlobalResource; size: number }) { const src = resource ? catalogDirectAssetURL(resource.iconUrl) || catalogAssetURL(resource.revisionId, resource.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)]" style={{ width: size, height: size }}>TAG</span>; }
function CatalystIcon({ catalyst, size }: { catalyst?: RecipeCatalyst; size: number }) { const src = catalyst ? catalogDirectAssetURL(catalyst.iconUrl) || catalogAssetURL(catalyst.revisionId, catalyst.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black" style={{ width: size, height: size }}>GUI</span>; }
function CatalystChip({ catalyst, locale }: { catalyst: RecipeCatalyst; locale: string }) { return <span className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><CatalystIcon catalyst={catalyst} size={32} /><span className="font-bold">{localizedCatalogName(catalyst.names, locale, catalystID(catalyst))}</span></span>; }
function GlobalCatalogPagination({ base, page, total, query, queryMode = false }: { base: string; page: number; total: number; query: string; queryMode?: boolean }) { const { t } = useI18n(); const pages = Math.max(1, Math.ceil(total / pageSize)); if (pages <= 1) return null; const href = (next: number) => { const separator = queryMode || base.includes("?") ? "&" : "?"; const queryPart = query ? `${separator}q=${encodeURIComponent(query)}&page=${next}` : `${separator}page=${next}`; return `${base}${queryPart}`; }; return <nav className="mt-7 flex items-center justify-center gap-3"><Link className={`button-secondary focus-ring ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={href(Math.max(1, page - 1))}>{t("globalCatalog.previous")}</Link><span className="text-sm font-bold text-[var(--muted)]">{page} / {pages}</span><Link className={`button-secondary focus-ring ${page >= pages ? "pointer-events-none opacity-40" : ""}`} href={href(Math.min(pages, page + 1))}>{t("globalCatalog.next")}</Link></nav>; }
function resourceAtVersion(resource: GlobalResource, version: CatalogResourceVersion): GlobalResource { return { ...resource, registry: version.registry || resource.registry, names: Object.keys(version.names).length ? version.names : resource.names, revisionId: version.revisionId, modSiteId: version.modSiteId || resource.modSiteId, iconPath: version.iconPath, iconUrl: version.iconUrl, detailUrl: version.detailUrl, versions: resource.versions }; }
function catalogRefToGlobalResource(resource: CatalogResourceRef): GlobalResource { return { publicId: resource.publicId, id: resource.id, registry: resource.registry, names: resource.names, revisionId: "", modSiteId: resource.source?.siteId || "", iconPath: "", iconUrl: resource.iconUrl, versions: resource.versions ?? [] }; }
function catalystID(value: RecipeCatalyst) { return value.id; }
function positivePage(value: string | null) { const parsed = Number(value || "1"); return Number.isSafeInteger(parsed) && parsed > 0 && Number.isSafeInteger((parsed - 1) * pageSize) ? parsed : 1; }
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function emptyCatalogLocalization(locale: string) { return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human" as const, reviewStatus: "approved" as const, editable: true }; }
function ErrorBox({ text }: { text: string }) { return <p className="mt-4 rounded-lg border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_7%,transparent)] p-3 font-bold text-[var(--red)]">{text}</p>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">{text}</div>; }
function Loading() { const { t } = useI18n(); return <div className="grid min-h-72 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div>; }
