"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeContentLanguage } from "../_lib/content-language";
import {
  cancelModExportJob,
  cancelModExportUpload,
  confirmModExportMODIDMismatch,
  getActiveModExportJob,
  getModExportJob,
  ModExportJob,
  ModExportUploadProgress,
  retryModExportJob,
  uploadModExportPackage,
  waitForModExportJob,
} from "../_lib/mod-export-api";
import {
  createPersistedModExportUploadTask,
  deletePersistedModExportUploadTask,
  modExportUploadTaskKey,
  type PersistedModExportUploadTask,
  readPersistedModExportUploadTask,
  updatePersistedModExportUploadTask,
} from "../_lib/mod-export-upload-store";
import { loadModContentSections, loadModContentTemplates, loadModContentVersions, type ModContentSection, type ModContentTemplate, type ModContentVersion } from "../_lib/mod-content-api";
import { formatBytes } from "../_lib/oss-upload";
import { useI18n } from "../_lib/i18n-provider";
import { IconFont } from "./iconfont";
import { MODIDConfirmationCard } from "./modid-confirmation-card";

type Props = {
  siteId: string;
  token: string;
  canEdit: boolean;
};

export function ModCatalogData({ siteId, token, canEdit }: Props) {
  const { locale, t } = useI18n();
  const [contentVersions, setContentVersions] = useState<ModContentVersion[]>([]);
  const [contentSections, setContentSections] = useState<ModContentSection[]>([]);
  const [contentTemplates, setContentTemplates] = useState<ModContentTemplate[]>([]);
  const [contentVersionId, setContentVersionId] = useState("");
  const [message, setMessage] = useState("");

  const loadCatalog = useCallback(async () => {
    const [versions, sections, templates] = await Promise.all([
      loadModContentVersions(siteId, token),
      loadModContentSections(siteId, token),
      loadModContentTemplates(siteId, token),
    ]);
    const catalogVersions = versions.filter((item) => item.status === "active");
    setContentVersions(catalogVersions);
    setContentSections(sections);
    setContentTemplates(templates);
    setContentVersionId((current) => catalogVersions.some((item) => item.publicId === current) ? current : catalogVersions[0]?.publicId ?? "");
  }, [siteId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalog().catch((reason) => setMessage(errorText(reason, t("mods.exportImport.errors.load"))));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalog, t]);

  const selectedSections = contentSections.filter((item) => item.versionPublicId === contentVersionId);
  const categories = useMemo(
    () => buildCatalogCategories(selectedSections, contentTemplates, locale, t),
    [contentTemplates, locale, selectedSections, t],
  );

  function openCategory(category: UnifiedCatalogCategory) {
    window.open(
      `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(category.section.publicId)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (!contentVersions.length && !canEdit) return null;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-lg font-black">{t("mods.exportImport.catalogTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("mods.exportImport.description")}</p></div>
      {canEdit ? <Link className="button-primary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/data/edit`}>{t("mods.exportImport.importAction")}</Link> : null}
    </header>
    {message ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
    {contentVersions.length ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <strong className="text-sm">{t("mods.exportImport.dataVersion")}</strong>
      <select className="field min-w-56 flex-1 sm:max-w-md" value={contentVersionId} onChange={(event) => setContentVersionId(event.target.value)}>
        {contentVersions.map((item) => <option key={item.publicId} value={item.publicId}>{item.label}</option>)}
      </select>
    </div> : null}
    {categories.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <UnifiedCategoryCard category={category} key={category.key} onClick={() => openCategory(category)} />)}</div> : <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-8 text-center text-[var(--muted)]">{t("mods.exportImport.empty")}</div>}
  </section>;
}

type UnifiedCatalogCategory = {
  key: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
  count: number;
  section: ModContentSection;
};

const contentTemplateCategoryMap: Record<string, string> = {
  item_block: "itemsBlocks",
  fluid: "fluids",
  dimension: "dimensions",
  biome: "biomes",
  entity: "entities",
  enchantment: "enchantments",
  mob_effect: "buffs",
  natural_generation: "naturalGeneration",
  world_structure: "worldStructures",
  key_mapping: "keybinds",
  advancement: "achievements",
  loot_table: "lootTables",
  game_setting: "gameSettings",
  chemical: "industrialMedia",
  multiblock: "multiblocks",
  command: "commands",
  skill: "skills",
  element: "elements",
};

const contentCategoryAppearance: Record<string, { icon: string; tone: string }> = {
  itemsBlocks: { icon: "cube", tone: "text-emerald-600 bg-emerald-500/10" },
  fluids: { icon: "fluid", tone: "text-cyan-700 bg-cyan-500/10" },
  dimensions: { icon: "database", tone: "text-indigo-700 bg-indigo-500/10" },
  biomes: { icon: "biome", tone: "text-lime-700 bg-lime-500/10" },
  entities: { icon: "entity", tone: "text-blue-600 bg-blue-500/10" },
  enchantments: { icon: "enchantment", tone: "text-violet-600 bg-violet-500/10" },
  buffs: { icon: "effect", tone: "text-rose-600 bg-rose-500/10" },
  naturalGeneration: { icon: "biome", tone: "text-green-700 bg-green-500/10" },
  worldStructures: { icon: "structure", tone: "text-amber-700 bg-amber-500/10" },
  keybinds: { icon: "keyboard", tone: "text-sky-700 bg-sky-500/10" },
  achievements: { icon: "achievement", tone: "text-yellow-700 bg-yellow-500/10" },
  lootTables: { icon: "database", tone: "text-yellow-700 bg-yellow-500/10" },
  gameSettings: { icon: "database", tone: "text-slate-700 bg-slate-500/10" },
  industrialMedia: { icon: "fluid", tone: "text-cyan-700 bg-cyan-500/10" },
  multiblocks: { icon: "structure", tone: "text-orange-700 bg-orange-500/10" },
  commands: { icon: "code", tone: "text-slate-700 bg-slate-500/10" },
  skills: { icon: "achievement", tone: "text-violet-700 bg-violet-500/10" },
  elements: { icon: "effect", tone: "text-rose-700 bg-rose-500/10" },
};

function buildCatalogCategories(sections: ModContentSection[], templates: ModContentTemplate[], locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const merged = new Map<string, UnifiedCatalogCategory>();
  for (const section of sections) {
    if (section.parentPublicId) continue;
    const key = contentTemplateCategoryMap[section.templateCode] ?? `custom:${section.publicId}`;
    const template = templates.find((item) => item.publicId === section.templatePublicId);
    const localization = localizedSection(section, template, locale);
    const appearance = contentCategoryAppearance[key] ?? { icon: "database", tone: "text-emerald-700 bg-emerald-500/10" };
    const standardCategory = !key.startsWith("custom:");
    merged.set(key, {
      key,
      title: localization?.name || (standardCategory ? t(`mods.detail.dataCategories.${key}`) : localizedSectionName(section, template, locale, t)),
      description: localization?.summary || (standardCategory ? t(`mods.detail.dataDescriptions.${key}`) : t("mods.detail.dataDescriptions.customPages")),
      icon: appearance.icon,
      tone: appearance.tone,
      count: section.resourceCount,
      section,
    });
  }
  return [...merged.values()];
}

function localizedSectionName(section: ModContentSection, template: ModContentTemplate | undefined, locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const values = section.localizations.length ? section.localizations : template?.localizations || [];
  return values.find((item) => item.locale === locale)?.name || values.find((item) => normalizeContentLanguage(item.locale) === "en-US")?.name || values[0]?.name || t(`modContent.templates.${section.templateCode}`);
}

function localizedSection(section: ModContentSection, template: ModContentTemplate | undefined, locale: string) {
  const values = section.localizations.length ? section.localizations : template?.localizations || [];
  return values.find((item) => item.locale === locale) || values.find((item) => normalizeContentLanguage(item.locale) === "en-US") || values[0];
}

function UnifiedCategoryCard({ category, onClick }: { category: UnifiedCatalogCategory; onClick: () => void }) {
  const { t } = useI18n();
  const content = <><span className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md text-xl ${category.tone}`}><IconFont name={category.icon} fallback={category.key.slice(0, 1).toUpperCase()} /></span><span className="min-w-0"><strong className="block text-lg">{category.title}</strong><small className="mt-2 block line-clamp-2 leading-6 text-[var(--muted)]">{category.description}</small></span></span><span className="mt-4 block text-xs font-bold text-[var(--muted)]">{t("mods.detail.entries", { count: category.count })}</span></>;
  const className = "focus-ring relative min-h-36 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-left transition-transform";
  return <button className={`${className} hover:-translate-y-0.5 hover:border-[var(--accent)]`} type="button" onClick={onClick}>{content}</button>;
}

export function ModExportImportModal({ siteId, token, targetVersionId, targetVersionLabel, onClose, onImported, onBusyChange, inline = false, disabled = false }: { siteId: string; token: string; targetVersionId: string; targetVersionLabel: string; onClose?: () => void; onImported: () => Promise<void>; onBusyChange?: (busy: boolean) => void; inline?: boolean; disabled?: boolean }) {
  const { t } = useI18n();
  const [job, setJob] = useState<ModExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<ModExportUploadProgress | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const polling = useRef<AbortController | null>(null);
  const uploading = useRef<AbortController | null>(null);
  const activeTask = useRef<PersistedModExportUploadTask | null>(null);
  const completedParts = useRef(new Set<number>());
  const persistenceQueue = useRef(Promise.resolve());
  const restoredTaskKey = useRef("");
  const taskKey = useMemo(
    () => modExportUploadTaskKey(siteId, targetVersionId, token),
    [siteId, targetVersionId, token],
  );

  useEffect(() => () => polling.current?.abort(), []);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (restoredTaskKey.current === taskKey) return;
    restoredTaskKey.current = taskKey;
    activeTask.current = null;
    completedParts.current.clear();
    setJob(null);
    setUpload(null);
    setError("");
    let cancelled = false;
    void Promise.all([
      readPersistedModExportUploadTask(taskKey),
      getActiveModExportJob(siteId, targetVersionId, token),
    ]).then(async ([persisted, activeJob]) => {
      if (cancelled) return;
      if (activeJob) {
        const now = Date.now();
        activeTask.current = persisted?.task || {
          key: taskKey,
          siteId,
          targetVersionId,
          overwriteExistingImportData: activeJob.overwriteExistingImportData,
          phase: "importing",
          completedPartNumbers: [],
          jobId: activeJob.id,
          createdAt: now,
          updatedAt: now,
        };
        setOverwrite(activeJob.overwriteExistingImportData);
        setBusy(true);
        setError("");
        await monitorJob(activeJob);
        return;
      }
      if (!persisted) return;
      activeTask.current = persisted.task;
      completedParts.current = new Set(persisted.task.completedPartNumbers);
      setOverwrite(persisted.task.overwriteExistingImportData);
      setBusy(true);
      setError("");
      if (persisted.task.jobId) {
        const restoredJob = await getModExportJob(siteId, persisted.task.jobId, token);
        if (cancelled) return;
        await monitorJob(restoredJob);
        return;
      }
      await runPersistedUpload(persisted.task, persisted.file);
    }).catch((reason) => {
      if (!cancelled) {
        setBusy(false);
        setError(errorText(reason, t("mods.exportImport.errors.upload")));
      }
    });
    return () => { cancelled = true; };
    // The task is restored exactly once for this mounted version workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, targetVersionId, taskKey, token]);

  function closeModal() {
    if (busy && !job) return;
    polling.current?.abort();
    onClose?.();
  }

  function persistTaskPatch(
    patch: Partial<Omit<PersistedModExportUploadTask, "key" | "siteId" | "targetVersionId" | "createdAt">>,
  ) {
    const current = activeTask.current;
    if (!current) return persistenceQueue.current;
    activeTask.current = { ...current, ...patch, updatedAt: Date.now() };
    const persistedPatch = { ...patch };
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(() => updatePersistedModExportUploadTask(taskKey, persistedPatch));
    return persistenceQueue.current;
  }

  async function monitorJob(initialJob: ModExportJob) {
    setJob(initialJob);
    await persistTaskPatch({ phase: "importing", jobId: initialJob.id });
    polling.current?.abort();
    polling.current = new AbortController();
    const completed = await waitForModExportJob(siteId, initialJob.id, token, setJob, polling.current.signal);
    if (completed.status === "confirmation_required") {
      setError("");
      setBusy(false);
      return;
    }
    if (completed.status === "failed") {
      const key = `mods.exportImport.jobErrors.${completed.errorCode}`;
      const translated = t(key);
      throw new Error(translated === key ? String(completed.errorDetail.message ?? completed.errorCode ?? t("mods.exportImport.errors.upload")) : translated);
    }
    if (completed.status === "cancelled") {
      await deletePersistedModExportUploadTask(taskKey);
      activeTask.current = null;
      throw new Error(t("mods.exportImport.stages.cancelled"));
    }
    await deletePersistedModExportUploadTask(taskKey);
    activeTask.current = null;
    await onImported();
  }

  async function runPersistedUpload(task: PersistedModExportUploadTask, file: File) {
    activeTask.current = task;
    completedParts.current = new Set(task.completedPartNumbers);
    uploading.current?.abort();
    uploading.current = new AbortController();
    const controller = uploading.current;
    const initialTicket = task.ticket;
    const importedJob = await uploadModExportPackage(
      file,
      siteId,
      token,
      {
        targetVersionPublicId: targetVersionId,
        overwriteExistingImportData: task.overwriteExistingImportData,
      },
      setUpload,
      {
        signal: controller.signal,
        resumeTicket: initialTicket,
        completedPartNumbers: completedParts.current,
        onTicket: async (ticket) => {
          await persistTaskPatch({ ticket });
        },
        onPartComplete: (partNumber) => {
          completedParts.current.add(partNumber);
          void persistTaskPatch({ completedPartNumbers: [...completedParts.current].sort((left, right) => left - right) });
        },
      },
    );
    await persistenceQueue.current;
    await persistTaskPatch({ phase: "importing", jobId: importedJob.id });
    await monitorJob(importedJob);
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t("mods.exportImport.errors.zipOnly"));
      return;
    }
    setBusy(true); setError(""); setJob(null); setUpload(null);
    try {
      const now = Date.now();
      const task: PersistedModExportUploadTask = {
        key: taskKey,
        siteId,
        targetVersionId,
        overwriteExistingImportData: overwrite,
        phase: "uploading",
        completedPartNumbers: [],
        createdAt: now,
        updatedAt: now,
      };
      await createPersistedModExportUploadTask(task, file);
      await runPersistedUpload(task, file);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason, t("mods.exportImport.errors.upload")));
    } finally { setBusy(false); }
  }

  async function resumeUpload() {
    setBusy(true); setError("");
    try {
      const persisted = await readPersistedModExportUploadTask(taskKey);
      if (!persisted) throw new Error(t("mods.exportImport.errors.upload"));
      await runPersistedUpload(persisted.task, persisted.file);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason, t("mods.exportImport.errors.upload")));
    } finally {
      setBusy(false);
    }
  }

  async function retryImport() {
    if (!job) return;
    setBusy(true); setError("");
    try {
      await monitorJob(await retryModExportJob(siteId, job.id, token));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason, t("mods.exportImport.errors.retry")));
    } finally { setBusy(false); }
  }

  async function confirmMODIDMismatch() {
    if (!job?.modidConfirmationRequired) return;
    setBusy(true); setError("");
    try {
      await monitorJob(await confirmModExportMODIDMismatch(siteId, job, token));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason, t("mods.exportImport.errors.retry")));
    } finally { setBusy(false); }
  }

  async function cancelImport() {
    const currentTask = activeTask.current;
    if (!currentTask && !job) return;
    uploading.current?.abort();
    polling.current?.abort();
    setBusy(true);
    setError("");
    try {
      const jobId = currentTask?.jobId || job?.id;
      if (jobId) {
        await cancelModExportJob(siteId, jobId, token);
      } else if (currentTask?.ticket) {
        await cancelModExportUpload(siteId, currentTask.ticket, token);
      }
      await deletePersistedModExportUploadTask(taskKey);
      activeTask.current = null;
      completedParts.current.clear();
      setJob(null);
      setUpload(null);
      setError(t("mods.exportImport.stages.cancelled"));
    } catch (reason) {
      setError(errorText(reason, t("mods.exportImport.errors.upload")));
    } finally {
      setBusy(false);
    }
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files[0]);
  }

  const form = <><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><input className="mt-1 h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} /><span><strong className="block">{t("mods.exportImport.overwriteExisting")}</strong><small className="mt-1 block leading-5 text-[var(--muted)]">{t("mods.exportImport.overwriteExistingHint")}</small></span></label>
    <label className={`mt-5 grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel-subtle)]"}`} onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { if (disabled) { event.preventDefault(); return; } drop(event); }}><input className="sr-only" type="file" accept=".zip,application/zip" disabled={busy || disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => void importFile(event.target.files?.[0])} /><span><strong className="block text-lg">{upload ? t(`mods.exportImport.uploadPhases.${upload.phase}`) : t("mods.exportImport.drop")}</strong><small className="mt-2 block text-[var(--muted)]">{t("mods.exportImport.dropHint")}</small></span></label>
    {upload && !job ? <Progress label={t(`mods.exportImport.uploadPhases.${upload.phase}`)} percent={upload.percent} upload={upload} /> : null}
    {job ? <><p className="mt-4 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold">{t("mods.exportImport.importInBackground")}</p><Progress label={t(`mods.exportImport.stages.${job.currentStage || job.status}`)} percent={job.progress} />{job.status === "confirmation_required" ? <MODIDConfirmationCard busy={busy} job={job} onCancel={() => void cancelImport()} onConfirm={() => void confirmMODIDMismatch()} /> : null}{job.reviewRequired ? <p className="mt-3 text-sm text-[var(--warning)]">{t("mods.exportImport.reviewNotice")}</p> : null}</> : null}
    {(busy || activeTask.current) && !["ready", "partial", "failed", "cancelled"].includes(job?.status || "") ? <div className="mt-4 flex justify-end"><button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => void cancelImport()}>{t("common.cancel")}</button></div> : null}
    {error ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]"><p className="min-w-0 flex-1">{error}</p>{job?.status === "failed" ? <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void retryImport()}>{t("mods.exportImport.retry")}</button> : !job && activeTask.current ? <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void resumeUpload()}>{t("mods.exportImport.retry")}</button> : null}</div> : null}
  </>;
  if (inline) return <section className="mt-6"><h3 className="text-lg font-black">{t("mods.exportImport.modalTitle")}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("mods.exportImport.targetDescription", { version: targetVersionLabel })}</p>{form}</section>;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={closeModal}><div className="surface max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--line)] p-5 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{t("mods.exportImport.modalTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("mods.exportImport.modalDescription")}</p></div><button className="button-secondary focus-ring" disabled={busy && !job} type="button" onClick={closeModal}>{t("common.close")}</button></header><p className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm"><strong>{t("mods.exportImport.dataVersion")}：</strong>{targetVersionLabel}</p>{form}</div></div>;
}

function Progress({ label, percent, upload }: { label: string; percent: number; upload?: ModExportUploadProgress }) {
  const { t } = useI18n();
  const details = upload?.phase === "uploading" && upload.totalBytes
    ? t("mods.exportImport.uploadStats", {
      loaded: formatBytes(upload.loadedBytes || 0),
      total: formatBytes(upload.totalBytes),
      speed: formatBytes(upload.bytesPerSecond || 0),
      eta: formatUploadETA(upload.etaSeconds || 0),
    })
    : "";
  return <div className="mt-4"><div className="flex justify-between gap-3 text-sm font-bold"><span>{label}</span><span>{percent}%</span></div>{details ? <p className="mt-1 text-xs text-[var(--muted)]">{details}{upload?.multipart ? ` · ${t("mods.exportImport.multipartMode")}` : ""}{upload?.retryCount ? ` · ${t("mods.exportImport.retrying", { count: upload.retryCount })}` : ""}{upload?.stalled ? ` · ${t("mods.exportImport.stalled")}` : ""}</p> : null}<div className="mt-2 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${percent}%` }} /></div></div>;
}

function formatUploadETA(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
