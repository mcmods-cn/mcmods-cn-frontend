"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeResolvedContent } from "../_lib/editor-api";
import type { LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import { useI18n, type Locale } from "../_lib/i18n-provider";
import { loadSkin, type SkinModel, type SkinTexture, type SkinVisibility, updateSkin } from "../_lib/skin-api";
import type { BlueprintDetailRecord } from "../_lib/blueprint-api";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { ToolsPlayground } from "./tools-playground";
import { ReviewLockGate } from "./review-edit-lock";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

type AssetKind = "skin" | "blueprint";

export function LocalizedAssetEditor(props: { kind: AssetKind; publicId: string }) {
  const { user } = useAuthSnapshot();
  return <LocalizedAssetEditorWorkspace key={JSON.stringify([props.kind, props.publicId, user?.id])} {...props} />;
}

function LocalizedAssetEditorWorkspace({ kind, publicId }: { kind: AssetKind; publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [initialLocale] = useState(locale);
  const loadTranslationRef = useRef(t);
  useEffect(() => { loadTranslationRef.current = t; }, [t]);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(locale);
  const [versions, setVersions] = useState<LocalizationVersion<LocalizedContentFields>[]>([]);
  const [skin, setSkin] = useState<SkinTexture | null>(null);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<SkinVisibility>("public");
  const [model, setModel] = useState<SkinModel>("default");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const base = kind === "skin"
          ? await loadSkin(publicId, token)
          : await apiRequest<BlueprintDetailRecord>(`/api/v1/blueprints/${encodeURIComponent(publicId)}`, {}, token);
        const rawContent = await apiRequest<unknown>(`/api/v1/${kind === "skin" ? "skins" : "blueprints"}/${encodeURIComponent(publicId)}/content?locale=${encodeURIComponent(initialLocale)}`, {}, token);
        const content = rawContent === undefined ? undefined : normalizeResolvedContent(rawContent);
        if (cancelled) return;
        if (kind === "skin") {
          const value = base as SkinTexture;
          setSkin(value); setTags(value.tags.join(", ")); setVisibility(value.visibility); setModel(value.model);
        }
        const fallback = kind === "skin"
          ? { name: (base as SkinTexture).name, summary: (base as SkinTexture).description || "", contentMarkdown: "" }
          : { name: (base as BlueprintDetailRecord).title, summary: "", contentMarkdown: (base as BlueprintDetailRecord).description || "" };
        setVersions(content?.available.length ? content.available : [{ locale: content?.defaultLocale || initialLocale, fields: fallback, provenance: "human", reviewStatus: "approved", editable: true }]);
        setDefaultLocale((content?.defaultLocale || initialLocale) as Locale);
        setSelectedLocale((content?.resolvedLocale || content?.defaultLocale || initialLocale) as Locale);
        setLoaded(true);
        setMessage("");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : loadTranslationRef.current("assetEditor.loadFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [initialLocale, kind, publicId, ready, reload, token]);

  const selected = versions.find((item) => item.locale === selectedLocale) ?? {
    locale: selectedLocale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human" as const, reviewStatus: "draft" as const, editable: true,
  };
  const updateFields = (fields: Partial<LocalizedContentFields>) => setVersions((current) => {
    const next = { ...selected, fields: { ...selected.fields, ...fields } };
    return current.some((item) => item.locale === selectedLocale)
      ? current.map((item) => item.locale === selectedLocale ? next : item)
      : [...current, next];
  });
  const defaultVersion = versions.find((item) => item.locale === defaultLocale);

  async function save() {
    if (!token || !loaded || saving || !defaultVersion?.fields.name.trim()) return;
    setSaving(true); setMessage("");
    try {
      const localizations = versions.filter((item) => item.fields.name.trim()).map((item) => ({
        locale: item.locale,
        name: item.fields.name.trim(),
        summary: item.fields.summary,
        contentMarkdown: item.fields.contentMarkdown,
      }));
      const result = kind === "skin" && skin
        ? await updateSkin(publicId, { name: defaultVersion.fields.name.trim(), description: defaultVersion.fields.summary, tags: parseTags(tags), visibility, model: skin.kind === "cape" ? "default" : model, defaultLocale, localizations, reason: reason.trim() || t("assetEditor.defaultReason") }, token)
        : await apiRequest<{ reviewRequired?: boolean }>(`/api/v1/blueprints/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify({ title: defaultVersion.fields.name.trim(), description: defaultVersion.fields.contentMarkdown, defaultLocale, localizations, reason: reason.trim() || t("assetEditor.defaultReason") }) }, token);
      setMessage(t("reviewRequired" in result && result.reviewRequired === false ? "assetEditor.published" : "assetEditor.submitted"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("assetEditor.saveFailed"));
    } finally { setSaving(false); }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!token) return <LoginRequiredState nextPath={`/${kind === "skin" ? "skins" : "blueprints"}/${publicId}/edit`} description={t("assetEditor.loginRequired")} />;
  if (!loaded) return <><PageFeedback title={t(message ? "assetEditor.loadFailed" : "common.loading")} description={message} tone={message ? "danger" : undefined} />{message ? <div className="pb-8 text-center"><button className="button-secondary focus-ring" type="button" onClick={() => { setMessage(""); setReload((value) => value + 1); }}>{t("common.retry")}</button></div> : null}</>;
  const back = `/${kind === "skin" ? "skins" : "blueprints"}/${publicId}`;
  const editor = <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><div className="mx-auto max-w-6xl px-4 py-7">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="text-sm font-bold text-[var(--accent)]" href={back}>{t("assetEditor.back")}</Link><h1 className="mt-2 text-3xl font-black">{t(kind === "skin" ? "assetEditor.skinTitle" : "assetEditor.blueprintTitle")}</h1><code className="mt-2 block text-xs text-[var(--muted)]">{publicId}</code></div><button className="button-primary focus-ring" disabled={saving || !defaultVersion?.fields.name.trim()} type="button" onClick={() => void save()}>{saving ? t("common.saving") : t("assetEditor.submit")}</button></header>
    <div className="mt-6"><ContentLanguageSwitcher value={selectedLocale} versions={versions} onChange={setSelectedLocale} /></div>
    <section className="mt-5 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><label className="text-sm font-bold">{t("assetEditor.name")} ({selectedLocale})<input className="field mt-1" maxLength={kind === "skin" ? 80 : 120} value={selected.fields.name} onChange={(event) => updateFields({ name: event.target.value })} /></label>
      {kind === "skin" ? <label className="text-sm font-bold">{t("assetEditor.introduction")} ({selectedLocale})<textarea className="field mt-1 min-h-32" maxLength={1000} value={selected.fields.summary} onChange={(event) => updateFields({ summary: event.target.value })} /></label> : <ToolsPlayground embedded editorTitle={`${t("assetEditor.introduction")} (${selectedLocale})`} value={selected.fields.contentMarkdown} onChange={(contentMarkdown) => updateFields({ contentMarkdown })} />}
    </section>
    {kind === "skin" && skin ? <section className="mt-5 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-3"><label className="text-sm font-bold">{t("assetEditor.tags")}<input className="field mt-1" value={tags} onChange={(event) => setTags(event.target.value)} /></label><label className="text-sm font-bold">{t("assetEditor.visibility")}<select className="field mt-1" value={visibility} onChange={(event) => setVisibility(event.target.value as SkinVisibility)}><option value="public">{t("assetEditor.visibilityPublic")}</option><option value="unlisted">{t("assetEditor.visibilityUnlisted")}</option><option value="private">{t("assetEditor.visibilityPrivate")}</option></select></label>{skin.kind === "skin" ? <label className="text-sm font-bold">{t("assetEditor.armModel")}<select className="field mt-1" value={model} onChange={(event) => setModel(event.target.value as SkinModel)}><option value="default">{t("assetEditor.modelClassic")}</option><option value="slim">{t("assetEditor.modelSlim")}</option></select></label> : null}</section> : null}
    <label className="mt-5 block text-sm font-bold">{t("assetEditor.reason")}<textarea className="field mt-1 min-h-24" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {message ? <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold">{message}</p> : null}
  </div></main>;
  return <ReviewLockGate entityType={kind} publicId={publicId} returnHref={back}>{editor}</ReviewLockGate>;
}

function parseTags(value: string) { return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))]; }
