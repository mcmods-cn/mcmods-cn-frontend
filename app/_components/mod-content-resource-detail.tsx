"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import {
  loadModContentResource,
  loadModContentSectionResources,
  type ModContentLocalization,
  type ModContentResource,
  type ModContentSection,
  updateModContentResource,
} from "../_lib/mod-content-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { CommentSection } from "./comment-section";

export function ModContentResourceDetail({ siteId, resourceId, versionId, sectionId }: { siteId: string; resourceId: string; versionId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [detail, setDetail] = useState<ModContentResource>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLocale, setEditLocale] = useState<string>(locale);
  const [draftLocalizations, setDraftLocalizations] = useState<ModContentLocalization[]>([]);
  const [definitionDraft, setDefinitionDraft] = useState("{}");
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadModContentResource(siteId, resourceId, token)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [refreshKey, resourceId, siteId, token]);

  if (!detail) return <main className="grid min-h-[65vh] place-items-center p-6">{error || t("common.loading")}</main>;

  const requestedIndex = detail.versions.findIndex((item) => item.publicId === versionId);
  const firstDetailedIndex = detail.versions.findIndex((item) => item.hasDetail);
  const currentIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, firstDetailedIndex);
  const current = detail.versions[currentIndex];
  const versionDetail = detail.details.find((item) => item.versionPublicId === current?.publicId);
  const localization = resolveVersionLocalization(versionDetail?.localizations || [], locale, versionDetail?.defaultLocale || "en-US");
  const missing = !versionDetail;

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-5">
      <Link className="font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black">{localization?.name || detail.canonicalId}</h1><code className="mt-1 block text-sm text-[var(--muted)]">{detail.canonicalId}</code></div>{token && versionDetail ? <button className="button-secondary focus-ring" type="button" onClick={() => void startEditing()}>{t("common.edit")}</button> : null}</div>
      <div className="mt-4 flex gap-1 overflow-x-auto">{detail.versions.map((version, index) => {
        const href = version.detailUrl || `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(version.publicId)}`;
        return <Link className={`focus-ring shrink-0 rounded px-2 py-1 text-xs font-black ${index === currentIndex ? "bg-[var(--accent)] text-white" : version.hasDetail ? "bg-[var(--panel-subtle)]" : "border border-[var(--red)] text-[var(--red)]"}`} href={href} key={version.publicId}>{version.label}</Link>;
      })}</div>
    </header>
    {message ? <p className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold">{message}</p> : null}
    {editing && versionDetail ? <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">{t("modContent.resourceEdit.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.resourceEdit.hint")}</p></div><button className="button-secondary" type="button" onClick={() => setEditing(false)}>{t("common.close")}</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.language")}</span><select className="field" value={editLocale} onChange={(event) => setEditLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.category")}</span><select className="field" disabled={!selectedSectionId} value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)}>{categories.map((category, index) => <option key={category.publicId} value={category.publicId}>{index === 0 ? t("modContent.sectionActions.rootCategory") : localizedCategoryName(category, locale)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.name")}</span><input className="field" value={editingLocalization(draftLocalizations, editLocale).name} onChange={(event) => setDraftLocalizations(updateLocalization(draftLocalizations, editLocale, { name: event.target.value }))} /></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.summary")}</span><textarea className="field min-h-20" value={editingLocalization(draftLocalizations, editLocale).summary} onChange={(event) => setDraftLocalizations(updateLocalization(draftLocalizations, editLocale, { summary: event.target.value }))} /></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.content")}</span><textarea className="field min-h-40 font-mono text-sm" value={editingLocalization(draftLocalizations, editLocale).contentMarkdown} onChange={(event) => setDraftLocalizations(updateLocalization(draftLocalizations, editLocale, { contentMarkdown: event.target.value }))} /></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.definition")}</span><textarea className="field min-h-32 font-mono text-xs" value={definitionDraft} onChange={(event) => setDefinitionDraft(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.reason")}</span><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
      <div className="mt-5 flex justify-end"><button className="button-primary" disabled={saving} type="button" onClick={() => void saveEdit()}>{saving ? t("common.loading") : t("modContent.resourceEdit.submit")}</button></div>
    </section> : null}
    {missing ? <section className="mt-8 rounded-lg border border-dashed border-[var(--red)] bg-[var(--panel)] p-8 text-center"><h2 className="text-xl font-black">{current?.label}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionContentMissing")}</p></section> : <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div><p className="text-sm font-bold text-[var(--muted)]">{current?.label}</p>{localization?.summary ? <p className="mt-4 leading-7 text-[var(--muted)]">{localization.summary}</p> : null}{localization?.contentMarkdown ? <div className="markdown-preview mt-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.contentMarkdown} /></div> : <p className="mt-5 text-[var(--muted)]">{t("mods.exportImport.entry.noIntroduction")}</p>}</div>
      <aside><dl className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm"><dt className="font-bold text-[var(--muted)]">{t("resourceEditor.kind")}</dt><dd>{detail.kindCode}</dd><dt className="font-bold text-[var(--muted)]">ID</dt><dd className="break-all font-mono">{detail.canonicalId}</dd></dl><details className="mt-4"><summary className="cursor-pointer font-bold">{t("globalCatalog.technicalInfo")}</summary><pre className="mt-2 max-h-80 overflow-auto rounded bg-[var(--panel-subtle)] p-3 text-xs">{JSON.stringify(versionDetail.definition, null, 2)}</pre></details></aside>
    </div>}
    {current && versionDetail ? <CommentSection targetKey={`${resourceId}~${current.publicId}`} targetType="mod_resource" /> : null}
  </article></main>;

  async function startEditing() {
    if (!versionDetail) return;
    setDraftLocalizations(versionDetail.localizations.map(({ locale: itemLocale, name, summary, contentMarkdown }) => ({ locale: itemLocale, name, summary, contentMarkdown })));
    setEditLocale(locale);
    setDefinitionDraft(JSON.stringify(versionDetail.definition || {}, null, 2));
    setReason("");
    setError("");
    setMessage("");
    if (sectionId) {
      try {
        const page = await loadModContentSectionResources(siteId, sectionId, { locale, limit: 20000, offset: 0 }, token);
        if (page.section.versionPublicId === current?.publicId) {
          setCategories([page.section, ...(page.categories || [])]);
          setSelectedSectionId(page.items.find((item) => item.resourcePublicId === resourceId)?.sectionPublicId || page.section.publicId);
        } else {
          setCategories([]);
          setSelectedSectionId("");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    setEditing(true);
  }

  async function saveEdit() {
    if (!versionDetail || !current || !detail) return;
    let definition: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(definitionDraft || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      definition = parsed as Record<string, unknown>;
    } catch {
      setError(t("modContent.sectionActions.invalidJson"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await updateModContentResource(siteId, resourceId, {
        resourcePublicId: resourceId,
        kindCode: detail.kindCode,
        canonicalId: detail.canonicalId,
        versionPublicId: current.publicId,
        ...(selectedSectionId ? { sectionPublicId: selectedSectionId } : {}),
        defaultLocale: versionDetail.defaultLocale,
        definition,
        localizations: draftLocalizations.filter((item) => item.name.trim()),
        reason: reason.trim() || t("modContent.resourceEdit.reason"),
        baseRevisionId: versionDetail.publishedRevisionId,
      }, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      setEditing(false);
      if (result.reviewStatus === "approved") setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
}

function resolveVersionLocalization(values: ModContentLocalization[], locale: string, defaultLocale: string) {
  for (const candidate of contentLanguageCandidates(locale, "", defaultLocale)) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = values.find((item) => normalizeContentLanguage(item.locale).toLowerCase() === normalized);
    if (match) return match;
  }
  return values[0];
}

function editingLocalization(values: ModContentLocalization[], locale: string): ModContentLocalization {
  return values.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(locale))
    || { locale, name: "", summary: "", contentMarkdown: "" };
}

function updateLocalization(values: ModContentLocalization[], locale: string, patch: Partial<ModContentLocalization>) {
  const normalized = normalizeContentLanguage(locale);
  const existing = editingLocalization(values, locale);
  return [...values.filter((item) => normalizeContentLanguage(item.locale) !== normalized), { ...existing, locale, ...patch }];
}

function localizedCategoryName(category: ModContentSection, locale: string) {
  return category.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(locale))?.name
    || category.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(category.defaultLocale))?.name
    || category.localizations[0]?.name
    || category.publicId;
}
