"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { loadCatalogTagForEditing } from "../_lib/catalog-editor-api";
import { resolveAvailableLocalization } from "../_lib/content-language";
import { loadRecipe, loadRecipeTemplate, loadRecipeTemplates } from "../_lib/recipe-editor-api";
import type { ResolvedCatalogFields } from "../_lib/editor-api";
import type { LocalizationVersion } from "../_lib/editor-types";
import type { CatalogResourceRef, CatalogResourceVersion } from "../_lib/editor-types";
import type { RecipeEditorLabels } from "./editor/recipe-editor";
import type { RecipeTemplateEditorLabels } from "./editor/recipe-template-editor";
import {
  catalogAssetURL,
  catalogDirectAssetURL,
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
import { CatalogRecipeTypeEditor, CatalogTagEditor } from "./catalog-manual-editors";
import { LocalizationStatusBadge } from "./editor/localization-status-badge";
import { RecipeEditor } from "./editor/recipe-editor";
import { RecipeTemplateEditor } from "./editor/recipe-template-editor";
import { ContentTranslationControl } from "./editor/content-translation-control";
import { recipeIngredientMergeKey, UnifiedRecipeCard, UnifiedRecipeMaterial } from "./unified-recipe-card";
import { CommentSection } from "./comment-section";
import { RecipeEditLink } from "./recipe-edit-link";
import { useRotatingValue } from "./rotating-resource";

const pageSize = 24;

export function ModTagCatalog() {
	const searchParams = useSearchParams();
	const editor = searchParams.get("editor") || "";
	const publicId = searchParams.get("publicId") || "";
	const registry = searchParams.get("registry") || "";
	const tagId = searchParams.get("tagId") || "";
	const entityId = searchParams.get("entityId") || "";
	if (editor === "create") return <CatalogTagEditor mode="create" />;
	if (editor === "edit" && publicId) return <CatalogTagEditor mode="edit" publicId={publicId} />;
	if (publicId) return <CanonicalTagDetail publicId={publicId} />;
	return registry && tagId ? <ModTagDetail entityId={entityId} registry={registry} tagId={tagId} /> : <ModTagList />;
}

function ModTagList() {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
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
    <div className="mt-5 flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><CatalogToolbar compact query={query} placeholder={t("globalCatalog.tags.search")} onQuery={setQuery} onSubmit={search} /></div>{user ? <Link className="button-primary focus-ring" href="/mods-tag?editor=create">{t("catalogEditor.tagCreate")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((tag) => <TagCard key={`${tag.registry}:${tag.tagId}`} locale={locale} tag={tag} />)}</div>
    {!error && !result.items.length ? <Empty text={t("globalCatalog.tags.empty")} /> : null}
    <CatalogPagination base="/mods-tag" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function TagCard({ tag, locale }: { tag: GlobalTag; locale: string }) {
  const { t } = useI18n();
  const preview = useRotatingValue(tag.previews);
  const href = tag.publicId ? `/mods-tag?publicId=${encodeURIComponent(tag.publicId)}` : `/mods-tag?entityId=${encodeURIComponent(tag.entityId)}&registry=${encodeURIComponent(tag.registry)}&tagId=${encodeURIComponent(tag.tagId)}`;
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={href}>
    <ResourceIcon resource={preview} size={56} />
    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[var(--muted)]">{tag.registry}</span><strong className="mt-1 block break-all text-lg">{tag.name || `#${tag.tagId}`}</strong>{tag.name ? <code className="mt-1 block break-all text-xs text-[var(--muted)]">#{tag.tagId}</code> : null}<span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.memberCount", { count: tag.memberCount })}{preview ? ` / ${localizedCatalogName(preview.names, locale, preview.id)}` : ""}</span></span>
  </Link>;
}

function ModTagDetail({ entityId, registry, tagId }: { entityId: string; registry: string; tagId: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [detail, setDetail] = useState<GlobalTagDetail>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ registry, tagId, ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (entityId) params.set("entityId", entityId);
    loadGlobalTagDetail(params, token).then((value) => { if (!cancelled) { setDetail(value); setError(""); } })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, locale, page, registry, tagId, token]);

  if (!detail) return <CatalogFrame active="tags" description={registry} title={`#${tagId}`}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  return <CatalogFrame active="tags" description={`${registry} / ${t("globalCatalog.memberCount", { count: detail.memberCount })}`} title={`#${tagId}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href="/mods-tag">{t("globalCatalog.backToTags")}</Link>{user && detail.publicId ? <Link className="button-secondary focus-ring" href={`/mods-tag?editor=edit&publicId=${encodeURIComponent(detail.publicId)}`}>{t("common.edit")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <section className="mt-5"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2>{detail.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p>}</section>
    <section className="mt-8"><h2 className="text-xl font-black">{t("globalCatalog.tags.items")}</h2><div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">{detail.members.map((member) => <GlobalResourceLink key={`${member.registry}:${member.id}`} locale={locale} resource={member} />)}</div></section>
    <CatalogPagination base={`/mods-tag?entityId=${encodeURIComponent(detail.entityId)}&registry=${encodeURIComponent(registry)}&tagId=${encodeURIComponent(tagId)}`} page={page} query="" total={detail.memberCount} queryMode />
  </CatalogFrame>;
}

export function RecipeTypeCatalog() {
	const searchParams = useSearchParams();
	const editor = searchParams.get("editor") || "";
	const publicId = searchParams.get("publicId") || "";
	const templatePublicId = searchParams.get("templatePublicId") || "";
	const recipePublicId = searchParams.get("recipePublicId") || "";
	const id = searchParams.get("id") || "";
	const entityId = searchParams.get("entityId") || "";
	if (editor === "template-create" && publicId) return <CatalogRecipeTemplateEditorRoute recipeTypePublicId={publicId} />;
	if (editor === "template-edit" && publicId && templatePublicId) return <CatalogRecipeTemplateEditorRoute recipeTypePublicId={publicId} templatePublicId={templatePublicId} />;
	if (editor === "recipe-create" && publicId) return <CatalogRecipeEditorRoute recipeTypePublicId={publicId} />;
	if (editor === "recipe-edit" && publicId && recipePublicId) return <CatalogRecipeEditorRoute recipePublicId={recipePublicId} recipeTypePublicId={publicId} />;
	if (editor === "recipe-edit" && id && recipePublicId) return <CatalogRecipeEditorByCanonicalIdRoute recipePublicId={recipePublicId} recipeTypeId={id} />;
	if (editor === "create") return <CatalogRecipeTypeEditor mode="create" />;
	if (editor === "edit" && publicId) return <CatalogRecipeTypeEditor mode="edit" publicId={publicId} />;
	if (publicId || id) return <RecipeTypeDetail entityId={publicId || entityId} id={id} key={`${publicId}\u0000${entityId}\u0000${id}`} />;
	return <RecipeTypeList />;
}

function CanonicalTagDetail({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadCatalogTagForEditing>>>();
  const [resolvedLocalization, setResolvedLocalization] = useState<LocalizationVersion<ResolvedCatalogFields>>();
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
  const { token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<{ items: GlobalRecipeType[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: searchParams.get("q") || "", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    loadGlobalRecipeTypes(params, token).then((value) => { if (!cancelled) { setResult(value); setError(""); } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [page, searchParams, token]);
  function search(event: FormEvent) { event.preventDefault(); const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim()); router.push(`/recipe-types${params.size ? `?${params}` : ""}`); }
  return <CatalogFrame active="recipes" description={t("globalCatalog.recipeTypes.description")} title={t("globalCatalog.recipeTypes.title")}>
    <div className="mt-5 flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><CatalogToolbar compact query={query} placeholder={t("globalCatalog.recipeTypes.search")} onQuery={setQuery} onSubmit={search} /></div>{user ? <Link className="button-primary focus-ring" href="/recipe-types?editor=create">{t("catalogEditor.recipeTypeCreate")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((item) => <RecipeTypeCard item={item} key={item.recipeTypeId} locale={locale} />)}</div>
    <CatalogPagination base="/recipe-types" page={page} query={searchParams.get("q") || ""} total={result.total} />
  </CatalogFrame>;
}

function RecipeTypeCard({ item, locale }: { item: GlobalRecipeType; locale: string }) {
  const { t } = useI18n();
  const catalyst = useRotatingValue(item.catalysts);
  return <Link className="focus-ring flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)]" href={`/recipe-types?id=${encodeURIComponent(item.recipeTypeId)}`}><CatalystIcon catalyst={catalyst} size={56} /><span className="min-w-0"><strong className="block text-lg">{item.name || localizedCatalogName(item.names, locale, item.recipeTypeId)}</strong><code className="mt-1 block break-all text-xs text-[var(--muted)]">{item.recipeTypeId}</code><span className="mt-2 block text-sm text-[var(--muted)]">{t("globalCatalog.recipeCount", { count: item.recipeCount })}{typeof item.templateCount === "number" ? ` · ${t("catalogEditor.templateCount", { count: item.templateCount })}` : ""}</span></span></Link>;
}

function CatalogRecipeTemplateEditorRoute({ recipeTypePublicId, templatePublicId = "" }: { recipeTypePublicId: string; templatePublicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const [initialValue, setInitialValue] = useState<Awaited<ReturnType<typeof loadRecipeTemplate>>>();
  const [loading, setLoading] = useState(Boolean(templatePublicId));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!templatePublicId || !token) return;
    let cancelled = false;
    const controller = new AbortController();
    loadRecipeTemplate(templatePublicId, token, controller.signal).then((value) => {
      if (!cancelled) {
        const valid = value?.recipeTypePublicId === recipeTypePublicId;
        setInitialValue(valid ? value : undefined);
        setError(valid ? "" : t("catalogEditor.loadFailed"));
      }
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [recipeTypePublicId, t, templatePublicId, token]);
  const title = t(templatePublicId ? "catalogEditor.templateEdit" : "catalogEditor.templateCreate");
  if (!ready) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (!user) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><ErrorBox text={t("catalogEditor.loginRequired")} /></CatalogFrame>;
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
  const [initialValue, setInitialValue] = useState<Awaited<ReturnType<typeof loadRecipe>>>();
  const [loading, setLoading] = useState(Boolean(recipePublicId));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!recipePublicId || !token) return;
    let cancelled = false;
    const controller = new AbortController();
    loadRecipe(recipePublicId, token, controller.signal).then((value) => {
      if (!cancelled) {
        const valid = value?.recipeTypePublicId === recipeTypePublicId;
        setInitialValue(valid ? value : undefined);
        setError(valid ? "" : t("catalogEditor.loadFailed"));
      }
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [recipePublicId, recipeTypePublicId, t, token]);
  const title = t(recipePublicId ? "catalogEditor.recipeEdit" : "catalogEditor.recipeCreate");
  if (!ready) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (!user) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><ErrorBox text={t("catalogEditor.loginRequired")} /></CatalogFrame>;
  if (loading) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><Loading /></CatalogFrame>;
  if (error || recipePublicId && !initialValue) return <CatalogFrame active="recipes" description={recipeTypePublicId} title={title}><ErrorBox text={error || t("catalogEditor.loadFailed")} /></CatalogFrame>;
  const seed = initialValue ?? { recipeTypePublicId, templatePublicId: "", canonicalSourceId: "", definition: {}, bindings: {}, defaultLocale: locale };
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

function CatalogRecipeEditorByCanonicalIdRoute({ recipeTypeId, recipePublicId }: { recipeTypeId: string; recipePublicId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [recipeTypePublicId, setRecipeTypePublicId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ id: recipeTypeId, ...catalogQueryLocales(locale), limit: "1", offset: "0" });
    loadGlobalRecipeTypeDetail(params, token).then((value) => {
      if (!cancelled) {
        setRecipeTypePublicId(value.publicId);
        setError(value.publicId ? "" : t("catalogEditor.loadFailed"));
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorText(reason));
    });
    return () => { cancelled = true; };
  }, [locale, recipeTypeId, t, token]);
  if (!recipeTypePublicId) {
    return <CatalogFrame active="recipes" description={recipeTypeId} title={t("catalogEditor.recipeEdit")}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  }
  return <CatalogRecipeEditorRoute recipePublicId={recipePublicId} recipeTypePublicId={recipeTypePublicId} />;
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
    localizedSummary: t("catalogEditor.summary"),
    localizedDescription: t("catalogEditor.contentMarkdown"),
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
    missingRequiredSlot: t("catalogEditor.missingRequiredSlot"),
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

function unifiedRecipeLabels(t: CatalogTranslator) {
  return { materials: t("globalCatalog.materials"), note: t("globalCatalog.recipeNote"), noNote: t("globalCatalog.noNote"), technical: t("globalCatalog.technicalInfo"), recipeId: t("globalCatalog.recipeIdLabel"), recipeType: t("globalCatalog.recipeTypeLabel"), source: t("globalCatalog.sourceLabel") };
}

function recipeAmount(item: Record<string, unknown>) {
  if (typeof item.amount_text === "string" && item.amount_text) return item.amount_text;
  const amount = numberValue(item.amount ?? item.count, 1);
  const unit = typeof item.unit === "string" ? item.unit : typeof item.amount_unit === "string" ? item.amount_unit : "";
  return `${amount}${unit}`;
}

function RecipeTypeDetail({ entityId, id }: { entityId: string; id: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const page = positivePage(searchParams.get("page"));
  const [detail, setDetail] = useState<GlobalRecipeTypeDetail>();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof loadRecipeTemplates>>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ id, ...catalogQueryLocales(locale), limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (entityId) params.set("entityId", entityId);
    loadGlobalRecipeTypeDetail(params, token).then((value) => { if (!cancelled) { setDetail(value); setError(""); } }).catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [entityId, id, locale, page, token]);
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
  const requestedIdentity = id || entityId;
  if (!detail) return <CatalogFrame active="recipes" description={requestedIdentity} title={requestedIdentity}>{error ? <ErrorBox text={error} /> : <Loading />}</CatalogFrame>;
  const templateCount = templatesLoading ? detail.templateCount ?? 0 : templates.length;
  return <CatalogFrame active="recipes" description={detail.recipeTypeId} title={localizedCatalogName(detail.names, locale, detail.recipeTypeId)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3"><Link className="font-bold text-[var(--accent)] hover:underline" href="/recipe-types">{t("globalCatalog.backToRecipeTypes")}</Link>{user && detail.publicId ? <Link className="button-secondary focus-ring" href={`/recipe-types?editor=edit&publicId=${encodeURIComponent(detail.publicId)}`}>{t("common.edit")}</Link> : null}</div>
    {error ? <ErrorBox text={error} /> : null}
    <section className="mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("globalCatalog.introduction")}</h2><span className="rounded-md bg-[var(--panel-subtle)] px-3 py-1.5 text-sm font-bold">{t("catalogEditor.templateCount", { count: templateCount })}</span></div>{detail.contentMarkdown ? <div className="markdown-preview mt-3"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={detail.contentMarkdown} /></div> : <p className="mt-3 text-[var(--muted)]">{t("globalCatalog.noIntroduction")}</p>}</section>
    <section className="mt-7"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.catalysts")}</h2><div className="mt-3 flex flex-wrap gap-2">{detail.catalysts.map((item) => <CatalystChip catalyst={item} key={catalystID(item)} locale={locale} />)}</div></section>
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("catalogEditor.templates")}</h2>{user ? <Link className="button-primary focus-ring" href={`/recipe-types?editor=template-create&publicId=${encodeURIComponent(detail.publicId)}`}>{t("catalogEditor.templateCreate")}</Link> : null}</div>
      {templateError ? <ErrorBox text={templateError} /> : null}
      {templatesLoading ? <Loading /> : templates.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" key={template.publicId || template.templateKey}><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate font-mono">{template.templateKey}</strong><span className="mt-2 block text-sm text-[var(--muted)]">{template.canvas.width} × {template.canvas.height} / {t("catalogEditor.slotCount", { count: template.slotCount ?? 0 })}</span></div>{user && template.publicId ? <Link className="button-secondary focus-ring shrink-0 px-3 py-1.5 text-sm" href={`/recipe-types?editor=template-edit&publicId=${encodeURIComponent(detail.publicId)}&templatePublicId=${encodeURIComponent(template.publicId)}`}>{t("common.edit")}</Link> : null}</div></article>)}</div> : <Empty text={t("catalogEditor.noTemplates")} />}
    </section>
    <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("globalCatalog.recipeTypes.recipes")}</h2>{user && templates.length ? <Link className="button-primary focus-ring" href={`/recipe-types?editor=recipe-create&publicId=${encodeURIComponent(detail.publicId)}`}>{t("catalogEditor.recipeCreate")}</Link> : null}</div><div className="mt-4 grid items-start gap-5 xl:grid-cols-2">{detail.recipes.map((recipe) => <GlobalRecipeCard editHref={user && detail.publicId && recipe.publicId ? `/recipe-types?editor=recipe-edit&publicId=${encodeURIComponent(detail.publicId)}&recipePublicId=${encodeURIComponent(recipe.publicId)}` : undefined} key={recipe.recipeKey} recipe={recipe} />)}</div></section>
    <CatalogPagination base={`/recipe-types?id=${encodeURIComponent(detail.recipeTypeId)}`} page={page} query="" total={detail.total} queryMode />
    <CommentSection targetKey={detail.publicId} targetType="recipe_type" />
  </CatalogFrame>;
}

function GlobalRecipeCard({ recipe, editHref }: { recipe: GlobalRecipe; editHref?: string }) {
  const { locale, t } = useI18n();
  const { user } = useAuthSnapshot();
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
  const materials: UnifiedRecipeMaterial[] = inputs.map((slot) => {
    const item = record((Array.isArray(slot.alternatives) ? slot.alternatives : [])[0]);
    const id = String(item.item || item.resource_location || slot.tag || "?");
    return {
      id: typeof slot.tag === "string" ? `#${slot.tag}` : id,
      name: localizedCatalogName(recordStrings(item.names), locale, id),
      amount: recipeAmount(item),
      href: globalRecipeMaterialHref(slot, item),
      mergeKey: recipeIngredientMergeKey(slot, item),
    };
  });
  const layoutKind = typeof layout.layout_kind === "string" ? layout.layout_kind : "unknown";
  const recipeType = typeof layout.underlying_recipe_type_id === "string" ? layout.underlying_recipe_type_id : "";
  const templateID = typeof layout.template_id === "string" ? layout.template_id : "";
  const visual = <div className="relative mx-auto" style={{ width, height }}>{background ? <Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={catalogAssetURL(recipe.revisionId, background)} /> : null}{slots.map((slot, index) => <RecipeSlot canvasWidth={width} key={index} locale={locale} scale={displayScale} showVisual={!contains} slot={slot} />)}</div>;
  return <UnifiedRecipeCard badge={t(`globalCatalog.recipeLayoutKinds.${layoutKind}`)} editAction={user && editHref ? <RecipeEditLink className="button-secondary focus-ring px-3 py-1.5 text-sm" href={editHref}>{t("common.edit")}</RecipeEditLink> : undefined} labels={unifiedRecipeLabels(t)} materials={materials} note={recipe.note} recipeId={recipe.recipeId} recipeType={recipeType} recipeTypeHref={recipeType ? `/recipe-types?id=${encodeURIComponent(recipeType)}` : undefined} source={sourceMod ? `${sourceMod}${sourceVersion ? `@${sourceVersion}` : ""}` : ""} sourceHref={recipe.modSiteId ? `/mods/${encodeURIComponent(recipe.modSiteId)}` : undefined} technicalInfo={{ recipeIdSource: recipe.recipeIdSource, templateId: templateID, fingerprint: recipe.semanticFingerprint }} visual={visual} />;
}

function GlobalRecipeCandidateChanceLabel({ candidate, slot, locale }: { candidate: Record<string, unknown>; slot: Record<string, unknown>; locale: string }) {
  if (slot.role !== "output") return null;
  const candidateHasChance = candidate.chance_available === true || candidate.chance !== undefined || candidate.chance_percent !== undefined || candidate.probability !== undefined || candidate.byproduct !== undefined;
  const source = candidateHasChance ? candidate : slot;
  if (source.chance_available === false) return null;
  const texts = record(source.chance_texts);
  const preferredLocale = contentLocales(locale).primary;
  const percent = numberValue(source.chance_percent, numberValue(source.chance ?? source.probability, Number.NaN) * 100);
  const chanceText = typeof texts[preferredLocale] === "string"
    ? texts[preferredLocale] as string
    : typeof source.chance_text === "string" && source.chance_text
      ? source.chance_text
      : Number.isFinite(percent)
        ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`
        : "";
  if (!chanceText) return null;
  const badgeText = Number.isFinite(percent) ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%` : chanceText;
  return <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#242424] px-1 py-0.5 text-[9px] font-black leading-none text-white shadow" title={chanceText}>{badgeText}</span>;
}

function RecipeSlot({ slot, scale, locale, canvasWidth, showVisual }: { slot: Record<string, unknown>; scale: number; locale: string; canvasWidth: number; showVisual: boolean }) {
  const item = record(useRotatingValue(Array.isArray(slot.alternatives) ? slot.alternatives : []));
  if (!Object.keys(item).length) return null;
  const itemId = String(item.item || item.resource_location || "");
  const tagId = typeof slot.tag === "string" ? slot.tag : typeof item.tag === "string" ? item.tag : "";
  const sourceRevisionId = typeof item.sourceRevisionId === "string" ? item.sourceRevisionId : "";
  const iconPath = typeof item.iconPath === "string" ? item.iconPath : "";
  const tagEntityId = typeof slot.tagEntityId === "string" ? slot.tagEntityId : "";
  const resourceId = tagId ? `#${tagId}` : itemId;
  const displayName = localizedCatalogName(recordStrings(item.names), locale, itemId || resourceId);
  const tooltipResourceId = tagId && itemId ? `${itemId} · ${resourceId}` : resourceId;
  const presentation = recipeSlotPresentation(slot, item, scale);
  const src = iconPath && sourceRevisionId ? catalogAssetURL(sourceRevisionId, iconPath) : "";
  const content = <><RecipeResourceVisual canvasWidth={canvasWidth} fallback={tagId ? "#" : "?"} name={displayName} presentation={presentation} resourceId={tooltipResourceId} showVisual={showVisual} src={src} /><GlobalRecipeCandidateChanceLabel candidate={item} locale={locale} slot={slot} /></>;
  const label = `${displayName || resourceId} (${tooltipResourceId})`;
  const slotClass = "group focus-ring absolute z-10 hover:z-40 focus-visible:z-40";
  if (tagId) return <Link aria-label={label} className={slotClass} href={`/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`} style={presentation.style}>{content}</Link>;
  const detailUrl = canonicalRecipeResourceHref(item);
  if (itemId && detailUrl) return <Link aria-label={label} className={slotClass} href={detailUrl} target="_blank" rel="noopener noreferrer" style={presentation.style}>{content}</Link>;
  return <span aria-label={label} className="group absolute z-10 hover:z-40 focus-visible:z-40" style={presentation.style} tabIndex={resourceId ? 0 : undefined}>{content}</span>;
}

function globalRecipeMaterialHref(slot: Record<string, unknown>, item: Record<string, unknown>) {
  const tagId = typeof slot.tag === "string" ? slot.tag : typeof item.tag === "string" ? item.tag : "";
  if (tagId) {
    const tagEntityId = typeof slot.tagEntityId === "string" ? slot.tagEntityId : "";
    return `/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`;
  }
  const itemId = String(item.item || item.resource_location || "");
  if (!itemId) return undefined;
  return canonicalRecipeResourceHref(item) || undefined;
}

function canonicalRecipeResourceHref(item: Record<string, unknown>) {
  if (typeof item.detailUrl === "string" && item.detailUrl) return item.detailUrl;
  const siteId = typeof item.sourceModSiteId === "string" ? item.sourceModSiteId : "";
  const versionId = typeof item.sourceVersionPublicId === "string" ? item.sourceVersionPublicId : "";
  const resourceId = typeof item.entityId === "string" ? item.entityId : typeof item.publicId === "string" ? item.publicId : "";
  if (!siteId || !versionId || !resourceId) return "";
  return `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(versionId)}`;
}

function CatalogFrame({ active, title, description, children }: { active: "tags" | "recipes"; title: string; description: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><div className="mx-auto max-w-[1600px]"><header className="border-b border-[var(--line)] pb-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">{t("globalCatalog.kicker")}</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 max-w-3xl text-[var(--muted)]">{description}</p></div><nav className="flex flex-wrap rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1"><Link className={`rounded-md px-4 py-2 font-bold ${active === "tags" ? "bg-[var(--accent)] text-white" : ""}`} href="/mods-tag">{t("globalCatalog.tags.short")}</Link><Link className={`rounded-md px-4 py-2 font-bold ${active === "recipes" ? "bg-[var(--accent)] text-white" : ""}`} href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link><Link className="rounded-md px-4 py-2 font-bold" href="/catalog/resources">{t("resourceEditor.catalogShort")}</Link></nav></div></header>{children}</div></main>;
}

function CatalogToolbar({ query, placeholder, onQuery, onSubmit, compact = false }: { query: string; placeholder: string; onQuery: (value: string) => void; onSubmit: (event: FormEvent) => void; compact?: boolean }) { const { t } = useI18n(); return <form className={`${compact ? "" : "mt-5"} flex gap-2`} onSubmit={onSubmit}><input className="field h-11 min-w-0 flex-1" type="search" placeholder={placeholder} value={query} onChange={(event) => onQuery(event.target.value)} /><button className="button-primary focus-ring" type="submit">{t("globalCatalog.searchAction")}</button></form>; }
function GlobalResourceLink({ resource, locale }: { resource: GlobalResource; locale: string }) {
  const { t } = useI18n();
  const initialIndex = Math.max(0, resource.versions.findIndex((version) => version.revisionId === resource.revisionId) >= 0
    ? resource.versions.findIndex((version) => version.revisionId === resource.revisionId)
    : resource.versions.findIndex((version) => version.hasDetail));
  const [versionIndex, setVersionIndex] = useState(initialIndex);
  const version = resource.versions[versionIndex];
  const displayed = version ? resourceAtVersion(resource, version) : resource;
  const content = <><ResourceIcon resource={displayed} size={48} /><span className="min-w-0 flex-1"><strong className="block truncate">{localizedCatalogName(displayed.names, locale, displayed.id)}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{displayed.id}</code>{version ? <span className={`mt-1 block truncate text-xs font-bold ${version.hasDetail ? "text-[var(--muted)]" : "text-[var(--red)]"}`}>{version.label}</span> : null}</span></>;
  const linked = displayed.entityId && displayed.detailUrl
    ? <Link className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-md p-2 hover:bg-[var(--panel-subtle)]" href={displayed.detailUrl} target="_blank" rel="noopener noreferrer">{content}</Link>
    : <div className="flex min-w-0 flex-1 items-center gap-3 p-2" title={version && !version.hasDetail ? t("globalCatalog.versionNoDetail") : undefined}>{content}</div>;
  return <article className="min-h-28 bg-[var(--panel)] p-2">
    <div className="flex items-center gap-1">
      {resource.versions.length > 1 ? <button aria-label={t("globalCatalog.previousVersion")} className="focus-ring grid h-8 w-7 shrink-0 place-items-center rounded hover:bg-[var(--panel-subtle)]" type="button" onClick={() => setVersionIndex((value) => (value - 1 + resource.versions.length) % resource.versions.length)}>‹</button> : null}
      {linked}
      {resource.versions.length > 1 ? <button aria-label={t("globalCatalog.nextVersion")} className="focus-ring grid h-8 w-7 shrink-0 place-items-center rounded hover:bg-[var(--panel-subtle)]" type="button" onClick={() => setVersionIndex((value) => (value + 1) % resource.versions.length)}>›</button> : null}
    </div>
    {resource.versions.length ? <div className="mt-1 flex gap-1 overflow-x-auto px-2 pb-1">{resource.versions.map((item, index) => <button className={`focus-ring shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${index === versionIndex ? "bg-[var(--accent)] text-white" : item.hasDetail ? "bg-[var(--panel-subtle)] text-[var(--foreground)]" : "bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]"}`} key={item.publicId} type="button" onClick={() => setVersionIndex(index)}>{item.label}</button>)}</div> : null}
  </article>;
}
function ResourceIcon({ resource, size }: { resource?: GlobalResource; size: number }) { const src = resource ? catalogDirectAssetURL(resource.iconUrl) || catalogAssetURL(resource.revisionId, resource.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black text-[var(--muted)]" style={{ width: size, height: size }}>TAG</span>; }
function CatalystIcon({ catalyst, size }: { catalyst?: RecipeCatalyst; size: number }) { const src = catalyst ? catalogAssetURL(catalyst.revisionId, catalyst.iconPath) : ""; return src ? <Image unoptimized alt="" className="shrink-0 object-contain [image-rendering:pixelated]" height={size} width={size} src={src} /> : <span className="grid shrink-0 place-items-center rounded-md bg-[var(--panel-subtle)] text-xs font-black" style={{ width: size, height: size }}>GUI</span>; }
function CatalystChip({ catalyst, locale }: { catalyst: RecipeCatalyst; locale: string }) { return <span className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><CatalystIcon catalyst={catalyst} size={32} /><span className="font-bold">{localizedCatalogName(catalyst.names, locale, catalystID(catalyst))}</span></span>; }
function CatalogPagination({ base, page, total, query, queryMode = false }: { base: string; page: number; total: number; query: string; queryMode?: boolean }) { const { t } = useI18n(); const pages = Math.max(1, Math.ceil(total / pageSize)); if (pages <= 1) return null; const href = (next: number) => { const separator = queryMode || base.includes("?") ? "&" : "?"; const queryPart = query ? `${separator}q=${encodeURIComponent(query)}&page=${next}` : `${separator}page=${next}`; return `${base}${queryPart}`; }; return <nav className="mt-7 flex items-center justify-center gap-3"><Link className={`button-secondary focus-ring ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={href(Math.max(1, page - 1))}>{t("globalCatalog.previous")}</Link><span className="text-sm font-bold text-[var(--muted)]">{page} / {pages}</span><Link className={`button-secondary focus-ring ${page >= pages ? "pointer-events-none opacity-40" : ""}`} href={href(Math.min(pages, page + 1))}>{t("globalCatalog.next")}</Link></nav>; }
function resourceAtVersion(resource: GlobalResource, version: CatalogResourceVersion): GlobalResource { return { ...resource, registry: version.registry || resource.registry, names: Object.keys(version.names).length ? version.names : resource.names, revisionId: version.revisionId, modSiteId: version.modSiteId || resource.modSiteId, iconPath: version.iconPath, iconUrl: version.iconUrl, detailUrl: version.detailUrl, versions: resource.versions }; }
function catalogRefToGlobalResource(resource: CatalogResourceRef): GlobalResource { return { entityId: resource.entityId || "", publicId: resource.publicId, id: resource.id, registry: resource.registry, names: resource.names, revisionId: "", modSiteId: resource.source?.siteId || "", iconPath: "", iconUrl: resource.iconUrl, versions: resource.versions ?? [] }; }
function catalystID(value: RecipeCatalyst) { return value.item || value.resource_location || ""; }
function positivePage(value: string | null) { const parsed = Number.parseInt(value || "1", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function recordStrings(value: unknown): Record<string, string> { const source = record(value); return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string")); }
function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function emptyCatalogLocalization(locale: string) { return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human" as const, reviewStatus: "approved" as const, editable: true }; }
function ErrorBox({ text }: { text: string }) { return <p className="mt-4 rounded-lg border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_7%,transparent)] p-3 font-bold text-[var(--red)]">{text}</p>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">{text}</div>; }
function Loading() { const { t } = useI18n(); return <div className="grid min-h-72 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div>; }
