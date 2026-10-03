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
import { localizedAssetContentPayload } from "../_lib/localized-asset-update.mts";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { ToolsPlayground } from "./tools-playground";
import { ReviewLockGate } from "./review-edit-lock";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

type AssetKind = "skin" | "blueprint";

export function LocalizedAssetEditor({ kind, publicId }: { kind: AssetKind; publicId: string }) {
  const { token, user } = useAuthSnapshot();
  return <LocalizedAssetEditorForm key={`${user?.id || "guest"}:${token || "guest"}:${kind}:${publicId}`} kind={kind} publicId={publicId} />;
}

function LocalizedAssetEditorForm({ kind, publicId }: { kind: AssetKind; publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(locale);
  const [versions, setVersions] = useState<LocalizationVersion<LocalizedContentFields>[]>([]);
  const [skin, setSkin] = useState<SkinTexture | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintDetailRecord | null>(null);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<SkinVisibility>("public");
  const [model, setModel] = useState<SkinModel>("default");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [markdownBusy, setMarkdownBusy] = useState(false);
  const markdownBusyRef = useRef(false);
  const savingRef = useRef(false);
  const loadedEditorKey = useRef("");

  useEffect(() => {
    if (!ready || !token) return;
    const editorKey = `${kind}:${publicId}:${token}`;
    if (loadedEditorKey.current === editorKey) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setLoading(true); setMessage(""); } });
    void (async () => {
      try {
        const base = kind === "skin"
          ? await loadSkin(publicId, token)
          : await apiRequest<BlueprintDetailRecord>(`/api/v1/blueprints/${encodeURIComponent(publicId)}`, {}, token);
        // A failed read cannot establish that there are no language versions.
        // Updates replace the full localization snapshot, so preserve the read
        // failure and require a successful retry before exposing the editor.
        const rawContent = await apiRequest<unknown>(`/api/v1/${kind === "skin" ? "skins" : "blueprints"}/${encodeURIComponent(publicId)}/content?locale=${encodeURIComponent(locale)}`, {}, token);
        const content = normalizeResolvedContent(rawContent);
        if (cancelled) return;
        loadedEditorKey.current = editorKey;
        if (kind === "skin") {
          const value = base as SkinTexture;
          setSkin(value); setTags(value.tags.join(", ")); setVisibility(value.visibility); setModel(value.model);
        } else setBlueprint(base as BlueprintDetailRecord);
        const fallback = kind === "skin"
          ? { name: (base as SkinTexture).name, summary: (base as SkinTexture).description || "", contentMarkdown: "" }
          : { name: (base as BlueprintDetailRecord).title, summary: "", contentMarkdown: (base as BlueprintDetailRecord).description || "" };
        setVersions(content?.available.length ? content.available : [{ locale: content?.defaultLocale || locale, fields: fallback, provenance: "human", reviewStatus: "approved", editable: true }]);
        setDefaultLocale((content?.defaultLocale || locale) as Locale);
        setSelectedLocale((content?.resolvedLocale || content?.defaultLocale || locale) as Locale);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("assetEditor.loadFailed"));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [kind, loadAttempt, locale, publicId, ready, t, token]);

  const selected = versions.find((item) => item.locale === selectedLocale) ?? {
    locale: selectedLocale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human" as const, reviewStatus: "draft" as const, editable: true,
  };
  const updateFields = (fields: Partial<LocalizedContentFields>) => setVersions((current) => {
    const next = { ...selected, fields: { ...selected.fields, ...fields } };
    return current.some((item) => item.locale === selectedLocale)
      ? current.map((item) => item.locale === selectedLocale ? next : item)
      : [...current, next];
  });
  const defaultVersion = versions.find((item) => item.locale === defaultLocale) ?? selected;

  async function save() {
    if (!token || savingRef.current || markdownBusyRef.current || (!skin && !blueprint) || !defaultVersion.fields.name.trim()) return;
    savingRef.current = true;
    setSaving(true); setMessage("");
    try {
      const content = localizedAssetContentPayload(defaultLocale, versions);
      if (kind === "skin" && skin) {
        await updateSkin(publicId, { name: defaultVersion.fields.name.trim(), description: defaultVersion.fields.summary, tags: parseTags(tags), visibility, model: skin.kind === "cape" ? "default" : model, reason: reason.trim() || t("assetEditor.defaultReason"), ...content }, token);
      } else if (kind === "blueprint" && blueprint) {
        await apiRequest(`/api/v1/blueprints/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify({ title: defaultVersion.fields.name.trim(), description: defaultVersion.fields.contentMarkdown, reason: reason.trim() || t("assetEditor.defaultReason"), ...content }) }, token);
      }
      setMessage(t("assetEditor.submitted"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("assetEditor.saveFailed"));
    } finally { savingRef.current = false; setSaving(false); }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!token) return <LoginRequiredState nextPath={`/${kind === "skin" ? "skins" : "blueprints"}/${publicId}/edit`} description={t("assetEditor.loginRequired")} />;
  if (loading) return <PageFeedback title={t("common.loading")} />;
  if (!skin && !blueprint) return <PageFeedback title={t("assetEditor.loadFailed")} description={message} tone="danger" action={<button className="button-secondary focus-ring" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("common.retry")}</button>} />;
  const back = `/${kind === "skin" ? "skins" : "blueprints"}/${publicId}`;
  const editor = <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><div className="mx-auto max-w-6xl px-4 py-7">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="text-sm font-bold text-[var(--accent)]" href={back}>{t("assetEditor.back")}</Link><h1 className="mt-2 text-3xl font-black">{t(kind === "skin" ? "assetEditor.skinTitle" : "assetEditor.blueprintTitle")}</h1><code className="mt-2 block text-xs text-[var(--muted)]">{publicId}</code></div><button className="button-primary focus-ring" disabled={saving || markdownBusy || !defaultVersion.fields.name.trim()} type="button" onClick={() => void save()}>{saving ? t("common.saving") : t("assetEditor.submit")}</button></header>
    <fieldset disabled={saving}>
    <div className="mt-6"><ContentLanguageSwitcher value={selectedLocale} versions={versions} onChange={setSelectedLocale} /></div>
    <section className="mt-5 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><label className="text-sm font-bold">{t("assetEditor.name")} ({selectedLocale})<input className="field mt-1" maxLength={120} value={selected.fields.name} onChange={(event) => updateFields({ name: event.target.value })} /></label>
      {kind === "skin" ? <label className="text-sm font-bold">{t("assetEditor.introduction")} ({selectedLocale})<textarea className="field mt-1 min-h-32" maxLength={1000} value={selected.fields.summary} onChange={(event) => updateFields({ summary: event.target.value })} /></label> : <ToolsPlayground embedded documentId={`${kind}:${publicId}:${selectedLocale}:content`} editorTitle={`${t("assetEditor.introduction")} (${selectedLocale})`} value={selected.fields.contentMarkdown} onChange={(contentMarkdown) => updateFields({ contentMarkdown })} onBusyChange={(value) => { markdownBusyRef.current = value; setMarkdownBusy(value); }} />}
    </section>
    {kind === "skin" && skin ? <section className="mt-5 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-3"><label className="text-sm font-bold">{t("assetEditor.tags")}<input className="field mt-1" value={tags} onChange={(event) => setTags(event.target.value)} /></label><label className="text-sm font-bold">{t("assetEditor.visibility")}<select className="field mt-1" value={visibility} onChange={(event) => setVisibility(event.target.value as SkinVisibility)}><option value="public">{t("assetEditor.visibilityPublic")}</option><option value="unlisted">{t("assetEditor.visibilityUnlisted")}</option><option value="private">{t("assetEditor.visibilityPrivate")}</option></select></label>{skin.kind === "skin" ? <label className="text-sm font-bold">{t("assetEditor.armModel")}<select className="field mt-1" value={model} onChange={(event) => setModel(event.target.value as SkinModel)}><option value="default">{t("assetEditor.modelClassic")}</option><option value="slim">{t("assetEditor.modelSlim")}</option></select></label> : null}</section> : null}
    <label className="mt-5 block text-sm font-bold">{t("assetEditor.reason")}<textarea className="field mt-1 min-h-24" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </fieldset>
    {message ? <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold">{message}</p> : null}
  </div></main>;
  return <ReviewLockGate entityType={kind} publicId={publicId} returnHref={back}>{editor}</ReviewLockGate>;
}

function parseTags(value: string) { return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))]; }
