"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFavoriteModpackExport,
  downloadFavoriteModpackExport,
  FavoriteModpackExportDetail,
  FavoriteModpackExportItem,
  FavoriteModpackExportPreview,
  FavoriteModpackExportTask,
  loadFavoriteModpackExport,
  loadFavoriteModpackExports,
  preflightFavoriteModpackExport,
} from "../_lib/favorite-api";
import { formatBytes } from "../_lib/oss-upload";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftVersionPicker } from "./minecraft-version-picker";

type Props = {
  token: string;
  collectionId: string;
  collectionName: string;
  initialTaskId?: string;
};

export function FavoriteModpackExport({ token, collectionId, collectionName, initialTaskId = "" }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState(collectionId);
  const [history, setHistory] = useState<FavoriteModpackExportTask[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [minecraftVersions, setMinecraftVersions] = useState<string[]>([]);
  const [loader, setLoader] = useState<"neoforge" | "fabric" | "forge">("neoforge");
  const [preview, setPreview] = useState<FavoriteModpackExportPreview | null>(null);
  const [detail, setDetail] = useState<FavoriteModpackExportDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const downloadedTask = useRef("");

  useEffect(() => {
    if (!initialTaskId) return;
    let cancelled = false;
    loadFavoriteModpackExport(token, initialTaskId)
      .then((result) => {
        if (cancelled) return;
        setOpen(true);
        setError("");
        setDetail(result);
        setActiveCollectionId(result.task.collectionId);
      })
      .catch((reason) => {
        if (!cancelled) {
          setOpen(true);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialTaskId, token]);

  const hasOmissions = Boolean(preview && preview.skippedItemCount + preview.failedItemCount > 0);
  const selectedVersion = minecraftVersions[0] ?? "";

  async function inspect() {
    if (!selectedVersion || busy) return;
    setBusy(true);
    setError("");
    setDetail(null);
    try {
      setPreview(await preflightFavoriteModpackExport(token, activeCollectionId, selectedVersion, loader));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.modpackExport.preflightFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function createExport() {
    if (!preview || busy || preview.minecraftVersion !== selectedVersion || preview.loader !== loader) return;
    setBusy(true);
    setError("");
    try {
      const result = await createFavoriteModpackExport(token, activeCollectionId, selectedVersion, loader, hasOmissions);
      setDetail(await loadFavoriteModpackExport(token, result.taskId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.modpackExport.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function showExportHistory() {
    if (busy) return;
    setBusy(true);
    setError("");
    setDetail(null);
    setShowHistory(true);
    try {
      setHistory(await loadFavoriteModpackExports(token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openHistoryTask(task: FavoriteModpackExportTask) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setDetail(await loadFavoriteModpackExport(token, task.id));
      setActiveCollectionId(task.collectionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function returnToSettings(task: FavoriteModpackExportDetail["task"]) {
    setMinecraftVersions([task.minecraftVersion]);
    setLoader(task.loader as typeof loader);
    setActiveCollectionId(task.collectionId);
    setShowHistory(false);
    setDetail(null);
    setPreview(null);
  }

  useEffect(() => {
    const task = detail?.task;
    if (!open || !task || !["pending", "processing"].includes(task.status)) return;
    let cancelled = false;
    let timer = 0;
    const refresh = async () => {
      try {
        const next = await loadFavoriteModpackExport(token, task.id);
        if (!cancelled) setDetail(next);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("favorites.loadFailed"));
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, 2500);
      }
    };
    timer = window.setTimeout(refresh, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detail?.task, open, t, token]);

  useEffect(() => {
    if (!detail?.downloadAvailable || detail.task.status !== "ready" || downloadedTask.current === detail.task.id) return;
    downloadedTask.current = detail.task.id;
    void downloadFavoriteModpackExport(token, detail.task.id, exportFilename(detail.task))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [detail, token]);

  return (
    <>
      <button
        className="button-primary focus-ring"
        type="button"
        onClick={() => {
          setActiveCollectionId(collectionId);
          setPreview(null);
          setDetail(null);
          setShowHistory(false);
          setError("");
          setOpen(true);
        }}
      >
        {t("favorites.modpackExport.open")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (!busy && event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            aria-labelledby="favorite-export-title"
            aria-modal="true"
            className="surface max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl p-4 md:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black" id="favorite-export-title">{t("favorites.modpackExport.title")}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{collectionName}</p>
              </div>
              <div className="flex gap-2">
                <button className="button-secondary focus-ring" type="button" disabled={busy} onClick={() => void showExportHistory()}>
                  {t("favorites.modpackExport.history")}
                </button>
                <button aria-label={t("common.close")} className="button-secondary focus-ring" type="button" disabled={busy} onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>
            </div>

            {!detail && !showHistory ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 font-bold">
                  {t("favorites.modpackExport.minecraftVersion")}
                  <MinecraftVersionPicker
                    multiple={false}
                    disabled={busy}
                    values={minecraftVersions}
                    onChange={(values) => {
                      setMinecraftVersions(values.slice(0, 1));
                      setPreview(null);
                    }}
                  />
                </label>
                <label className="grid gap-2 font-bold">
                  {t("favorites.modpackExport.loader")}
                  <select
                    className="field"
                    disabled={busy}
                    value={loader}
                    onChange={(event) => {
                      setLoader(event.target.value as typeof loader);
                      setPreview(null);
                    }}
                  >
                    <option value="neoforge">NeoForge</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                  </select>
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button className="button-primary focus-ring" disabled={!selectedVersion || busy} type="button" onClick={() => void inspect()}>
                    {busy ? t("common.loading") : t("favorites.modpackExport.preflight")}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p aria-live="polite" className="mt-4 rounded-lg border border-[var(--red)] bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--red)]">
                {error}
              </p>
            ) : null}
            {preview && !detail && !showHistory ? <ExportPreview preview={preview} busy={busy} onCreate={() => void createExport()} /> : null}
            {showHistory && !detail ? (
              <ExportHistory busy={busy} history={history} onBack={() => setShowHistory(false)} onSelect={openHistoryTask} />
            ) : null}
            {detail ? <ExportResult detail={detail} token={token} onBack={() => returnToSettings(detail.task)} /> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

type ExportHistoryProps = {
  busy: boolean;
  history: FavoriteModpackExportTask[];
  onBack: () => void;
  onSelect: (task: FavoriteModpackExportTask) => Promise<void>;
};

function ExportHistory({ busy, history, onBack, onSelect }: ExportHistoryProps) {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid gap-3">
      {busy ? <p>{t("common.loading")}</p> : null}
      {!busy && history.length === 0 ? (
        <p className="py-10 text-center text-[var(--muted)]">{t("favorites.modpackExport.historyEmpty")}</p>
      ) : null}
      {!busy ? history.map((task) => (
        <button
          className="focus-ring rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--accent)]"
          key={task.id}
          type="button"
          onClick={() => void onSelect(task)}
        >
          <strong className="block">{task.packName} · {task.packVersion}</strong>
          <span className="mt-1 block text-sm text-[var(--muted)]">
            Minecraft {task.minecraftVersion} · {task.loader} {task.loaderVersion} · {t(`favorites.modpackExport.status.${task.status}`)} · {new Date(task.createdAt).toLocaleString()}
          </span>
        </button>
      )) : null}
      <button className="button-secondary focus-ring justify-self-start" type="button" onClick={onBack}>
        {t("common.back")}
      </button>
    </div>
  );
}

function ExportPreview({ preview, busy, onCreate }: { preview: FavoriteModpackExportPreview; busy: boolean; onCreate: () => void }) {
  const { t } = useI18n();
  const successful = preview.items.filter((item) => item.resultType === "exported");
  const dependencies = preview.items.filter((item) => item.resultType === "auto_dependency");
  const omitted = preview.items.filter((item) => item.resultType === "skipped" || item.resultType === "failed");
  return (
    <div className="mt-6 grid gap-4">
      <SummaryGrid values={[
        [t("favorites.modpackExport.collectionItems"), preview.collectionItemCount],
        [t("favorites.modpackExport.exported"), preview.exportedModCount],
        [t("favorites.modpackExport.dependencies"), preview.autoDependencyCount],
        [t("favorites.modpackExport.skipped"), preview.skippedItemCount],
        [t("favorites.modpackExport.failed"), preview.failedItemCount],
      ]} />
      <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm font-bold">
        Minecraft {preview.minecraftVersion} · {preview.loader} {preview.loaderVersion}
      </p>
      <ExportItemGroup items={successful} title={t("favorites.modpackExport.exportedItems")} />
      <ExportItemGroup items={dependencies} title={t("favorites.modpackExport.autoDependencies")} />
      <ExportItemGroup items={omitted} title={t("favorites.modpackExport.omittedItems")} />
      {successful.length + dependencies.length === 0 ? (
        <p className="text-sm font-bold text-[var(--red)]">{t("favorites.modpackExport.noCompatibleMods")}</p>
      ) : null}
      <div className="flex justify-end">
        <button className="button-primary focus-ring" disabled={busy || successful.length + dependencies.length === 0} type="button" onClick={onCreate}>
          {omitted.length ? t("favorites.modpackExport.exportCompatible") : t("favorites.modpackExport.create")}
        </button>
      </div>
    </div>
  );
}

function ExportResult({ detail, token, onBack }: { detail: FavoriteModpackExportDetail; token: string; onBack: () => void }) {
  const { t } = useI18n();
  const [actionError, setActionError] = useState("");
  async function runResultAction(action: () => Promise<unknown>) {
    setActionError("");
    try { await action(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : String(reason)); }
  }
  const groups = useMemo(() => ({
    exported: detail.items.filter((item) => item.resultType === "exported"),
    dependencies: detail.items.filter((item) => item.resultType === "auto_dependency"),
    skipped: detail.items.filter((item) => item.resultType === "skipped"),
    failed: detail.items.filter((item) => item.resultType === "failed"),
  }), [detail.items]);
  return (
    <div className="mt-6 grid gap-4">
      <div aria-live="polite" className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
        <strong className="text-lg">{t(`favorites.modpackExport.status.${detail.task.status}`)}</strong>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Minecraft {detail.task.minecraftVersion} · {detail.task.loader} {detail.task.loaderVersion}
        </p>
      </div>
      <SummaryGrid values={[
        [t("favorites.modpackExport.collectionItems"), detail.task.collectionItemCount],
        [t("favorites.modpackExport.exported"), detail.task.exportedModCount],
        [t("favorites.modpackExport.dependencies"), detail.task.autoDependencyCount],
        [t("favorites.modpackExport.skipped"), detail.task.skippedItemCount],
        [t("favorites.modpackExport.failed"), detail.task.failedItemCount],
        [t("favorites.modpackExport.fileSize"), formatBytes(detail.task.fileSize)],
        [t("favorites.modpackExport.finalFiles"), detail.task.finalFileCount],
      ]} />
      <div className="rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
        <p><strong>{detail.task.packName}</strong> · {detail.task.packVersion}</p>
        <p>
          {new Date(detail.task.createdAt).toLocaleString()} {detail.task.expiresAt ? `· ${t("favorites.modpackExport.expiresAt")} ${new Date(detail.task.expiresAt).toLocaleString()}` : ""}
        </p>
        {detail.task.resultSha256 ? <p className="break-all font-mono text-xs">SHA-256 {detail.task.resultSha256}</p> : null}
      </div>
      <ExportItemGroup items={groups.exported} title={t("favorites.modpackExport.exportedItems")} />
      <ExportItemGroup items={groups.dependencies} title={t("favorites.modpackExport.autoDependencies")} />
      <ExportItemGroup items={groups.skipped} title={t("favorites.modpackExport.skippedItems")} />
      <ExportItemGroup items={groups.failed} title={t("favorites.modpackExport.failedItems")} />
      {actionError ? <p role="alert" className="text-sm text-[var(--red)]">{actionError}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {groups.failed.length ? (
          <button
            className="button-secondary focus-ring"
            type="button"
            onClick={() => void runResultAction(() => navigator.clipboard.writeText(groups.failed.map((item) => item.sourceProjectName).join("\n")))}
          >
            {t("favorites.modpackExport.copyFailed")}
          </button>
        ) : null}
        <button className="button-secondary focus-ring" type="button" onClick={onBack}>
          {t("favorites.modpackExport.sameSettings")}
        </button>
        {detail.downloadAvailable ? (
          <button
            className="button-primary focus-ring"
            type="button"
            onClick={() => void runResultAction(() => downloadFavoriteModpackExport(token, detail.task.id, exportFilename(detail.task)))}
          >
            {t("favorites.modpackExport.download")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SummaryGrid({ values }: { values: Array<[string, string | number]> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {values.map(([label, value]) => (
        <div className="rounded-lg border border-[var(--line)] p-3" key={label}>
          <div className="text-xs font-bold text-[var(--muted)]">{label}</div>
          <div className="mt-1 text-xl font-black">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ExportItemGroup({ items, title }: { items: FavoriteModpackExportItem[]; title: string }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <details className="rounded-lg border border-[var(--line)]" open={items.some((item) => item.resultType === "failed")}>
      <summary className="cursor-pointer p-3 font-black">{title} ({items.length})</summary>
      <div className="grid gap-2 border-t border-[var(--line)] p-3 md:grid-cols-2">
        {items.map((item, index) => (
          <article className="min-w-0 rounded-lg bg-[var(--panel-subtle)] p-3" key={`${item.sourceProjectId ?? item.modrinthProjectId ?? index}:${item.selectedFileName ?? item.reasonCode}`}>
            <h4 className="truncate font-bold">{item.sourceProjectName}</h4>
            {item.selectedVersionName ? <p className="mt-1 truncate text-sm">{item.selectedVersionName} · {item.selectedFileName}</p> : null}
            {item.sourceProjectId ? <p className="text-xs text-[var(--muted)]">MCMods {item.sourceProjectId}</p> : null}
            {item.modrinthProjectId ? <p className="text-xs text-[var(--muted)]">Modrinth {item.modrinthProjectId} · {item.modrinthVersionId}</p> : null}
            {item.fileSize ? <p className="text-xs text-[var(--muted)]">{formatBytes(item.fileSize)} · {item.releaseType}</p> : null}
            {item.dependencyOf?.length ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {t("favorites.modpackExport.dependencySource")}: {item.dependencyOf.join("、")}
              </p>
            ) : null}
            {item.reasonCode ? (
              <p className="mt-1 text-sm font-bold text-[var(--red)]">
                {t(`favorites.modpackExport.reasons.${item.reasonCode}`)}{item.reasonDetail ? `: ${item.reasonDetail}` : ""}
              </p>
            ) : null}
            {item.sha1 ? (
              <details className="mt-2 text-xs text-[var(--muted)]">
                <summary className="cursor-pointer">{t("favorites.modpackExport.checksums")}</summary>
                <p className="mt-1 break-all font-mono">SHA-1 {item.sha1}</p>
                <p className="break-all font-mono">SHA-512 {item.sha512}</p>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function exportFilename(task: FavoriteModpackExportDetail["task"]) {
  return `${task.packName}-${task.minecraftVersion}-${task.loader}.mrpack`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
}
