"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useId, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { normalizeContentLanguage } from "../_lib/content-language";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import type { BackendModCompatibility, BackendModRecord, MinecraftVersionConfig } from "../_lib/mod-api";
import { loadMinecraftVersionConfig } from "../_lib/minecraft-version-api";
import { MinecraftVersionPicker, summarizeMinecraftVersions } from "./minecraft-version-picker";
import {
  archiveModContentSection,
  createModContentSection,
  createModContentTemplate,
  createModContentVersion,
  loadModContentSections,
  loadModContentTemplates,
  loadModContentVersions,
  type ModContentLocalization,
  type ModContentMutationResult,
  type ModContentSection,
  type ModContentTemplate,
  type ModContentVersion,
  patchModContentLayout,
  updateModContentVersion,
} from "../_lib/mod-content-api";
import { formatBytes, uploadUserFileToOSS } from "../_lib/oss-upload";
import { ModExportImportModal } from "./mod-catalog-data";
import {
  cancelModExportJob,
  confirmModExportMODIDMismatch,
  retryCatalogImportJob,
  type CatalogImportSource,
  type ModExportJob,
  type ModExportUploadProgress,
  uploadEmbeddedIconCatalog,
  waitForCatalogImportJob,
} from "../_lib/mod-export-api";
import { MODIDConfirmationCard } from "./modid-confirmation-card";
import { CustomContentTemplateSettings } from "./custom-content-template-settings";
import { FileDropZone } from "./file-drop-zone";

type ImportSource = "" | "icon" | "exporter" | CatalogImportSource;
type VersionDraft = { minecraftVersions: string[]; loaders: string[]; modVersion: string; reason: string };

const emptyVersion = (): VersionDraft => ({ minecraftVersions: [], loaders: [], modVersion: "", reason: "" });
const emptyLocalization = (locale: string): ModContentLocalization => ({ locale, name: "", summary: "", contentMarkdown: "" });

export function ModContentWorkspace({ siteId, subjectId, token, initialImportSource = "", initialVersionId = "", createNew = false }: { siteId: string; subjectId: string; token: string; initialImportSource?: ImportSource; initialVersionId?: string; createNew?: boolean }) {
  const { locale, t } = useI18n();
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
  const saveVersionInFlight = useRef(false);
  const sectionMutationInFlight = useRef(false);
  const createdCustomTemplate = useRef<{ fingerprint: string; result: ModContentMutationResult } | undefined>(undefined);
  const [activeImportSource, setActiveImportSource] = useState<ImportSource | null>(null);
  const [message, setMessage] = useState("");
  const activeImportRef = useRef<ImportSource | null>(null);
  const importBusy = activeImportSource !== null;
  const updateImportBusy = useCallback((source: ImportSource, active: boolean, hasOperation = active) => {
    activeImportRef.current = active ? source : activeImportRef.current === source ? null : activeImportRef.current;
    setActiveImportSource(activeImportRef.current);
    if (!active || !hasOperation || !selectedVersionId) return;
    setAddingVersion(false);
    setEditingVersion(false);
    setImportSource(source);
    setTypeDialogOpen(false);
    const query = new URLSearchParams({ version: selectedVersionId, import: source });
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }, [selectedVersionId, siteId]);

  const reload = useCallback(async () => {
    const [nextVersions, nextTemplates, nextSections, mod, nextMinecraftConfig] = await Promise.all([
      loadModContentVersions(siteId, token),
      loadModContentTemplates(siteId, token),
      loadModContentSections(siteId, token),
      apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}/editor`, {}, token),
      loadMinecraftVersionConfig(),
    ]);
    setVersions(nextVersions);
    setTemplates(nextTemplates);
    setSections(nextSections);
    setMinecraftConfig(nextMinecraftConfig);
    const hasModCompatibility = Boolean(mod.compatibilities?.length);
    setCompatibilities(hasModCompatibility ? mod.compatibilities : nextMinecraftConfig.loaders.map((loader) => ({ loader: loader.code, versions: [...loader.versions] })));
    setUsingGlobalCompatibility(!hasModCompatibility);
    setSelectedVersionId((current) => nextVersions.some((item) => item.publicId === current) ? current : nextVersions.find((item) => item.status === "active")?.publicId || nextVersions[0]?.publicId || "");
    if (!nextVersions.length) setAddingVersion(true);
    return nextVersions;
  }, [siteId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload().catch((reason) => setMessage(errorText(reason))); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  useEffect(() => {
    if (!importBusy) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [importBusy]);

  const selectedVersion = versions.find((item) => item.publicId === selectedVersionId);
  const currentSections = useMemo(
    () => sections.filter((item) => item.versionPublicId === selectedVersionId && !item.parentPublicId),
    [sections, selectedVersionId],
  );

  function selectVersion(publicId: string, persisted = false) {
    if (activeImportRef.current !== null || busy && !persisted) return;
    setSelectedVersionId(publicId);
    setAddingVersion(false);
    setEditingVersion(false);
    setMessage("");
    const query = new URLSearchParams({ version: publicId });
    if (importSource) query.set("import", importSource);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  function startNewVersion() {
    if (activeImportRef.current !== null || busy) return;
    setAddingVersion(true);
    setEditingVersion(false);
    setVersionDraft(emptyVersion());
    setMessage("");
    const query = new URLSearchParams({ new: "1" });
    if (importSource) query.set("import", importSource);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  function startVersionEdit() {
    if (!selectedVersion || activeImportRef.current !== null || busy) return;
    setAddingVersion(false);
    setEditingVersion(true);
    setImportSource("");
    setTypeDialogOpen(false);
    setVersionDraft({ minecraftVersions: selectedVersion.minecraftVersions, loaders: selectedVersion.loaders, modVersion: selectedVersion.modVersion, reason: "" });
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?version=${encodeURIComponent(selectedVersion.publicId)}`);
  }

  function selectWorkspaceMode(source: ImportSource) {
    if (!selectedVersion || busy) return;
    if (activeImportRef.current !== null && source !== activeImportRef.current) return;
    setAddingVersion(false);
    setEditingVersion(false);
    setImportSource(source);
    setTypeDialogOpen(false);
    const query = new URLSearchParams({ version: selectedVersion.publicId });
    if (source) query.set("import", source);
    window.history.replaceState(null, "", `/mods/${encodeURIComponent(siteId)}/data/edit?${query}`);
  }

  async function saveVersion() {
    if (saveVersionInFlight.current || sectionMutationInFlight.current || activeImportRef.current !== null) return;
    saveVersionInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const payload = { label: versionLabel(versionDraft.minecraftVersions, versionDraft.loaders), minecraftVersions: versionDraft.minecraftVersions, loaders: versionDraft.loaders, modVersion: versionDraft.modVersion, reason: versionDraft.reason };
      const result = editingVersion && selectedVersion
        ? await updateModContentVersion(siteId, selectedVersion.publicId, { ...payload, baseRevisionId: selectedVersion.publishedRevisionId }, token)
        : await createModContentVersion(siteId, payload, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      setAddingVersion(false);
      setEditingVersion(false);
      setVersionDraft(emptyVersion());
      const nextVersions = await reload();
      if (result.reviewStatus === "approved") {
        const next = nextVersions.find((item) => item.publicId === result.publicId);
        if (next) selectVersion(next.publicId, true);
      }
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      saveVersionInFlight.current = false;
      setBusy(false);
    }
  }

  async function persistSection(template: ModContentTemplate, displayMode: "compact" | "large") {
    if (!selectedVersion) return;
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
    // The section has already persisted. A subsequent reload failure must not
    // keep the creation form open and invite a duplicate section.
    createdCustomTemplate.current = undefined;
    setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
    setTypeDialogOpen(false);
    await reload();
  }

  async function createSection(template: ModContentTemplate, displayMode: "compact" | "large") {
    if (!selectedVersion || sectionMutationInFlight.current) return;
    sectionMutationInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await persistSection(template, displayMode);
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      sectionMutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function createCustomSection(input: { displayMode: "compact" | "large"; defaultLocale: string; localizations: ModContentLocalization[] }) {
    if (!selectedVersion || sectionMutationInFlight.current) return;
    sectionMutationInFlight.current = true;
    setBusy(true);
    setMessage("");
    const fingerprint = JSON.stringify([selectedVersion.publicId, input]);
    try {
      const typeNames = Object.fromEntries(input.localizations
        .filter((item) => item.name.trim())
        .map((item) => [item.locale, item.name.trim()]));
      const templateResult = createdCustomTemplate.current?.fingerprint === fingerprint
        ? createdCustomTemplate.current.result
        : await createModContentTemplate(siteId, {
          code: `custom_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
          defaultLocale: input.defaultLocale,
          defaultDisplayMode: input.displayMode,
          definition: {
            resourceKinds: ["import.document"],
            entryTypes: [{ code: "default", kindCodes: ["import.document"], names: typeNames, groups: [] }],
          },
          localizations: input.localizations.filter((item) => item.name.trim()),
          reason: t("modContent.versionEditor.addCustomTypeReason"),
        }, token);
      createdCustomTemplate.current = { fingerprint, result: templateResult };
      if (templateResult.reviewStatus === "pending") {
        setMessage(t("modContent.versionEditor.customTemplatePending"));
        setTypeDialogOpen(false);
        await reload();
        return;
      }
      const availableTemplates = await loadModContentTemplates(siteId, token);
      setTemplates(availableTemplates);
      const template = availableTemplates.find((item) => item.publicId === templateResult.publicId);
      if (!template) throw new Error(t("modContent.versionEditor.templateUnavailable"));
      await persistSection(template, input.displayMode);
    } catch (reason) {
      setMessage(createdCustomTemplate.current?.fingerprint === fingerprint
        ? `${t("modContent.versionEditor.customTemplateSavedRetry")} ${errorText(reason)}`
        : errorText(reason));
    } finally {
      sectionMutationInFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="grid min-h-[680px] min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="min-w-0 max-w-full overflow-hidden border-b border-[var(--line)] bg-[var(--panel-subtle)] p-4 lg:border-b-0 lg:border-r">
      <h2 className="font-black">{t("modContent.versionEditor.versionList")}</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("modContent.versionEditor.versionListHint")}</p>
      <div className="mt-4 grid min-w-0 gap-2">
        {versions.map((version) => {
          const fullCompatibility = `${version.minecraftVersions.join(", ")} · ${version.loaders.join(", ")}`;
          return <button className={`focus-ring min-w-0 max-w-full overflow-hidden rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${version.publicId === selectedVersionId && !addingVersion ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel)]"}`} disabled={importBusy || busy} key={version.publicId} title={fullCompatibility} type="button" onClick={() => selectVersion(version.publicId)}>
            <strong className="block min-w-0 truncate">{version.label}</strong>
            <small className="mt-1 block min-w-0 truncate text-[var(--muted)]">{summarizeMinecraftVersions(version.minecraftVersions, 2)} · {summarizeList(version.loaders, 1)}</small>
            {version.status !== "active" ? <span className="mt-2 inline-block rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--warning)]">{version.status}</span> : null}
          </button>;
        })}
      </div>
      <button aria-label={t("modContent.entry.addVersion")} className={`focus-ring mt-3 grid h-11 w-full place-items-center rounded-lg border border-dashed text-2xl font-black disabled:cursor-not-allowed disabled:opacity-60 ${addingVersion ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"}`} disabled={importBusy || busy} type="button" onClick={startNewVersion}>+</button>
    </aside>
    <div className="min-w-0 p-5 lg:p-7">
      {message ? <p className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm font-bold">{message}</p> : null}
      {addingVersion || !selectedVersion ? <VersionForm busy={busy} compatibilities={compatibilities} draft={versionDraft} editing={false} minecraftConfig={minecraftConfig} usingGlobalCompatibility={usingGlobalCompatibility} onCancel={selectedVersion ? () => setAddingVersion(false) : undefined} onChange={setVersionDraft} onSave={() => void saveVersion()} /> : <>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div className="min-w-0"><h2 className="text-2xl font-black">{selectedVersion.label}</h2><p className="mt-2 max-w-full break-words text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{selectedVersion.minecraftVersions.join(", ")} · {selectedVersion.loaders.join(", ")}{selectedVersion.modVersion ? ` · ${selectedVersion.modVersion}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={workspaceModeButton(editingVersion)} style={workspaceModeStyle(editingVersion)} disabled={importBusy || busy} type="button" onClick={startVersionEdit}>{t("modContent.versionEditor.editVersion")}</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "")} style={workspaceModeStyle(!editingVersion && importSource === "")} disabled={selectedVersion.status !== "active" || importBusy || busy} type="button" onClick={() => selectWorkspaceMode("")}>{t("modContent.versionEditor.manualAdd")}</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "exporter")} style={workspaceModeStyle(!editingVersion && importSource === "exporter")} disabled={busy || selectedVersion.status !== "active" || importBusy && activeImportSource !== "exporter"} type="button" onClick={() => selectWorkspaceMode("exporter")}>mcmods_exporter</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "icon")} style={workspaceModeStyle(!editingVersion && importSource === "icon")} disabled={busy || selectedVersion.status !== "active" || importBusy && activeImportSource !== "icon"} type="button" onClick={() => selectWorkspaceMode("icon")}>IconExporter</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "iconrenderer")} style={workspaceModeStyle(!editingVersion && importSource === "iconrenderer")} disabled={busy || selectedVersion.status !== "active" || importBusy && activeImportSource !== "iconrenderer"} type="button" onClick={() => selectWorkspaceMode("iconrenderer")}>IconRenderer</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "letmeseesee")} style={workspaceModeStyle(!editingVersion && importSource === "letmeseesee")} disabled={busy || selectedVersion.status !== "active" || importBusy && activeImportSource !== "letmeseesee"} type="button" onClick={() => selectWorkspaceMode("letmeseesee")}>LetMeSeeSee (YourCode)</button>
            <button className={workspaceModeButton(!editingVersion && importSource === "irr")} style={workspaceModeStyle(!editingVersion && importSource === "irr")} disabled={busy || selectedVersion.status !== "active" || importBusy && activeImportSource !== "irr"} type="button" onClick={() => selectWorkspaceMode("irr")}>IRR</button>
          </div>
        </header>
        {importBusy ? <p className="mt-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold">{t("modContent.catalogImport.continuesInBackground", { importer: importSourceLabel(activeImportSource) })}</p> : null}
        <div hidden={!editingVersion}><VersionForm busy={busy || importBusy} compatibilities={compatibilities} draft={versionDraft} editing minecraftConfig={minecraftConfig} usingGlobalCompatibility={usingGlobalCompatibility} onCancel={() => setEditingVersion(false)} onChange={setVersionDraft} onSave={() => void saveVersion()} /></div>
        <div className="mt-6" hidden={editingVersion || importSource !== ""}><div className="mb-4"><h3 className="text-lg font-black">{t("modContent.versionEditor.contentTypes")}</h3><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.versionEditor.contentTypesHint")}</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{currentSections.map((section) => <ContentTypeCard busy={busy} key={section.publicId} locale={locale} section={section} siteId={siteId} templates={templates} token={token} onDelete={() => void archiveSection(section)} onDisplayModeChange={(displayMode) => void changeSectionDisplayMode(section, displayMode)} onTemplateSaved={async (result) => { setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved")); await reload(); }} />)}<AddContentPageCard disabled={selectedVersion.status !== "active" || importBusy || busy} onClick={() => setTypeDialogOpen(true)} /></div></div>
        <div hidden={editingVersion || importSource !== "exporter"}><ExporterImportPanel key={selectedVersion.publicId} blocked={importBusy && activeImportSource !== "exporter"} onBusyChange={updateImportBusy} onImported={reload} siteId={siteId} subjectId={subjectId} token={token} version={selectedVersion} /></div>
        <div hidden={editingVersion || importSource !== "icon"}><IconExportPanel key={selectedVersion.publicId} blocked={importBusy && activeImportSource !== "icon"} onBusyChange={updateImportBusy} siteId={siteId} token={token} version={selectedVersion} /></div>
        {(["iconrenderer", "letmeseesee", "irr"] as CatalogImportSource[]).map((source) => <div hidden={editingVersion || importSource !== source} key={`${source}:${selectedVersion.publicId}`}><EmbeddedIconImportPanel blocked={importBusy && activeImportSource !== source} onBusyChange={updateImportBusy} onImported={reload} siteId={siteId} source={source} token={token} version={selectedVersion} /></div>)}
      </>}
    </div>
    {typeDialogOpen && selectedVersion ? <AddContentTypeDialog busy={busy} message={message} locale={locale} templates={templates} onClose={() => { if (!busy && !sectionMutationInFlight.current) setTypeDialogOpen(false); }} onPreset={(template, displayMode) => void createSection(template, displayMode)} onCustom={(input) => void createCustomSection(input)} /> : null}
  </section>;

  async function archiveSection(section: ModContentSection) {
    if (busy || sectionMutationInFlight.current || saveVersionInFlight.current || activeImportRef.current !== null || !window.confirm(t("common.delete"))) return;
    sectionMutationInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await archiveModContentSection(siteId, section.publicId, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      await reload();
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      sectionMutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function changeSectionDisplayMode(section: ModContentSection, displayMode: "compact" | "large") {
    if (busy || sectionMutationInFlight.current || saveVersionInFlight.current || activeImportRef.current !== null || section.templateCode === "advancement" || section.displayMode === displayMode) return;
    sectionMutationInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await patchModContentLayout(siteId, section.publicId, {
        versionPublicId: section.versionPublicId,
        rootSectionPublicId: section.publicId,
        displayMode,
        resources: [],
        reason: t("modContent.versionEditor.changeDisplayModeReason"),
        baseRevisionId: section.publishedRevisionId,
      }, token);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      await reload();
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      sectionMutationInFlight.current = false;
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
  return <section className="mx-auto max-w-2xl"><h2 className="text-2xl font-black">{t(editing ? "modContent.versionEditor.editVersion" : "modContent.versionEditor.newVersion")}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionEditor.newVersionHint")}</p><fieldset disabled={busy} className="mt-6 grid gap-5">{compatibilities.length ? <><fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{t("modContent.minecraftVersions")}</legend><MinecraftVersionPicker className="w-full" config={minecraftConfig} optionCodes={[...availableVersions]} values={draft.minecraftVersions} onChange={(minecraftVersions) => onChange({ ...draft, minecraftVersions })} /></fieldset><ChoiceGrid label={t("modContent.loaders")} options={allLoaders} selected={draft.loaders} available={availableLoaders} onToggle={(loader) => onChange({ ...draft, loaders: toggleValue(draft.loaders, loader) })} /><p className="-mt-2 text-xs leading-5 text-[var(--muted)]">{t(usingGlobalCompatibility ? "modContent.versionEditor.globalCompatibilityHint" : "modContent.versionEditor.compatibilityHint")}</p></> : <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm font-bold text-[var(--warning)]">{t("modContent.versionEditor.noCompatibility")}</p>}<input className="field" placeholder={t("modContent.modVersion")} value={draft.modVersion} onChange={(event) => onChange({ ...draft, modVersion: event.target.value })} /><input className="field" placeholder={t("modContent.reason")} value={draft.reason} onChange={(event) => onChange({ ...draft, reason: event.target.value })} /><div className="flex gap-2"><button className="button-primary focus-ring flex-1" disabled={busy || !draft.minecraftVersions.length || !draft.loaders.length} type="button" onClick={onSave}>{t(editing ? "common.save" : "modContent.addVersion")}</button>{onCancel ? <button className="button-secondary focus-ring" type="button" onClick={onCancel}>{t("common.cancel")}</button> : null}</div></fieldset></section>;
}

function ChoiceGrid({ label, options, selected, available, onToggle }: { label: string; options: string[]; selected: string[]; available: Set<string>; onToggle: (value: string) => void }) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{label}</legend><div className="flex flex-wrap gap-2">{options.map((option) => { const checked = selected.includes(option); const enabled = checked || available.has(option); return <button aria-pressed={checked} className={`focus-ring rounded-lg border px-3 py-2 text-sm font-bold ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel)]"} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!enabled} key={option} type="button" onClick={() => onToggle(option)}>{option}</button>; })}</div></fieldset>;
}

function ContentTypeCard({ siteId, section, templates, locale, token, busy, onDelete, onDisplayModeChange, onTemplateSaved }: { siteId: string; section: ModContentSection; templates: ModContentTemplate[]; locale: string; token: string; busy: boolean; onDelete: () => void; onDisplayModeChange: (displayMode: "compact" | "large") => void; onTemplateSaved: (result: ModContentMutationResult) => void | Promise<void> }) {
  const { t } = useI18n();
  const template = templates.find((item) => item.publicId === section.templatePublicId);
  const name = localizedName(section.localizations, locale) || localizedName(template?.localizations || [], locale) || t(`modContent.templates.${section.templateCode}`);
  const href = `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}`;
  const presentationLabel = section.templateCode === "advancement"
    ? t("modContent.versionEditor.advancementTitle")
    : t(section.displayMode === "compact" ? "modContent.compact" : "modContent.large");
  return <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]"><div className="flex items-start justify-between gap-3"><div><Link className="focus-ring text-lg font-black hover:text-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{name}</Link><p className="mt-2 text-xs font-bold text-[var(--muted)]">{presentationLabel}</p></div><button aria-label={t("common.delete")} className="focus-ring rounded px-2 py-1 text-xs font-bold text-[var(--red)] hover:bg-[var(--panel-subtle)]" disabled={busy} type="button" onClick={onDelete}>{t("common.delete")}</button></div>{section.templateCode !== "advancement" ? <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-[var(--panel-subtle)] p-1" aria-label={t("modContent.versionEditor.displayMode")}><button aria-pressed={section.displayMode === "compact"} className={`focus-ring rounded-md px-2 py-1.5 text-xs font-bold ${section.displayMode === "compact" ? "bg-[var(--panel)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`} disabled={busy} type="button" onClick={() => onDisplayModeChange("compact")}>{t("modContent.compact")}</button><button aria-pressed={section.displayMode === "large"} className={`focus-ring rounded-md px-2 py-1.5 text-xs font-bold ${section.displayMode === "large" ? "bg-[var(--panel)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`} disabled={busy} type="button" onClick={() => onDisplayModeChange("large")}>{t("modContent.large")}</button></div> : null}{template && !template.builtin ? <div className="mt-4"><CustomContentTemplateSettings siteId={siteId} template={template} token={token} onSaved={onTemplateSaved} /></div> : null}<Link className="focus-ring mt-5 block rounded-lg border border-dashed border-[var(--line)] p-4 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{t("modContent.versionEditor.openType", { count: section.resourceCount })}</Link></article>;
}

function AddContentPageCard({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return <button className="focus-ring grid min-h-60 place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-subtle)] p-6 text-center transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} type="button" onClick={onClick}><span><span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-current text-2xl font-black">+</span><strong className="mt-4 block text-lg">{t("modContent.versionEditor.addPage")}</strong><small className="mt-2 block leading-5 text-[var(--muted)]">{t("modContent.versionEditor.addPageHint")}</small></span></button>;
}

function AddContentTypeDialog({ templates, locale, busy, message, onClose, onPreset, onCustom }: { templates: ModContentTemplate[]; locale: string; busy: boolean; message: string; onClose: () => void; onPreset: (template: ModContentTemplate, mode: "compact" | "large") => void; onCustom: (input: { displayMode: "compact" | "large"; defaultLocale: string; localizations: ModContentLocalization[] }) => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
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

  return <dialog ref={dialog} aria-labelledby={titleId} className="surface fixed inset-0 m-auto max-h-[86vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] p-5 shadow-2xl backdrop:bg-black/55" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <fieldset disabled={busy}>
      <header className="flex items-start justify-between gap-3">
        <div><h2 id={titleId} className="text-xl font-black">{t("modContent.versionEditor.addType")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.versionEditor.addTypeHint")}</p></div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </header>
      {message ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--red)]">{message}</p> : null}
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
    </fieldset>
  </dialog>;
}

function ExporterImportPanel({ siteId, subjectId, token, version, blocked, onImported, onBusyChange }: { siteId: string; subjectId: string; token: string; version: ModContentVersion; blocked: boolean; onImported: () => Promise<unknown>; onBusyChange: (source: ImportSource, busy: boolean, hasOperation?: boolean) => void }) {
  const notifyBusy = useCallback((active: boolean, hasOperation?: boolean) => onBusyChange("exporter", active, hasOperation), [onBusyChange]);
  return <ModExportImportModal disabled={blocked || version.status !== "active"} inline onBusyChange={notifyBusy} onImported={async () => { await onImported(); }} siteId={siteId} subjectId={subjectId} targetVersionId={version.publicId} targetVersionLabel={version.label} token={token} />;
}

function IconExportPanel({ siteId, token, version, blocked, onBusyChange }: { siteId: string; token: string; version: ModContentVersion; blocked: boolean; onBusyChange: (source: ImportSource, busy: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [upload, setUpload] = useState<ModExportUploadProgress | null>(null);
  useEffect(() => {
    onBusyChange("icon", busy);
    return () => onBusyChange("icon", false);
  }, [busy, onBusyChange]);
  async function uploadFile(file?: File) {
    if (!file || inFlight.current || blocked || version.status !== "active") return;
    if (!file.name.toLowerCase().endsWith(".zip")) { setMessage(t("modContent.iconImport.zipOnly")); return; }
    inFlight.current = true;
    onBusyChange("icon", true);
    setBusy(true); setMessage(""); setUpload({ phase: "hashing", percent: 0 });
    try {
      const uploaded = await uploadUserFileToOSS(
        file,
        token,
        `iconexport:${siteId}:${version.publicId}:${overwrite ? "overwrite" : "preserve"}`,
        (loaded, total, metrics) => setUpload({ phase: "uploading", percent: total > 0 ? Math.round(loaded / total * 100) : 0, ...metrics }),
      );
      setMessage(t("modContent.iconImport.uploaded", { id: uploaded.id }));
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return <section className="mt-6"><h3 className="text-lg font-black">{t("modContent.iconImport.title")}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("modContent.iconImport.description")}</p><ImportOverwriteChoice checked={overwrite} disabled={busy || blocked} onChange={setOverwrite} /><FileDropZone
    accept=".zip,application/zip"
    className="mt-5 min-h-56 p-8"
    disabled={busy || blocked || version.status !== "active"}
    hint={t("modContent.iconImport.hint")}
    title={busy ? t("modContent.iconImport.uploading") : t("modContent.iconImport.choose")}
    onFiles={(files) => void uploadFile(files[0])}
  />{upload && busy ? <UploadProgressDetails progress={upload} /> : null}{message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}</section>;
}

function EmbeddedIconImportPanel({ siteId, token, version, source, blocked, onImported, onBusyChange }: { siteId: string; token: string; version: ModContentVersion; source: CatalogImportSource; blocked: boolean; onImported: () => Promise<unknown>; onBusyChange: (source: ImportSource, busy: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<ModExportJob | null>(null);
  const [upload, setUpload] = useState<ModExportUploadProgress | null>(null);
  const polling = useRef<AbortController | null>(null);
  const importerName = importSourceLabel(source);
  const supportsMultipleFiles = source === "iconrenderer" || source === "irr";
  const hintKey = source === "iconrenderer"
    ? "modContent.catalogImport.iconRendererHint"
    : source === "irr" ? "modContent.catalogImport.irrHint" : "modContent.catalogImport.hint";

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; polling.current?.abort(); };
  }, []);
  useEffect(() => {
    onBusyChange(source, busy);
    return () => onBusyChange(source, false);
  }, [busy, onBusyChange, source]);

  async function monitor(initialJob: ModExportJob) {
    if (!active.current) return;
    setJob(initialJob);
    polling.current?.abort();
    polling.current = new AbortController();
    const completed = await waitForCatalogImportJob(siteId, initialJob.id, token, value => { if (active.current) setJob(value); }, polling.current.signal);
    if (!active.current) return;
    if (completed.status === "confirmation_required") {
      setMessage("");
      return;
    }
    if (completed.status === "failed") throw new Error(String(completed.errorDetail.message || completed.errorCode || t("modContent.catalogImport.failed")));
    if (completed.status === "cancelled") throw new Error(t("modContent.catalogImport.cancelled"));
    await onImported();
    setMessage(completed.reviewRequired ? t("modContent.catalogImport.reviewPending") : t("modContent.catalogImport.complete"));
  }

  async function uploadFile(files?: FileList | File[]) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length || inFlight.current || blocked || version.status !== "active") return;
    if (selectedFiles.some((file) => !file.name.toLowerCase().endsWith(".json"))) {
      setMessage(t("modContent.catalogImport.jsonOnly"));
      return;
    }
    inFlight.current = true;
    onBusyChange(source, true);
    setBusy(true); setMessage(""); setJob(null); setUpload(null);
    try {
      const file = supportsMultipleFiles
        ? await combineCatalogFiles(selectedFiles, source, importerName, t)
        : selectedFiles[0];
      const initial = await uploadEmbeddedIconCatalog(file, siteId, token, source, {
        targetVersionPublicId: version.publicId,
        overwriteExistingImportData: overwrite,
      }, setUpload);
      await monitor(initial);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setMessage(errorText(reason));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function retry() {
    if (!job || inFlight.current || blocked) return;
    inFlight.current = true;
    onBusyChange(source, true);
    setBusy(true); setMessage("");
    try {
      await monitor(await retryCatalogImportJob(siteId, job.id, token));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setMessage(errorText(reason));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function confirmMODIDMismatch() {
    if (!job?.modidConfirmationRequired || inFlight.current || blocked) return;
    inFlight.current = true;
    onBusyChange(source, true);
    setBusy(true); setMessage("");
    try {
      await monitor(await confirmModExportMODIDMismatch(siteId, job, token));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setMessage(errorText(reason));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function cancelMODIDMismatch() {
    if (!job || inFlight.current || blocked) return;
    inFlight.current = true;
    onBusyChange(source, true);
    setBusy(true); setMessage("");
    try {
      await cancelModExportJob(siteId, job.id, token);
      setJob(null);
      setMessage(t("modContent.catalogImport.cancelled"));
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  const progress = job?.progress ?? upload?.percent ?? 0;
  const phase = job ? t(`modContent.catalogImport.stages.${job.currentStage || job.status}`) : upload ? t(`mods.exportImport.uploadPhases.${upload.phase}`) : "";
  return <section className="mt-6">
    <h3 className="text-lg font-black">{t("modContent.catalogImport.title", { importer: importerName })}</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("modContent.catalogImport.description", { importer: importerName, version: version.label })}</p>
    <ImportOverwriteChoice checked={overwrite} disabled={busy || blocked} onChange={setOverwrite} />
    <FileDropZone
      accept=".json,application/json,application/x-ndjson"
      className="mt-5 min-h-56 p-8"
      disabled={busy || blocked || version.status !== "active"}
      hint={t(hintKey, { importer: importerName })}
      multiple={supportsMultipleFiles}
      title={busy ? t("modContent.catalogImport.processing") : t("modContent.catalogImport.choose", { importer: importerName })}
      onFiles={(files) => void uploadFile(files)}
    />
    {job ? <div className="mt-4"><div className="flex justify-between text-sm font-bold"><span>{phase}</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div>{job.status === "confirmation_required" ? <MODIDConfirmationCard busy={busy} job={job} onCancel={() => void cancelMODIDMismatch()} onConfirm={() => void confirmMODIDMismatch()} /> : null}</div> : upload ? <UploadProgressDetails progress={upload} /> : null}
    {message ? <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 text-sm font-bold"><p className="min-w-0 flex-1">{message}</p>{job?.status === "failed" ? <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void retry()}>{t("mods.exportImport.retry")}</button> : null}</div> : null}
  </section>;
}

function ImportOverwriteChoice({ checked, onChange, disabled = false }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  return <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><input className="mt-1 h-4 w-4 accent-[var(--accent)]" type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><strong className="block">{t("mods.exportImport.overwriteExisting")}</strong><small className="mt-1 block leading-5 text-[var(--muted)]">{t("mods.exportImport.overwriteExistingHint")}</small></span></label>;
}

function UploadProgressDetails({ progress }: { progress: ModExportUploadProgress }) {
  const { t } = useI18n();
  const label = t(`mods.exportImport.uploadPhases.${progress.phase}`);
  const stats = progress.phase === "uploading" && progress.totalBytes
    ? t("mods.exportImport.uploadStats", {
      loaded: formatBytes(progress.loadedBytes || 0),
      total: formatBytes(progress.totalBytes),
      speed: formatBytes(progress.bytesPerSecond || 0),
      eta: formatUploadETA(progress.etaSeconds || 0),
    })
    : "";
  const flags = [
    progress.multipart ? t("mods.exportImport.multipartMode") : "",
    progress.retryCount ? t("mods.exportImport.retrying", { count: progress.retryCount }) : "",
    progress.stalled ? t("mods.exportImport.stalled") : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className="mt-4">
      <div className="flex justify-between text-sm font-bold"><span>{label}</span><span>{progress.percent}%</span></div>
      {stats ? <p className="mt-1 text-xs text-[var(--muted)]">{stats}{flags ? ` · ${flags}` : ""}</p> : null}
      <div className="mt-2 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress.percent}%` }} /></div>
    </div>
  );
}

function localizedName(values: ModContentLocalization[], locale: string) { return values.find((item) => item.locale === locale)?.name || values.find((item) => normalizeContentLanguage(item.locale) === "en-US")?.name || values[0]?.name || ""; }
function uniqueValues(values: string[]) { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function summarizeList(values: readonly string[], visibleCount: number) { return values.length <= visibleCount ? values.join(", ") : `${values.slice(0, visibleCount).join(", ")} +${values.length - visibleCount}`; }
function toggleValue(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function versionLabel(versions: string[], loaders: string[]) { return versions.length && loaders.length ? `${versions.join(", ")} / ${loaders.join(", ")}` : ""; }
function errorText(value: unknown) { return value instanceof Error ? value.message : String(value); }

function importSourceLabel(source: ImportSource | null) {
  switch (source) {
    case "exporter": return "mcmods_exporter";
    case "icon": return "IconExporter";
    case "iconrenderer": return "IconRenderer";
    case "letmeseesee": return "LetMeSeeSee (YourCode)";
    case "irr": return "IRR";
    default: return "";
  }
}

async function combineCatalogFiles(
  files: File[],
  source: CatalogImportSource,
  importer: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (files.length > 8) throw new Error(t("modContent.catalogImport.tooManyFiles", { importer }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > 128 * 1024 * 1024) throw new Error(t("modContent.catalogImport.filesTooLarge", { importer }));
  const entries: unknown[] = [];
  for (const file of files) {
    const raw = (await file.text()).replace(/^\uFEFF/, "").trim();
    if (!raw) continue;
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error(t("modContent.catalogImport.notArray", { file: file.name }));
      for (const entry of parsed) entries.push(entry);
      continue;
    }
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        throw new Error(t("modContent.catalogImport.invalidLine", { file: file.name, line: index + 1 }));
      }
    }
  }
  if (!entries.length) throw new Error(t("modContent.catalogImport.empty", { importer }));
  const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
  return new File([jsonl], `${source}-catalog-${Date.now()}.json`, { type: "application/x-ndjson" });
}

function formatUploadETA(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}
