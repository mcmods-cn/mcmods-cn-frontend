"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { modExportCategories, ModExportCategory, modExportCategoryTitle } from "../_lib/mod-export-catalog";
import {
  ModExportJob,
  ModExportRevision,
  ModExportUploadProgress,
  retryModExportJob,
  uploadModExportPackage,
  waitForModExportJob,
} from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { IconFont } from "./iconfont";

type Props = {
  siteId: string;
  token: string;
  canEdit: boolean;
};

export function ModExportData({ siteId, token, canEdit }: Props) {
  const { t } = useI18n();
  const [revisions, setRevisions] = useState<ModExportRevision[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState("");

  const loadRevisions = useCallback(async () => {
    const result = await apiRequest<{ items: ModExportRevision[] }>(`/api/v1/mods/${encodeURIComponent(siteId)}/export-data`, {}, token);
    setRevisions(result.items);
    setSelectedID((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? "");
  }, [siteId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRevisions().catch((reason) => setMessage(errorText(reason, t("mods.exportImport.errors.load"))));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRevisions, t]);

  const selected = revisions.find((item) => item.id === selectedID);
  const categories = modExportCategories(selected);

  function openCategory(category: ModExportCategory) {
    if (!selectedID) return;
    window.open(
      `/mods/${encodeURIComponent(siteId)}/data/${encodeURIComponent(selectedID)}/${encodeURIComponent(category.key)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (!revisions.length && !canEdit) return null;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-lg font-black">{t("mods.exportImport.catalogTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{selected ? `${selected.minecraftVersion} · ${selected.loader} · ${selected.namespace}` : t("mods.exportImport.description")}</p></div>
      {canEdit ? <button className="button-primary focus-ring" type="button" onClick={() => setImportOpen(true)}>{t("common.edit")} {t("mods.exportImport.importAction")}</button> : null}
    </header>
    {message ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
    {revisions.length ? <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3"><strong className="text-sm">{t("mods.detail.minecraftVersion")}</strong><select className="field min-w-56 flex-1 sm:max-w-md" value={selectedID} onChange={(event) => setSelectedID(event.target.value)}>{revisions.map((item) => <option key={item.id} value={item.id}>{item.minecraftVersion} · {item.loader} · {item.namespace}</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <ExportCategoryCard category={category} key={category.key} onClick={() => openCategory(category)} />)}</div>
    </> : <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-8 text-center text-[var(--muted)]">{t("mods.exportImport.empty")}</div>}
    {importOpen ? <ModExportImportModal siteId={siteId} token={token} onClose={() => setImportOpen(false)} onImported={loadRevisions} /> : null}
  </section>;
}

function ExportCategoryCard({ category, onClick }: { category: ModExportCategory; onClick: () => void }) {
  const { t } = useI18n();
  const descriptionKey = `mods.detail.dataDescriptions.${category.key}`;
  const description = category.key.startsWith("registry:")
    ? t("mods.exportImport.registryDescription", { registry: category.registries[0] })
    : t(descriptionKey);
  return <button className="focus-ring relative min-h-36 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-[var(--accent)]" type="button" onClick={onClick}><span className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md text-xl ${category.tone}`}><IconFont name={category.icon} fallback={category.key.slice(0, 1).toUpperCase()} /></span><span className="min-w-0 pr-12"><strong className="block text-lg">{modExportCategoryTitle(category, t)}</strong><small className="mt-2 block line-clamp-2 leading-6 text-[var(--muted)]">{description}</small></span></span><span className="absolute bottom-2 right-3 text-4xl font-black text-[var(--muted)] opacity-15">{category.count.toLocaleString()}</span><span className="mt-3 block text-xs font-bold text-[var(--muted)]">{t("mods.detail.entries", { count: category.count })}</span></button>;
}

function ModExportImportModal({ siteId, token, onClose, onImported }: { siteId: string; token: string; onClose: () => void; onImported: () => Promise<void> }) {
  const { t } = useI18n();
  const [job, setJob] = useState<ModExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<ModExportUploadProgress | null>(null);
  const polling = useRef<AbortController | null>(null);

  useEffect(() => () => polling.current?.abort(), []);

  function closeModal() {
    if (busy && !job) return;
    polling.current?.abort();
    onClose();
  }

  async function monitorJob(initialJob: ModExportJob) {
    setJob(initialJob);
    polling.current?.abort();
    polling.current = new AbortController();
    const completed = await waitForModExportJob(siteId, initialJob.id, token, setJob, polling.current.signal);
    if (completed.status === "failed") {
      const key = `mods.exportImport.jobErrors.${completed.errorCode}`;
      const translated = t(key);
      throw new Error(translated === key ? String(completed.errorDetail.message ?? completed.errorCode ?? t("mods.exportImport.errors.upload")) : translated);
    }
    if (completed.status === "cancelled") throw new Error(t("mods.exportImport.stages.cancelled"));
    await onImported();
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t("mods.exportImport.errors.zipOnly"));
      return;
    }
    setBusy(true); setError(""); setJob(null); setUpload(null);
    try {
      await monitorJob(await uploadModExportPackage(file, siteId, token, setUpload));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason, t("mods.exportImport.errors.upload")));
    } finally { setBusy(false); }
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

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files[0]);
  }

  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={closeModal}><div className="surface max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--line)] p-5 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{t("mods.exportImport.modalTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("mods.exportImport.modalDescription")}</p></div><button className="button-secondary focus-ring" disabled={busy && !job} type="button" onClick={closeModal}>{t("common.close")}</button></header>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><SourceCard active title="mcmods_exporter" description={t("mods.exportImport.sources.exporter")} /><SourceCard title="Icon Exporter" description={t("mods.exportImport.sources.iconExporter")} /></div>
    <label className={`mt-5 grid min-h-48 cursor-pointer place-items-center rounded-lg border border-dashed p-6 text-center ${dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--panel-subtle)]"}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}><input className="sr-only" type="file" accept=".zip,application/zip" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => void importFile(event.target.files?.[0])} /><span><strong className="block text-lg">{upload ? t(`mods.exportImport.uploadPhases.${upload.phase}`) : t("mods.exportImport.drop")}</strong><small className="mt-2 block text-[var(--muted)]">{t("mods.exportImport.dropHint")}</small></span></label>
    {upload && !job ? <Progress label={t(`mods.exportImport.uploadPhases.${upload.phase}`)} percent={upload.percent} /> : null}
    {job ? <><p className="mt-4 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold">{t("mods.exportImport.importInBackground")}</p><Progress label={t(`mods.exportImport.stages.${job.currentStage || job.status}`)} percent={job.progress} />{job.reviewRequired ? <p className="mt-3 text-sm text-[var(--warning)]">{t("mods.exportImport.reviewNotice")}</p> : null}</> : null}
    {error ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]"><p className="min-w-0 flex-1">{error}</p>{job?.status === "failed" ? <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void retryImport()}>{t("mods.exportImport.retry")}</button> : null}</div> : null}
  </div></div>;
}

function Progress({ label, percent }: { label: string; percent: number }) {
  return <div className="mt-4"><div className="flex justify-between text-sm font-bold"><span>{label}</span><span>{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${percent}%` }} /></div></div>;
}

function SourceCard({ title, description, active = false }: { title: string; description: string; active?: boolean }) {
  return <div className={`rounded-md border p-4 ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}><strong>{title}</strong><span className="mt-2 block text-sm text-[var(--muted)]">{description}</span></div>;
}

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
