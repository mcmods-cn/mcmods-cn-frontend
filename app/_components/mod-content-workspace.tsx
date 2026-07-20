"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import type { BackendModCompatibility, BackendModRecord, MinecraftVersionConfig } from "../_lib/mod-api";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import {
  archiveModContentSection,
  createModContentSection,
  createModContentTemplate,
  createModContentVersion,
  loadModContentSections,
  loadModContentTemplates,
  loadModContentVersions,
  type ModContentLocalization,
  type ModContentSection,
  type ModContentTemplate,
  type ModContentVersion,
  updateModContentVersion,
} from "../_lib/mod-content-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { ModExportImportModal } from "./mod-export-data";

type ImportSource = "" | "icon" | "exporter";
type VersionDraft = { minecraftVersions: string[]; loaders: string[]; modVersion: string; reason: string };

const emptyVersion = (): VersionDraft => ({ minecraftVersions: [], loaders: [], modVersion: "", reason: "" });
const emptyLocalization = (locale: string): ModContentLocalization => ({ locale, name: "", summary: "", contentMarkdown: "" });

export function ModContentWorkspace({ siteId, token, initialImportSource = "", initialVersionId = "", createNew = false }: { siteId: string; token: string; initialImportSource?: ImportSource; initialVersionId?: string; createNew?: boolean }) {
  const { locale, t } = useI18n();
  const customTemplatePrefix = useId().replace(/[^a-z0-9]/gi, "").toLowerCase();
  const customTemplateSequence = useRef(0);
  const [versions, setVersions] = useState<ModContentVersion[]>([]);
  const [templates, setTemplates] = useState<ModContentTemplate[]>([]);
  const [sections, setSections] = useState<ModContentSection[]>([]);
  const [compatibilities, setCompatibilities] = useState<BackendModCompatibility[]>([]);
  const [minecraftConfig, setMinecraftConfig] = useState<MinecraftVersionConfig>({ versions: [], loaders: [] });
  const [usingGlobalCompatibility, setUsingGlobalCompatibility] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(initialVersionId);
  const [importSource, setImportSource] = useState<ImportSource>(initialImportSource);
  const [addingVersion, setAddingVersion] = useState(createNew);
  const [editingVersion, setEditingVersion] = useState(false);
  const [versionDraft, setVersionDraft] = useState<VersionDraft>(emptyVersion);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    const [nextVersions, nextTemplates, nextSections, mod, nextMinecraftConfig] = await Promise.all([
      loadModContentVersions(siteId, token),
      loadModContentTemplates(siteId, token),
      loadModContentSections(siteId, token),
      apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}/editor`, {}, token),
      apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions"),
    ]);
    setVersions(nextVersions);
    setTemplates(nextTemplates);
    setSections(nextSections);
    setMinecraftConfig(nextMinecraftConfig);
    const hasModCompatibility = Boolean(mod.compatibilities?.length);
    const allMinecraftVersions = nextMinecraftConfig.versions.map((item) => item.code);
    setCompatibilities(hasModCompatibility ? mod.compatibilities : nextMinecraftConfig.loaders.map((loader) => ({ loader: loader.code, versions: allMinecraftVersions })));
    setUsingGlobalCompatibility(!hasModCompatibility);
    setSelectedVersionId((current) => nextVersions.some((item) => item.publicId === current) ? current : nextVersions.find((item) => item.status === "active")?.publicId || nextVersions[0]?.publicId || "");
    if (!nextVersions.length) setAddingVersion(true);
    return nextVersions;
  }, [siteId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload().catch((reason) => setMessage(errorText(reason))); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const selectedVersion = versions.find((item) => item.publicId === selectedVersionId);
  const currentSections = useMemo(() => sections.filter((item) => item.versionPublicId === selectedVersionId), [sections, selectedVersionId]);

  function selectVersion(publicId: string) {
    setSelectedVersionId(publicId);
    setAddingVersion(false);
    setEditingVersion(false);
    setMessage("");
    const query = new URLSearchParams({ version: publicId });
    if (importSource) query.set("import", importSource);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  function startNewVersion() {
    setAddingVersion(true);
    setEditingVersion(false);
    setVersionDraft(emptyVersion());
    setMessage("");
    const query = new URLSearchParams({ new: "1" });
    if (importSource) query.set("import", importSource);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  function startVersionEdit() {
    if (!selectedVersion) return;
    setAddingVersion(false);
    setEditingVersion(true);
    setImportSource("");
    setTypeDialogOpen(false);
    setVersionDraft({ minecraftVersions: selectedVersion.minecraftVersions, loaders: selectedVersion.loaders, modVersion: selectedVersion.modVersion, reason: "" });
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?version=${encodeURIComponent(selectedVersion.publicId)}`);
  }

  function selectWorkspaceMode(source: ImportSource) {
    if (!selectedVersion) return;
    setAddingVersion(false);
    setEditingVersion(false);
    setImportSource(source);
    setTypeDialogOpen(false);
    const query = new URLSearchParams({ version: selectedVersion.publicId });
    if (source) query.set("import", source);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  async function saveVersion() {
    setBusy(true);
    setMessage("");
    try {
      const payload = { label: versionLabel(versionDraft.minecraftVersions, versionDraft.loaders), minecraftVersions: versionDraft.minecraftVersions, loaders: versionDraft.loaders, modVersion: versionDraft.modVersion, reason: versionDraft.reason };
      const result = editingVersion && selectedVersion
        ? await updateModContentVersion(siteId, selectedVersion.publicId, { ...payload, baseRevisionId: selectedVersion.publishedRevisionId }, token)
        : await createModContentVersion(siteId, payload, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      const nextVersions = await reload();
      if (result.reviewStatus === "approved") {
        const next = nextVersions.find((item) => item.publicId === result.publicId);
        if (next) selectVersion(next.publicId);
      }
      setAddingVersion(false);
      setEditingVersion(false);
      setVersionDraft(emptyVersion());
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createSection(template: ModContentTemplate, displayMode: "compact" | "large") {
    if (!selectedVersion) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await createModContentSection(siteId, {
        versionPublicId: selectedVersion.publicId,
        templatePublicId: template.publicId,
        parentPublicId: "",
        defaultLocale: locale,
        displayMode,
        ordinal: currentSections.length,
        localizations: [],
        resources: [],
        reason: t("modContent.versionEditor.addTypeReason"),
      }, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      setTypeDialogOpen(false);
      await reload();
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createCustomSection(input: { displayMode: "compact" | "large"; defaultLocale: string; localizations: ModContentLocalization[] }) {
    setBusy(true);
    setMessage("");
    try {
      customTemplateSequence.current += 1;
      const templateResult = await createModContentTemplate(siteId, {
        code: `custom_${customTemplatePrefix}_${customTemplateSequence.current}`,
        defaultLocale: input.defaultLocale,
        defaultDisplayMode: input.displayMode,
        definition: {},
        localizations: input.localizations.filter((item) => item.name.trim()),
        reason: t("modContent.versionEditor.addCustomTypeReason"),
      }, token);
      if (templateResult.reviewStatus === "pending") {
        setMessage(t("modContent.versionEditor.customTemplatePending"));
        setTypeDialogOpen(false);
        await reload();
        return;
      }
      const template = (await loadModContentTemplates(siteId, token)).find((item) => item.publicId === templateResult.publicId);
      if (!template) throw new Error(t("modContent.versionEditor.templateUnavailable"));
      await createSection(template, input.displayMode);
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid min-h-[680px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="border-b border-[var(--line)] bg-[var(--panel-subtle)] p-4 lg:border-b-0 lg:border-r"><h2 className="font-black">{t("modContent.versionEditor.versionList")}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("modContent.versionEditor.versionListHint")}</p><div className="mt-4 grid gap-2">{versions.map((version) => <button className={`focus-ring rounded-lg border p-3 text-left ${version.publicId === selectedVersionId && !addingVersion ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel)]"}`} key={version.publicId} type="button" onClick={() => selectVersion(version.publicId)}><strong className="block truncate">{version.label}</strong><small className="mt-1 block truncate text-[var(--muted)]">{version.minecraftVersions.join(", ")} · {version.loaders.join(", ")}</small>{version.status !== "active" ? <span className="mt-2 inline-block rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--warning)]">{version.status}</span> : null}</button>)}</div><button aria-label={t("modContent.entry.addVersion")} className={`focus-ring mt-3 grid h-11 w-full place-items-center rounded-lg border border-dashed text-2xl font-black ${addingVersion ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"}`} type="button" onClick={startNewVersion}>+</button></aside>
    <div className="min-w-0 p-5 lg:p-7">
      {message ? <p className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm font-bold">{message}</p> : null}
      {addingVersion || !selectedVersion ? <VersionForm busy={busy} compatibilities={compatibilities} draft={versionDraft} editing={false} minecraftConfig={minecraftConfig} usingGlobalCompatibility={usingGlobalCompatibility} onCancel={selectedVersion ? () => setAddingVersion(false) : undefined} onChange={setVersionDraft} onSave={() => void saveVersion()} /> : <>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div><h2 className="text-2xl font-black">{selectedVersion.label}</h2><p className="mt-2 text-sm text-[var(--muted)]">{selectedVersion.minecraftVersions.join(", ")} · {selectedVersion.loaders.join(", ")}{selectedVersion.modVersion ? ` · ${selectedVersion.modVersion}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={workspaceModeButton(editingVersion)} style={workspaceModeStyle(editingVersion)} type="button" onClick={startVersionEdit}>{t("modContent.versionEditor.editVersion")}</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "")} style={workspaceModeStyle(!editingVersion && importSource === "")} disabled={selectedVersion.status !== "active"} type="button" onClick={() => selectWorkspaceMode("")}>{t("modContent.versionEditor.manualAdd")}</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "exporter")} style={workspaceModeStyle(!editingVersion && importSource === "exporter")} disabled={selectedVersion.status !== "active"} type="button" onClick={() => selectWorkspaceMode("exporter")}>mcmods_exporter</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "icon")} style={workspaceModeStyle(!editingVersion && importSource === "icon")} disabled={selectedVersion.status !== "active"} type="button" onClick={() => selectWorkspaceMode("icon")}>IconExporter</button>
          </div>
        </header>
        {editingVersion ? <VersionForm busy={busy} compatibilities={compatibilities} draft={versionDraft} editing minecraftConfig={minecraftConfig} usingGlobalCompatibility={usingGlobalCompatibility} onCancel={() => setEditingVersion(false)} onChange={setVersionDraft} onSave={() => void saveVersion()} /> : importSource === "exporter" ? <ExporterImportPanel onImported={reload} siteId={siteId} token={token} version={selectedVersion} /> : importSource === "icon" ? <IconExportPanel siteId={siteId} token={token} version={selectedVersion} /> : <div className="mt-6"><div className="mb-4"><h3 className="text-lg font-black">{t("modContent.versionEditor.contentTypes")}</h3><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.versionEditor.contentTypesHint")}</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{currentSections.map((section) => <ContentTypeCard key={section.publicId} locale={locale} section={section} siteId={siteId} templates={templates} onDelete={() => void archiveSection(section)} />)}<AddContentPageCard disabled={selectedVersion.status !== "active"} onClick={() => setTypeDialogOpen(true)} /></div></div>}
      </>}
    </div>
    {typeDialogOpen && selectedVersion ? <AddContentTypeDialog busy={busy} locale={locale} templates={templates} onClose={() => setTypeDialogOpen(false)} onPreset={(template, displayMode) => void createSection(template, displayMode)} onCustom={(input) => void createCustomSection(input)} /> : null}
  </section>;

  async function archiveSection(section: ModContentSection) {
    setBusy(true);
    setMessage("");
    try {
      const result = await archiveModContentSection(siteId, section.publicId, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      await reload();
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
}

function workspaceModeButton(active: boolean) {
  return `button-secondary focus-ring ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`;
}

function workspaceModeStyle(active: boolean): CSSProperties | undefined {
  return active ? { borderColor: "var(--accent)", backgroundColor: "var(--accent-soft)", color: "var(--accent)" } : undefined;
}

function VersionForm({ draft, editing, busy, compatibilities, minecraftConfig, usingGlobalCompatibility, onChange, onSave, onCancel }: { draft: VersionDraft; editing: boolean; busy: boolean; compatibilities: BackendModCompatibility[]; minecraftConfig: MinecraftVersionConfig; usingGlobalCompatibility: boolean; onChange: (draft: VersionDraft) => void; onSave: () => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const loaderVersions = new Map(compatibilities.map((item) => [item.loader, new Set(item.versions)]));
  const allVersions = uniqueValues([...compatibilities.flatMap((item) => item.versions), ...draft.minecraftVersions]);
  const allLoaders = uniqueValues([...compatibilities.map((item) => item.loader), ...draft.loaders]);
  const availableVersions = new Set(allVersions.filter((version) => !draft.loaders.length || draft.loaders.every((loader) => loaderVersions.get(loader)?.has(version))));
  const availableLoaders = new Set(allLoaders.filter((loader) => !draft.minecraftVersions.length || draft.minecraftVersions.every((version) => loaderVersions.get(loader)?.has(version))));
  return <section className="mx-auto max-w-2xl"><h2 className="text-2xl font-black">{t(editing ? "modContent.versionEditor.editVersion" : "modContent.versionEditor.newVersion")}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionEditor.newVersionHint")}</p><div className="mt-6 grid gap-5">{compatibilities.length ? <><fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{t("modContent.minecraftVersions")}</legend><MinecraftVersionPicker className="w-full" config={minecraftConfig} optionCodes={[...availableVersions]} values={draft.minecraftVersions} onChange={(minecraftVersions) => onChange({ ...draft, minecraftVersions })} /></fieldset><ChoiceGrid label={t("modContent.loaders")} options={allLoaders} selected={draft.loaders} available={availableLoaders} onToggle={(loader) => onChange({ ...draft, loaders: toggleValue(draft.loaders, loader) })} /><p className="-mt-2 text-xs leading-5 text-[var(--muted)]">{t(usingGlobalCompatibility ? "modContent.versionEditor.globalCompatibilityHint" : "modContent.versionEditor.compatibilityHint")}</p></> : <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm font-bold text-[var(--warning)]">{t("modContent.versionEditor.noCompatibility")}</p>}<input className="field" placeholder={t("modContent.modVersion")} value={draft.modVersion} onChange={(event) => onChange({ ...draft, modVersion: event.target.value })} /><input className="field" placeholder={t("modContent.reason")} value={draft.reason} onChange={(event) => onChange({ ...draft, reason: event.target.value })} /><div className="flex gap-2"><button className="button-primary focus-ring flex-1" disabled={busy || !draft.minecraftVersions.length || !draft.loaders.length} type="button" onClick={onSave}>{t(editing ? "common.save" : "modContent.addVersion")}</button>{onCancel ? <button className="button-secondary focus-ring" type="button" onClick={onCancel}>{t("common.cancel")}</button> : null}</div></div></section>;
}

function ChoiceGrid({ label, options, selected, available, onToggle }: { label: string; options: string[]; selected: string[]; available: Set<string>; onToggle: (value: string) => void }) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{label}</legend><div className="flex flex-wrap gap-2">{options.map((option) => { const checked = selected.includes(option); const enabled = checked || available.has(option); return <button aria-pressed={checked} className={`focus-ring rounded-lg border px-3 py-2 text-sm font-bold ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel)]"} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!enabled} key={option} type="button" onClick={() => onToggle(option)}>{option}</button>; })}</div></fieldset>;
}

function ContentTypeCard({ siteId, section, templates, locale, onDelete }: { siteId: string; section: ModContentSection; templates: ModContentTemplate[]; locale: string; onDelete: () => void }) {
  const { t } = useI18n();
  const template = templates.find((item) => item.publicId === section.templatePublicId);
  const name = localizedName(section.localizations, locale) || localizedName(template?.localizations || [], locale) || t(`modContent.templates.${section.templateCode}`);
  const href = `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}`;
  const presentationLabel = section.templateCode === "advancement"
    ? t("modContent.versionEditor.advancementTitle")
    : t(section.displayMode === "compact" ? "modContent.compact" : "modContent.large");
  return <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]"><div className="flex items-start justify-between gap-3"><div><Link className="focus-ring text-lg font-black hover:text-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{name}</Link><p className="mt-2 text-xs font-bold text-[var(--muted)]">{presentationLabel}</p></div><button aria-label={t("common.delete")} className="focus-ring rounded px-2 py-1 text-xs font-bold text-[var(--red)] hover:bg-[var(--panel-subtle)]" type="button" onClick={onDelete}>{t("common.delete")}</button></div><Link className="focus-ring mt-5 block rounded-lg border border-dashed border-[var(--line)] p-4 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{t("modContent.versionEditor.openType", { count: section.resourceCount })}</Link></article>;
}

function AddContentPageCard({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return <button className="focus-ring grid min-h-60 place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-subtle)] p-6 text-center transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} type="button" onClick={onClick}><span><span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-current text-2xl font-black">+</span><strong className="mt-4 block text-lg">{t("modContent.versionEditor.addPage")}</strong><small className="mt-2 block leading-5 text-[var(--muted)]">{t("modContent.versionEditor.addPageHint")}</small></span></button>;
}

function AddContentTypeDialog({ templates, locale, busy, onClose, onPreset, onCustom }: { templates: ModContentTemplate[]; locale: string; busy: boolean; onClose: () => void; onPreset: (template: ModContentTemplate, mode: "compact" | "large") => void; onCustom: (input: { displayMode: "compact" | "large"; defaultLocale: string; localizations: ModContentLocalization[] }) => void }) {
  const { t } = useI18n();
  const builtin = templates.filter((item) => item.builtin);
  const [selected, setSelected] = useState<ModContentTemplate>();
  const [custom, setCustom] = useState(false);
  const [displayMode, setDisplayMode] = useState<"compact" | "large">("compact");
  const [activeLocale, setActiveLocale] = useState(locale);
  const [defaultLocale, setDefaultLocale] = useState(locale);
  const [localizations, setLocalizations] = useState<ModContentLocalization[]>([emptyLocalization(locale)]);
  const value = localizations.find((item) => item.locale === activeLocale) || emptyLocalization(activeLocale);
  const lockedPresentation = selected?.code === "advancement";

  function updateLocalization(change: Partial<ModContentLocalization>) {
    const next = { ...value, ...change };
    setLocalizations((items) => items.some((item) => item.locale === activeLocale)
      ? items.map((item) => item.locale === activeLocale ? next : item)
      : [...items, next]);
  }

  function chooseTemplate(template: ModContentTemplate) {
    setSelected(template);
    setCustom(false);
    setDisplayMode(template.defaultDisplayMode);
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={onClose}>
    <section aria-modal="true" className="surface max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] p-5 shadow-2xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-black">{t("modContent.versionEditor.addType")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.versionEditor.addTypeHint")}</p></div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </header>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {builtin.map((template) => <button className={`focus-ring min-h-20 rounded-lg border p-3 text-left font-bold ${selected?.publicId === template.publicId && !custom ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel)]"}`} key={template.publicId} type="button" onClick={() => chooseTemplate(template)}>{t(`modContent.templates.${template.code}`)}</button>)}
        <button className={`focus-ring min-h-20 rounded-lg border p-3 text-left font-bold ${custom ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel)]"}`} type="button" onClick={() => { setCustom(true); setSelected(undefined); }}>{t("modContent.versionEditor.customType")}</button>
      </div>
      {selected || custom ? <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5">
        <label className="text-sm font-bold">{t("modContent.versionEditor.displayMode")}</label>
        {lockedPresentation
          ? <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-4"><strong>{t("modContent.versionEditor.advancementTitle")}</strong><small className="mt-1 block leading-5 text-[var(--muted)]">{t("modContent.versionEditor.advancementHint")}</small></div>
          : <div className="grid grid-cols-2 gap-2">
            <button className={`focus-ring rounded-lg border p-3 text-left ${displayMode === "compact" ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`} type="button" onClick={() => setDisplayMode("compact")}><strong>{t("modContent.versionEditor.compactTitle")}</strong><small className="mt-1 block text-[var(--muted)]">{t("modContent.versionEditor.compactHint")}</small></button>
            <button className={`focus-ring rounded-lg border p-3 text-left ${displayMode === "large" ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`} type="button" onClick={() => setDisplayMode("large")}><strong>{t("modContent.versionEditor.largeTitle")}</strong><small className="mt-1 block text-[var(--muted)]">{t("modContent.versionEditor.largeHint")}</small></button>
          </div>}
        {custom ? <div className="grid gap-2 rounded-lg border border-[var(--line)] p-3">
          <select className="field" value={activeLocale} onChange={(event) => setActiveLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
          <input className="field" placeholder={t("modContent.localizedName")} value={value.name} onChange={(event) => updateLocalization({ name: event.target.value })} />
          <textarea className="field min-h-20" placeholder={t("modContent.localizedDescription")} value={value.summary} onChange={(event) => updateLocalization({ summary: event.target.value })} />
          <label className="text-xs font-bold text-[var(--muted)]">{t("modContent.versionEditor.defaultLocale")}</label>
          <select className="field" value={defaultLocale} onChange={(event) => setDefaultLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
        </div> : null}
        <button className="button-primary focus-ring" disabled={busy || custom && !localizations.some((item) => item.locale === defaultLocale && item.name.trim())} type="button" onClick={() => custom ? onCustom({ displayMode, defaultLocale, localizations }) : selected && onPreset(selected, selected.code === "advancement" ? selected.defaultDisplayMode : displayMode)}>{t("modContent.versionEditor.confirmAdd")}</button>
      </div> : null}
    </section>
  </div>;
}

function ExporterImportPanel({ siteId, token, version, onImported }: { siteId: string; token: string; version: ModContentVersion; onImported: () => Promise<unknown> }) {
  return <ModExportImportModal disabled={version.status !== "active"} inline onImported={async () => { await onImported(); }} siteId={siteId} targetVersionId={version.publicId} targetVersionLabel={version.label} token={token} />;
}

function IconExportPanel({ siteId, token, version }: { siteId: string; token: string; version: ModContentVersion }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) { setMessage(t("modContent.iconImport.zipOnly")); return; }
    setBusy(true); setMessage("");
    try {
      const uploaded = await uploadUserFileToOSS(file, token, `iconexport:${siteId}:${version.publicId}:${overwrite ? "overwrite" : "preserve"}`);
      setMessage(t("modContent.iconImport.uploaded", { id: uploaded.id }));
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  return <section className="mt-6"><h3 className="text-lg font-black">{t("modContent.iconImport.title")}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("modContent.iconImport.description")}</p><ImportOverwriteChoice checked={overwrite} onChange={setOverwrite} /><label className="mt-5 grid min-h-56 cursor-pointer place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-subtle)] p-8 text-center hover:border-[var(--accent)]"><input accept=".zip,application/zip" className="sr-only" disabled={busy || version.status !== "active"} type="file" onChange={(event) => void upload(event.target.files?.[0])} /><span><strong className="text-lg">{busy ? t("modContent.iconImport.uploading") : t("modContent.iconImport.choose")}</strong><small className="mt-2 block text-[var(--muted)]">{t("modContent.iconImport.hint")}</small></span></label>{message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}</section>;
}

function ImportOverwriteChoice({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  return <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><input className="mt-1 h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><strong className="block">{t("mods.exportImport.overwriteExisting")}</strong><small className="mt-1 block leading-5 text-[var(--muted)]">{t("mods.exportImport.overwriteExistingHint")}</small></span></label>;
}

function localizedName(values: ModContentLocalization[], locale: string) { return values.find((item) => item.locale === locale)?.name || values.find((item) => item.locale === "en")?.name || values[0]?.name || ""; }
function uniqueValues(values: string[]) { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function toggleValue(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function versionLabel(versions: string[], loaders: string[]) { return versions.length && loaders.length ? `${versions.join(", ")} / ${loaders.join(", ")}` : ""; }
function errorText(value: unknown) { return value instanceof Error ? value.message : String(value); }
