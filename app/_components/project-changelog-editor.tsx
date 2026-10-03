"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { supportedLocales, type Locale, useI18n } from "../_lib/i18n-provider";
import { loadProjectChangelog, loadProjectChangelogs, loadProjectChangelogCategories, saveProjectChangelog, type ChangelogCategory, type ChangelogDraft, type ChangelogTarget, type ChangelogTargetType } from "../_lib/project-changelog-api";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { normalizeChangelogEventAt } from "../_lib/changelog-form.mts";
import { DraftAutosaveStatus } from "./draft-autosave-status";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { LoginRequiredState, PageFeedback } from "./page-feedback";
import { ReviewLockGate } from "./review-edit-lock";
import { ToolsPlayground } from "./tools-playground";

type EditableChangelogDraft = ChangelogDraft & { categoryMode: "automatic" | "existing" | "new" };

export function ProjectChangelogEditor({ id = "", targetId = "", targetType }: { id?: string; targetId?: string; targetType?: ChangelogTargetType }) {
  const { user, token } = useAuthSnapshot();
  return <ProjectChangelogEditorForm key={`${user?.id || "guest"}:${token || "guest"}:${id || `${targetType}:${targetId}`}`} id={id} targetId={targetId} targetType={targetType} />;
}

function ProjectChangelogEditorForm({ id, targetId, targetType }: { id: string; targetId: string; targetType?: ChangelogTargetType }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const initialLocale = supportedLocales.some((item) => item.code === locale) ? locale : "zh-CN";
  const [draft, setDraft] = useState<EditableChangelogDraft>(() => emptyDraft(initialLocale));
  const [editingLocale, setEditingLocale] = useState<Locale>(initialLocale);
  const [target, setTarget] = useState<ChangelogTarget>();
  const [categories, setCategories] = useState<ChangelogCategory[]>([]);
  const [categoryPage, setCategoryPage] = useState({ locale: "", hasMore: false, cursor: "" });
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const categoryGeneration = useRef(0);
  const categoryRequest = useRef<AbortController | null>(null);
  const selectedCategoryId = useRef(draft.categoryId);
  useEffect(() => { selectedCategoryId.current = draft.categoryId; }, [draft.categoryId]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [markdownUploading, setMarkdownUploading] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const submitInFlight = useRef(false);
  const [message, setMessage] = useState("");
  const initializedToken = useRef<string | undefined>(undefined);
  const identity = id || `${targetType || "unknown"}:${targetId || "unknown"}`;
  const body = draft.localizations.find((item) => item.locale === editingLocale)?.bodyMarkdown || "";
  const categoryName = draft.newCategory?.localizations.find((item) => item.locale === editingLocale)?.name || "";
  const autoDraft = useAutoDraft({
    draftKey: `changelog:${identity}`,
    projectKey: `changelog:${target?.id || targetId}:${id || "new"}`,
    editUrl: id ? `/changelogs/${id}/edit` : `/changelogs/new?targetType=${targetType}&targetId=${targetId}`,
    enabled: ready && Boolean(token) && !loading && Boolean(target),
    kind: "changelog",
    title: `${target?.name || t("changelog.title")} - ${draft.projectVersion || t("changelog.newEntry")}`,
    token,
    value: draft,
    onRestore: setDraft,
  });

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    const controller = new AbortController();
    const generation = ++categoryGeneration.current;
    categoryRequest.current?.abort();
    categoryRequest.current = null;
    const request = id
      ? loadProjectChangelog(id, token, controller.signal).then(async (result) => {
          const collection = await loadProjectChangelogs(result.target.type, result.target.id, locale, token, controller.signal);
          const localizations = supportedLocales.map((language) => ({ locale: language.code, bodyMarkdown: result.item.localizations?.find((value) => value.locale === language.code)?.bodyMarkdown || "" }));
          return { target: result.target, categories: collection.categories, selectedCategory: result.item.category, categoryPage: { locale, hasMore: collection.categoriesHasMore === true, cursor: collection.categoriesNextCursor || "" }, draft: {
            eventAt: toLocalDateTime(result.item.eventAt), minecraftVersions: result.item.minecraftVersions,
            projectVersion: result.item.projectVersion, defaultLocale: result.item.defaultLocale,
            categoryId: result.item.category?.id, categoryMode: result.item.category ? "existing" as const : "automatic" as const,
            localizations, reason: "",
          } };
        })
      : targetType && targetId
        ? loadProjectChangelogs(targetType, targetId, locale, token, controller.signal).then((collection) => ({ target: collection.target, categories: collection.categories, selectedCategory: undefined, categoryPage: { locale, hasMore: collection.categoriesHasMore === true, cursor: collection.categoriesNextCursor || "" }, draft: undefined }))
        : Promise.reject(new Error(t("changelog.invalidTarget")));
    request.then((result) => {
      if (cancelled) return;
      setTarget(result.target);
      setCategories((current) => mergeCategories(result.categories, current.find((item) => item.id === selectedCategoryId.current) || result.selectedCategory, locale));
      setCategoryPage(result.categoryPage);
      setCategoriesLoading(false);
      setCategoryError("");
      // Refresh translated category labels without replacing unsaved edits when
      // the interface language changes. A new authenticated session reloads it.
      if (result.draft && initializedToken.current !== token) {
        setDraft(result.draft);
        setEditingLocale((supportedLocales.some((item) => item.code === result.draft?.defaultLocale) ? result.draft.defaultLocale : initialLocale) as Locale);
        initializedToken.current = token;
      }
      setMessage("");
    }).catch((error) => { if (!cancelled) { setMessage(error instanceof Error ? error.message : t("changelog.loadFailed")); setCategoryError(t("changelog.categoriesLoadFailed")); } })
      .finally(() => { if (!cancelled) { setLoading(false); if (categoryGeneration.current === generation) setCategoriesLoading(false); } });
    return () => { cancelled = true; controller.abort(); categoryRequest.current?.abort(); };
  }, [id, initialLocale, loadAttempt, locale, ready, t, targetId, targetType, token]);

  const targetURL = target?.url || "/";

  async function loadMoreCategories() {
    if (!target || categoryRequest.current || categoryPage.locale !== locale || !categoryPage.hasMore || !categoryPage.cursor) return;
    const controller = new AbortController();
    const generation = categoryGeneration.current;
    const cursor = categoryPage.cursor;
    categoryRequest.current = controller;
    setCategoriesLoading(true);
    setCategoryError("");
    try {
      const page = await loadProjectChangelogCategories(target.type, target.id, locale, token, controller.signal, cursor);
      if (controller.signal.aborted || generation !== categoryGeneration.current) return;
      if (page.target.type !== target.type || page.target.id !== target.id || (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))) throw new Error(t("changelog.categoriesLoadFailed"));
      setCategories((current) => mergeCategories([...current, ...page.categories], undefined, locale));
      setCategoryPage({ locale, hasMore: page.hasMore, cursor: page.nextCursor });
    } catch (error) {
      if (!controller.signal.aborted && generation === categoryGeneration.current) setCategoryError(error instanceof Error ? error.message : t("changelog.categoriesLoadFailed"));
    } finally {
      if (categoryRequest.current === controller) categoryRequest.current = null;
      if (!controller.signal.aborted && generation === categoryGeneration.current) setCategoriesLoading(false);
    }
  }

  async function submit() {
    if (!token || !target || busy || markdownUploading || submitInFlight.current) return;
    const eventAt = normalizeChangelogEventAt(draft.eventAt);
    if (!eventAt || !draft.projectVersion.trim() || !draft.minecraftVersions.length || !draft.localizations.find((item) => item.locale === draft.defaultLocale)?.bodyMarkdown.trim()) {
      setMessage(t("changelog.validation.required"));
      return;
    }
    if (draft.categoryMode === "new" && !draft.newCategory?.localizations.find((item) => item.locale === draft.newCategory?.defaultLocale)?.name.trim()) {
      setMessage(t("changelog.validation.categoryName"));
      return;
    }
    submitInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const payload = preparePayload(draft, eventAt);
      const result = await saveProjectChangelog(payload, token, { type: target.type, id: target.id }, id);
      const destination = `${target.url}?tab=changelog`;
      await autoDraft.completeDraft({ projectKey: `changelog:${target.id}:${result.id}`, projectTitle: `${target.name} - ${draft.projectVersion}`,
        targetUrl: destination, changeRequestId: result.changeRequestId }).catch(() => { window.alert(t("drafts.completionFailed")); });
      router.push(destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("changelog.saveFailed"));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  function updateBody(value: string) {
    setDraft((current) => ({ ...current, localizations: updateLocalization(current.localizations, editingLocale, { bodyMarkdown: value }) }));
  }

  function updateCategoryName(value: string) {
    setDraft((current) => ({ ...current, newCategory: {
      defaultLocale: current.newCategory?.defaultLocale || current.defaultLocale,
      localizations: updateCategoryLocalization(current.newCategory?.localizations || supportedLocales.map((item) => ({ locale: item.code, name: "" })), editingLocale, value),
    } }));
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath={id ? `/changelogs/${id}/edit` : `/changelogs/new?targetType=${targetType}&targetId=${targetId}`} />;
  if (loading) return <PageFeedback title={t("common.loading")} />;
  if (!target) return <PageFeedback description={message} tone="danger" title={t("changelog.loadFailed")} action={<button className="button-secondary focus-ring" type="button" onClick={() => { setLoading(true); setMessage(""); setLoadAttempt((attempt) => attempt + 1); }}>{t("common.retry")}</button>} />;

  const content = <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="font-bold text-[var(--accent)] hover:underline" href={`${targetURL}?tab=changelog`}>← {target.name}</Link><h1 className="mt-2 text-3xl font-black">{id ? t("changelog.edit") : t("changelog.create")}</h1></div><div className="grid justify-items-end gap-2"><DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} /><div className="flex gap-2"><Link className="button-secondary focus-ring" href={`${targetURL}?tab=changelog`}>{t("common.cancel")}</Link><button className="button-primary focus-ring" disabled={busy || markdownUploading} type="button" onClick={() => void submit()}>{busy ? t("common.loading") : t("common.submit")}</button></div></div></header>
    {message ? <p role="alert" className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <fieldset disabled={busy} className="mt-6 grid min-w-0 gap-6">
      <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-2"><label className="font-black">{t("changelog.fields.eventAt")}<input className="field mt-2" type="datetime-local" value={draft.eventAt} onChange={(event) => setDraft({ ...draft, eventAt: event.target.value })} /></label><label className="font-black">{t("changelog.fields.projectVersion")}<input className="field mt-2" maxLength={120} value={draft.projectVersion} onChange={(event) => setDraft({ ...draft, projectVersion: event.target.value })} /></label><fieldset className="sm:col-span-2"><legend className="mb-2 font-black">{t("changelog.fields.minecraftVersions")}</legend><MinecraftVersionPicker values={draft.minecraftVersions} onChange={(minecraftVersions) => setDraft({ ...draft, minecraftVersions })} /></fieldset></section>
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("changelog.fields.category")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("changelog.fields.categoryHint")}</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><button className={modeClass(draft.categoryMode === "automatic")} type="button" onClick={() => setDraft({ ...draft, categoryMode: "automatic", categoryId: undefined, newCategory: undefined })}>{t("changelog.categoryAutomatic")}</button><button className={modeClass(draft.categoryMode === "existing")} disabled={!categories.length} type="button" onClick={() => setDraft({ ...draft, categoryMode: "existing", categoryId: draft.categoryId || categories[0]?.id, newCategory: undefined })}>{t("changelog.categoryExisting")}</button><button className={modeClass(draft.categoryMode === "new")} type="button" onClick={() => setDraft({ ...draft, categoryMode: "new", categoryId: undefined, newCategory: draft.newCategory || emptyCategory(draft.defaultLocale) })}>{t("changelog.categoryNew")}</button></div>{draft.categoryMode === "existing" ? <select aria-label={t("changelog.fields.category")} className="field mt-4" value={draft.categoryId || ""} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select> : null}{draft.categoryMode === "new" ? <label className="mt-4 block font-black">{t("changelog.fields.categoryName")} ({supportedLocales.find((item) => item.code === editingLocale)?.label})<input className="field mt-2" maxLength={80} value={categoryName} onChange={(event) => updateCategoryName(event.target.value)} /></label> : null}{categoryError ? <p className="mt-3 text-sm text-[var(--red)]" role="alert">{categoryError}</p> : null}{categoryPage.hasMore || categoryError ? <button className="button-secondary focus-ring mt-3" disabled={categoriesLoading || (categoryPage.locale !== locale && !categoryError)} type="button" onClick={() => { if (categoryPage.locale !== locale || !categoryPage.cursor) setLoadAttempt((attempt) => attempt + 1); else void loadMoreCategories(); }}>{categoriesLoading ? t("common.loading") : categoryError ? t("common.retry") : t("changelog.loadMoreCategories")}</button> : null}</section>
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="font-black">{t("changelog.fields.editingLanguage")}<select className="field mt-2" value={editingLocale} onChange={(event) => setEditingLocale(event.target.value as Locale)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="font-black">{t("changelog.fields.defaultLanguage")}<select className="field mt-2" value={draft.defaultLocale} onChange={(event) => setDraft({ ...draft, defaultLocale: event.target.value })}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label></div></section>
      <section><div className="mb-2 flex items-center justify-between"><h2 className="text-xl font-black">{t("changelog.fields.body")}</h2><span className="text-sm text-[var(--muted)]">Markdown · {supportedLocales.find((item) => item.code === editingLocale)?.label}</span></div><ToolsPlayground embedded onBusyChange={setMarkdownUploading} documentId={`changelog:${identity}:${editingLocale}:body`} editorTitle={t("changelog.fields.body")} uploadSource="changelog_text:draft" value={body} onChange={updateBody} /></section>
      <label className="block font-black">{t("changelog.fields.reason")}<textarea className="field mt-2 min-h-24" maxLength={500} value={draft.reason || ""} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></label>
    </fieldset>
  </article></main>;
  return id ? <ReviewLockGate entityType="project_changelog" publicId={id} returnHref={`${targetURL}?tab=changelog`}>{content}</ReviewLockGate> : content;
}

function mergeCategories(categories: ChangelogCategory[], selected: ChangelogCategory | undefined, locale: string) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  if (selected && !byId.has(selected.id)) byId.set(selected.id, selected);
  return [...byId.values()].map((item) => ({ ...item, name: item.names?.[locale] || item.names?.[item.defaultLocale] || item.name }));
}

function emptyDraft(locale: Locale): EditableChangelogDraft {
  return { eventAt: toLocalDateTime(new Date().toISOString()), minecraftVersions: [], projectVersion: "", defaultLocale: locale,
    categoryMode: "automatic", localizations: supportedLocales.map((item) => ({ locale: item.code, bodyMarkdown: "" })), reason: "" };
}

function emptyCategory(locale: string) { return { defaultLocale: locale, localizations: supportedLocales.map((item) => ({ locale: item.code, name: "" })) }; }

function preparePayload(draft: EditableChangelogDraft, eventAt: string): ChangelogDraft {
  return { eventAt, minecraftVersions: draft.minecraftVersions, projectVersion: draft.projectVersion.trim(), defaultLocale: draft.defaultLocale,
    categoryId: draft.categoryMode === "existing" ? draft.categoryId : undefined,
    newCategory: draft.categoryMode === "new" ? draft.newCategory : undefined,
    localizations: draft.localizations.filter((item) => item.bodyMarkdown.trim()).map((item) => ({ ...item, bodyMarkdown: item.bodyMarkdown.trim() })), reason: draft.reason?.trim() };
}

function updateLocalization(values: ChangelogDraft["localizations"], locale: string, patch: Partial<ChangelogDraft["localizations"][number]>) {
  return values.map((item) => item.locale === locale ? { ...item, ...patch } : item);
}
function updateCategoryLocalization(values: Array<{ locale: string; name: string }>, locale: string, name: string) { return values.map((item) => item.locale === locale ? { ...item, name } : item); }
function modeClass(active: boolean) { return `focus-ring rounded-lg border px-4 py-3 text-left font-black ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] disabled:opacity-50"}`; }
function toLocalDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
