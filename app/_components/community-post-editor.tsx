"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { communityPostCollection, communityPostCoverURL, communityPostProjectReferenceLimit, communityPostResourceReferenceLimit, communityProjectTypes, loadCommunityPost, loadCommunityPostCategories, type CommunityPostDraft, type CommunityPostKind, type CommunityPostSeverity, saveCommunityPost } from "../_lib/community-post-api";
import type { Currency } from "../_lib/community-api";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { AspectImageCropDialog } from "./aspect-image-crop-dialog";
import { DraftAutosaveStatus } from "./draft-autosave-status";
import { ResourcePickerDialog } from "./editor/resource-picker-dialog";
import { ModResourceSelectionField } from "./editor/mod-resource-picker";
import { SelectedResourceList } from "./editor/selected-resource-list";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { ToolsPlayground } from "./tools-playground";
import { ReviewLockGate } from "./review-edit-lock";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

const severities: CommunityPostSeverity[] = ["client", "harmless", "minor", "harmful", "severe", "fatal"];

const resourceKindIds = [
  "minecraft.item",
  "minecraft.block",
  "minecraft.fluid",
  "minecraft.entity_type",
  "minecraft.mob_effect",
  "minecraft.enchantment",
  "minecraft.biome",
  "minecraft.dimension",
  "minecraft.key_mapping",
  "minecraft.advancement",
  "minecraft.loot_table",
  "minecraft.structure",
] as const;

export function CommunityPostEditor({ kind, id = "" }: { kind: CommunityPostKind; id?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [draft, setDraft] = useState<CommunityPostDraft>(() => emptyDraft(kind));
  const [categories, setCategories] = useState<string[]>([]);
  const [smallPickerOpen, setSmallPickerOpen] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File>();
  const [coverPreview, setCoverPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [message, setMessage] = useState("");
  const [baseRevisionId, setBaseRevisionId] = useState("");
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const projectValues = draft.projects.map(referenceToPickerResource);
  const resourceValues = draft.resources.map(referenceToPickerResource);
  const resourceKindOptions = resourceKindIds.map((value) => ({
    value,
    label: t(`communityPosts.resourceKinds.${value.slice("minecraft.".length)}`),
  }));
  const collection = communityPostCollection(kind);
  const autoDraft = useAutoDraft({
    draftKey: `community:${kind}:${id || "new"}`,
    projectKey: `community:${kind}:${id || "new"}`,
    editUrl: id ? `/${collection}/${encodeURIComponent(id)}/edit` : `/${collection}/new`,
    enabled: ready && Boolean(token) && !loading,
    kind: "community_post",
    title: draft.title.trim() || t(`communityPosts.${kind}.create`),
    token,
    value: draft,
    onRestore: setDraft,
  });

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  useEffect(() => {
    const controller = new AbortController();
    loadCommunityPostCategories(kind, controller.signal)
      .then((result) => setCategories(result.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, [kind]);

  useEffect(() => {
    if (kind !== "discussion") return;
    apiRequest<{ items: Currency[] }>("/api/v1/economy/currencies", { cache: "no-store" }, token || undefined)
      .then((result) => setCurrencies(result.items.filter((currency) => currency.status === "active")))
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [kind, token]);
  useEffect(() => {
    if (!id || !token) return;
    loadCommunityPost(id, token).then((post) => {
      if (post.kind !== kind) throw new Error("community post kind mismatch");
      setDraft({
        kind: post.kind, category: post.category, title: post.title, sourceLocale: post.sourceLocale, bodyMarkdown: post.bodyMarkdown, minecraftVersions: post.minecraftVersions,
        modVersionMin: post.modVersionMin || "", modVersionMax: post.modVersionMax || "", severity: post.severity || "minor",
        hasFix: Boolean(post.hasFix), issueUrl: post.issueUrl || "", coverFileId: post.coverFileId,
        bountyCurrency: post.bounty?.currency || "", bountyAmount: post.bounty?.amount || 0,
        projects: post.projects, resources: post.resources,
      });
      setBaseRevisionId(post.publishedRevisionId || "");
      setCoverPreview(communityPostCoverURL(post.coverUrl));
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
  }, [id, kind, token]);

  async function submit() {
    if (!token) return;
    if (!draft.title.trim() || !draft.bodyMarkdown.trim()) { setMessage(t("communityPosts.validation.content")); return; }
    if (!draft.sourceLocale) { setMessage(t("communityPosts.validation.sourceLocale")); return; }
    if (draft.projects.length > communityPostProjectReferenceLimit || draft.resources.length > communityPostResourceReferenceLimit) { setMessage(t("communityPosts.validation.referenceLimit", { projects: communityPostProjectReferenceLimit, resources: communityPostResourceReferenceLimit })); return; }
    if (kind === "issue" && !draft.projects.length) { setMessage(t("communityPosts.validation.issueProject")); return; }
    if (kind === "issue" && (!draft.minecraftVersions.length || (!(draft.modVersionMin || "").trim() && !(draft.modVersionMax || "").trim()))) { setMessage(t("communityPosts.validation.issueVersions")); return; }
    if (kind === "discussion" && Boolean(draft.bountyCurrency) !== ((draft.bountyAmount || 0) > 0)) { setMessage(t("communityPosts.validation.bounty")); return; }
    setBusy(true);
    setMessage("");
    try {
      const result = await saveCommunityPost(draft, token, id, baseRevisionId);
      const targetUrl = `/${communityPostCollection(kind)}/${result.id}`;
      await autoDraft.completeDraft({
        projectKey: `community:${kind}:${result.id}`,
        projectTitle: draft.title.trim(),
        targetUrl,
        changeRequestId: result.changeRequestId,
      }).catch(() => undefined);
      router.push(targetUrl);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === "COMMUNITY_POST_EDIT_CONFLICT") {
        setMessage(t("communityPosts.validation.editConflict"));
        return;
      }
      setMessage(error instanceof Error ? error.message : t("communityPosts.validation.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCoverCrop(output: { files: Map<string, File>; previewUrl: string }) {
    const file = output.files.get("cover");
    if (!file || !token) return;
    setCoverCropFile(undefined);
    setBusy(true);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, "community_cover");
      setDraft((current) => ({ ...current, coverFileId: uploaded.id }));
      setCoverPreview(output.previewUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath={id ? `/${collection}/${id}/edit` : `/${collection}/new`} />;
  if (loading) return <PageFeedback title={t("common.loading")} />;

  const editor = <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]">
    <article className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5"><div><Link className="font-bold text-[var(--accent)] hover:underline" href={`/${communityPostCollection(kind)}`}>← {t(`communityPosts.${kind}.title`)}</Link><h1 className="mt-2 text-3xl font-black">{id ? t("common.edit") : t(`communityPosts.${kind}.create`)}</h1></div><div className="grid justify-items-end gap-2"><DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} /><button className="button-primary focus-ring" disabled={busy || loading} type="button" onClick={() => void submit()}>{busy ? t("common.loading") : t("common.submit")}</button></div></header>
      {message ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
      <div className="mt-6 grid gap-6">
        <label className="block font-black">{t("communityPosts.fields.title")}<input className="field mt-2" maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="font-black">{t("communityPosts.fields.category")}<select className="field mt-2" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{t(`communityPosts.categories.${kind}.${category}`)}</option>)}</select></label>
        <label className="font-black">{t("communityPosts.fields.sourceLocale")}<select className="field mt-2" required value={draft.sourceLocale || ""} onChange={(event) => setDraft({ ...draft, sourceLocale: event.target.value })}><option disabled value="">{t("communityPosts.fields.sourceLocalePlaceholder")}</option>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select><span className="mt-2 block text-sm font-normal text-[var(--muted)]">{t("communityPosts.fields.sourceLocaleHint")}</span></label>
        {kind !== "news" ? <fieldset><legend className="mb-2 font-black">{t("communityPosts.fields.minecraftVersions")}</legend><MinecraftVersionPicker values={draft.minecraftVersions} onChange={(minecraftVersions) => setDraft({ ...draft, minecraftVersions })} /></fieldset> : null}
        {kind === "issue" ? <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 md:grid-cols-2">
          <label className="font-black">{t("communityPosts.fields.modVersionMin")}<input className="field mt-2" value={draft.modVersionMin} onChange={(event) => setDraft({ ...draft, modVersionMin: event.target.value })} /></label>
          <label className="font-black">{t("communityPosts.fields.modVersionMax")}<input className="field mt-2" value={draft.modVersionMax} onChange={(event) => setDraft({ ...draft, modVersionMax: event.target.value })} /></label>
          <label className="font-black">{t("communityPosts.fields.severity")}<select className="field mt-2" value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value as CommunityPostSeverity })}>{severities.map((severity) => <option key={severity} value={severity}>{t(`communityPosts.severity.${severity}`)}</option>)}</select></label>
          <label className="flex items-center gap-3 self-end rounded-lg border border-[var(--line)] px-4 py-3 font-black"><input checked={draft.hasFix} type="checkbox" onChange={(event) => setDraft({ ...draft, hasFix: event.target.checked })} />{t("communityPosts.fields.hasFix")}</label>
          <label className="font-black md:col-span-2">{t("communityPosts.fields.issueUrl")}<input className="field mt-2" type="url" value={draft.issueUrl} onChange={(event) => setDraft({ ...draft, issueUrl: event.target.value })} /></label>
        </section> : null}
        {kind === "discussion" ? <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 md:grid-cols-2"><div className="md:col-span-2"><h2 className="text-xl font-black">{t("communityPosts.bounty.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{id ? t("communityPosts.bounty.immutable") : t("communityPosts.bounty.description")}</p></div><label className="font-black">{t("communityPosts.bounty.currency")}<select className="field mt-2" disabled={Boolean(id)} value={draft.bountyCurrency || ""} onChange={(event) => setDraft({ ...draft, bountyCurrency: event.target.value, bountyAmount: event.target.value ? draft.bountyAmount || 1 : 0 })}><option value="">{t("communityPosts.bounty.none")}</option>{currencies.map((currency) => <option key={currency.publicId} value={currency.code}>{localizedCurrencyName(currency, locale)}</option>)}</select></label><label className="font-black">{t("communityPosts.bounty.amount")}<input className="field mt-2" disabled={Boolean(id) || !draft.bountyCurrency} max={1_000_000_000_000} min={draft.bountyCurrency ? 1 : 0} step={1} type="number" value={draft.bountyAmount || 0} onChange={(event) => setDraft({ ...draft, bountyAmount: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>{draft.bountyCurrency ? <p className="md:col-span-2 text-sm font-bold text-[var(--warning)]">{t("communityPosts.bounty.taxHint", { rate: ((currencies.find((currency) => currency.code === draft.bountyCurrency)?.transferTaxBps || 0) / 100).toFixed(2) })}</p> : null}</section> : null}
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("communityPosts.fields.projects")}{kind === "issue" ? " *" : ""}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.fields.projectsHint")}</p><div className="mt-4"><ModResourceSelectionField buttonLabel={t("communityPosts.fields.selectProjects")} projectTypes={communityProjectTypes} token={token} value={projectValues} onChange={(values) => { if (values.length > communityPostProjectReferenceLimit) { setMessage(t("communityPosts.validation.referenceLimit", { projects: communityPostProjectReferenceLimit, resources: communityPostResourceReferenceLimit })); return; } setDraft({ ...draft, projects: values.map(pickerResourceToProjectReference) }); }} /></div></section>
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("communityPosts.fields.resources")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.fields.resourcesHint")}</p><div className="mt-4 grid gap-3"><SelectedResourceList items={resourceValues} onRemove={(resource) => setDraft({ ...draft, resources: draft.resources.filter((item) => item.publicId !== resource.publicId) })} /><button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => setSmallPickerOpen(true)}>{t("communityPosts.fields.selectResources")}</button></div></section>
        {kind !== "issue" ? <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("communityPosts.fields.cover")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.fields.coverHint")}</p><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:items-start"><input className="field" accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => setCoverCropFile(event.target.files?.[0])} /><div className="relative aspect-[121/75] overflow-hidden rounded-lg bg-[var(--panel-subtle)]">{coverPreview ? <Image unoptimized fill alt="" className="object-cover" src={coverPreview} /> : <span className="grid h-full place-items-center font-bold text-[var(--muted)]">121 : 75</span>}</div></div></section> : null}
        <section><div className="mb-2 flex items-center justify-between"><h2 className="text-xl font-black">{t("communityPosts.fields.content")}</h2><span className="text-sm text-[var(--muted)]">Markdown</span></div><ToolsPlayground embedded documentId={`community-post:${kind}:${id || "draft"}:body`} editorTitle={t("communityPosts.fields.content")} uploadSource="community_post_text:draft" value={draft.bodyMarkdown} onChange={(bodyMarkdown) => setDraft({ ...draft, bodyMarkdown })} /></section>
      </div>
    </article>
    <ResourcePickerDialog allowUnresolved multiple initialKind="minecraft.item" kindOptions={resourceKindOptions} open={smallPickerOpen} token={token} value={resourceValues} labels={{ title: t("communityPosts.fields.selectResources"), kind: t("communityPosts.fields.resourceKind"), manualPlaceholder: "minecraft:resource_id" }} onClose={() => setSmallPickerOpen(false)} onConfirm={(values) => { if (values.length > communityPostResourceReferenceLimit) { setMessage(t("communityPosts.validation.referenceLimit", { projects: communityPostProjectReferenceLimit, resources: communityPostResourceReferenceLimit })); return; } setDraft({ ...draft, resources: values.map(pickerResourceToSmallReference) }); setSmallPickerOpen(false); }} />
    <AspectImageCropDialog aspectHeight={75} aspectWidth={121} file={coverCropFile} outputs={[{ key: "cover", width: 1210, height: 750, type: "image/webp", quality: 0.86 }]} onCancel={() => setCoverCropFile(undefined)} onConfirm={(output) => void confirmCoverCrop(output)} />
  </main>;
  return id
    ? <ReviewLockGate entityType="community_post" publicId={id} returnHref={`/${communityPostCollection(kind)}/${id}`}>{editor}</ReviewLockGate>
    : editor;
}

function emptyDraft(kind: CommunityPostKind): CommunityPostDraft {
  const category = { tutorial: "general", issue: "client", news: "site", discussion: "help" }[kind];
  return { kind, category, title: "", sourceLocale: "", bodyMarkdown: "", minecraftVersions: [], modVersionMin: "", modVersionMax: "", severity: "minor", hasFix: false, issueUrl: "", bountyCurrency: "", bountyAmount: 0, projects: [], resources: [] };
}

function localizedCurrencyName(currency: Currency, locale: string) {
  const translation = currency.translations?.[locale];
  if (translation && typeof translation === "object" && "name" in translation && typeof translation.name === "string" && translation.name) return translation.name;
  return currency.name || currency.code;
}

function referenceToPickerResource(reference: CommunityPostDraft["projects"][number]): CatalogResourceRef {
  return { publicId: reference.publicId || `unresolved:${reference.type || reference.kind || "resource"}:${reference.identifier}`, id: reference.identifier, registry: reference.type || reference.kind || "", kind: reference.kind || reference.type || "resource", names: reference.names || {}, resolvedName: reference.name, iconUrl: reference.iconUrl, unresolved: reference.unresolved, rawIdentifier: reference.unresolved ? reference.identifier : undefined, source: { publicId: reference.publicId, siteId: reference.siteId, name: reference.name } };
}

function pickerResourceToProjectReference(resource: CatalogResourceRef) {
  return { publicId: resource.unresolved ? undefined : resource.publicId, type: resource.kind || "mod", identifier: resource.rawIdentifier || resource.id, name: resource.resolvedName, siteId: resource.source?.siteId, names: resource.names, iconUrl: resource.iconUrl, unresolved: resource.unresolved };
}

function pickerResourceToSmallReference(resource: CatalogResourceRef) {
  return { publicId: resource.unresolved ? undefined : resource.publicId, kind: resource.kind || "minecraft.item", identifier: resource.rawIdentifier || resource.id, name: resource.resolvedName, names: resource.names, iconUrl: resource.iconUrl, unresolved: resource.unresolved };
}
