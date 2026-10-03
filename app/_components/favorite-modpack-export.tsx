"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createFavoriteModpackExport,
  downloadFavoriteModpackExport,
  FavoriteModpackExportDetail,
  FavoriteModpackExportItem,
  FavoriteModpackExportPreview,
  FavoriteModpackExportStatus,
  FavoriteModpackExportTask,
  loadFavoriteModpackExport,
  loadFavoriteModpackExports,
  preflightFavoriteModpackExport,
  rebuildFavoriteModpackExportPreview,
} from "../_lib/favorite-api";
import { ApiError } from "../_lib/api";
import { formatBytes } from "../_lib/oss-upload";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftVersionPicker } from "./minecraft-version-picker";

type Props = {
  token: string;
  collectionId: string;
  collectionName: string;
  initialTaskId?: string;
};

export function FavoriteModpackExport(props: Props) {
  const { user } = useAuthSnapshot();
  return <FavoriteModpackExportSession key={`${user?.id || "guest"}:${props.token}:${props.collectionId}`} {...props} />;
}

function FavoriteModpackExportSession({ token, collectionId, collectionName, initialTaskId = "" }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState(collectionId);
  const [history, setHistory] = useState<FavoriteModpackExportTask[]>([]);
  const [historyStatus, setHistoryStatus] = useState<FavoriteModpackExportStatus>("all");
  const [historyCursor, setHistoryCursor] = useState("");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [minecraftVersions, setMinecraftVersions] = useState<string[]>([]);
  const [loader, setLoader] = useState<"neoforge" | "fabric" | "forge">("neoforge");
  const [preview, setPreview] = useState<FavoriteModpackExportPreview | null>(null);
  const [detail, setDetail] = useState<FavoriteModpackExportDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const downloadedTask = useRef("");
  const mutationInFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [open]);

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
    if (!selectedVersion || busy || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    setDetail(null);
    try {
      setPreview(await preflightFavoriteModpackExport(token, activeCollectionId, selectedVersion, loader));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.modpackExport.preflightFailed"));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function createExport() {
    if (!preview || busy || mutationInFlight.current || preview.minecraftVersion !== selectedVersion || preview.loader !== loader) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await createFavoriteModpackExport(token, activeCollectionId, preview, preview.allowCompatibleOnly || hasOmissions);
      setDetail(await loadFavoriteModpackExport(token, result.taskId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.modpackExport.createFailed"));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function showExportHistory() {
    if (busy || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    setDetail(null);
    setShowHistory(true);
    try {
      const page = await loadFavoriteModpackExports(token, { status: historyStatus });
      setHistory(page.items);
      setHistoryCursor(page.nextCursor);
      setHistoryHasMore(page.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function loadMoreHistory() {
    if (!historyHasMore || !historyCursor || busy || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const page = await loadFavoriteModpackExports(token, { status: historyStatus, cursor: historyCursor });
      setHistory((current) => {
        const known = new Set(current.map((task) => task.id));
        return [...current, ...page.items.filter((task) => !known.has(task.id))];
      });
      setHistoryCursor(page.nextCursor);
      setHistoryHasMore(page.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function changeHistoryStatus(status: FavoriteModpackExportStatus) {
    if (busy || mutationInFlight.current) return;
    setHistoryStatus(status);
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const page = await loadFavoriteModpackExports(token, { status });
      setHistory(page.items);
      setHistoryCursor(page.nextCursor);
      setHistoryHasMore(page.hasMore);
    } catch (reason) {
      setHistory([]);
      setHistoryCursor("");
      setHistoryHasMore(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function openHistoryTask(task: FavoriteModpackExportTask) {
    if (busy || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setDetail(await loadFavoriteModpackExport(token, task.id));
      setActiveCollectionId(task.collectionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function rebuildFromHistory(source: "current_collection" | "original_snapshot") {
    if (busy || mutationInFlight.current) return;
    if (!detail) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await rebuildFavoriteModpackExportPreview(token, detail.task.id, source);
      setMinecraftVersions([next.minecraftVersion]);
      setLoader(next.loader);
      setActiveCollectionId(next.collectionId);
      setShowHistory(false);
      setDetail(null);
      setPreview(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  const polledTaskID = detail?.task.id;
  const polledTaskStatus = detail?.task.status;
  useEffect(() => {
    if (!open || !polledTaskID || !["pending", "processing"].includes(polledTaskStatus || "")) return;
    let cancelled = false;
    let timer = 0;
    const refresh = async () => {
      try {
        const next = await loadFavoriteModpackExport(token, polledTaskID);
        if (!cancelled) setDetail(next);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, 2500);
      }
    };
    timer = window.setTimeout(refresh, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [polledTaskID, polledTaskStatus, open, token]);

  useEffect(() => {
    if (!detail?.downloadAvailable || detail.task.status !== "ready" || downloadedTask.current === detail.task.id) return;
    downloadedTask.current = detail.task.id;
    void downloadFavoriteModpackExport(token, detail.task.id, exportFilename(detail.task))
      .catch((reason) => setError(t(favoriteModpackExportDownloadErrorKey(reason))));
  }, [detail, t, token]);

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
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          className="surface fixed inset-0 m-auto max-h-[92vh] w-[calc(100%_-_1.5rem)] max-w-5xl overflow-y-auto rounded-xl p-4 backdrop:bg-black/55 md:p-6"
          onCancel={(event) => { event.preventDefault(); if (!busy) setOpen(false); }}
          onClick={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}
        >
          <fieldset disabled={busy}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black" id={titleId}>{t("favorites.modpackExport.title")}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{collectionName}</p>
              </div>
              <div className="flex gap-2">
                <button className="button-secondary focus-ring" type="button" onClick={() => void showExportHistory()}>
                  {t("favorites.modpackExport.history")}
                </button>
                <button aria-label={t("common.close")} className="button-secondary focus-ring" type="button" onClick={() => setOpen(false)}>
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
                    value={loader}
                    onChange={(event) => {
                      setPreview(null); setLoader(event.target.value as typeof loader);
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
              <ExportHistory
                busy={busy}
                hasMore={historyHasMore}
                history={history}
                status={historyStatus}
                onBack={() => setShowHistory(false)}
                onLoadMore={loadMoreHistory}
                onSelect={openHistoryTask}
                onStatusChange={changeHistoryStatus}
              />
            ) : null}
            {detail ? (
              <ExportResult
                busy={busy}
                detail={detail}
                onDownload={() => downloadFavoriteModpackExport(token, detail.task.id, exportFilename(detail.task))
                  .catch((reason) => setError(t(favoriteModpackExportDownloadErrorKey(reason))))}
                onRebuildCurrent={() => rebuildFromHistory("current_collection")}
                onRebuildOriginal={() => rebuildFromHistory("original_snapshot")}
              />
            ) : null}
          </fieldset>
        </dialog>
      ) : null}
    </>
  );
}

type ExportHistoryProps = {
  busy: boolean;
  hasMore: boolean;
  history: FavoriteModpackExportTask[];
  status: FavoriteModpackExportStatus;
  onBack: () => void;
  onLoadMore: () => Promise<void>;
  onSelect: (task: FavoriteModpackExportTask) => Promise<void>;
  onStatusChange: (status: FavoriteModpackExportStatus) => Promise<void>;
};

function ExportHistory({ busy, hasMore, history, status, onBack, onLoadMore, onSelect, onStatusChange }: ExportHistoryProps) {
  const { locale, t } = useI18n();
  const statuses: FavoriteModpackExportStatus[] = ["all", "pending", "processing", "ready", "failed", "expired", "cancelled"];
  return (
    <div className="mt-5 grid gap-3">
      <label className="grid max-w-xs gap-2 text-sm font-bold">
        {t("favorites.modpackExport.historyStatus")}
        <select className="field" disabled={busy} value={status} onChange={(event) => void onStatusChange(event.target.value as FavoriteModpackExportStatus)}>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value === "all" ? t("favorites.modpackExport.statusAll") : t(`favorites.modpackExport.status.${value}`)}
            </option>
          ))}
        </select>
      </label>
      {busy && history.length === 0 ? <p>{t("common.loading")}</p> : null}
      {!busy && history.length === 0 ? (
        <p className="py-10 text-center text-[var(--muted)]">{t("favorites.modpackExport.historyEmpty")}</p>
      ) : null}
      {history.map((task) => (
        <button
          className="focus-ring rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--accent)]"
          key={task.id}
          type="button"
          onClick={() => void onSelect(task)}
        >
          <strong className="block">{task.packName} · {task.packVersion}</strong>
          <span className="mt-1 block text-sm text-[var(--muted)]">
            Minecraft {task.minecraftVersion} · {task.loader} {task.loaderVersion} · {t(`favorites.modpackExport.status.${task.status}`)} · {new Date(task.createdAt).toLocaleString(locale)}
          </span>
        </button>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <button className="button-secondary focus-ring" type="button" onClick={onBack}>
          {t("common.back")}
        </button>
        {hasMore ? (
          <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void onLoadMore()}>
            {busy ? t("common.loading") : t("favorites.modpackExport.loadMoreHistory")}
          </button>
        ) : null}
      </div>
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

function ExportResult({
  busy,
  detail,
  onDownload,
  onRebuildCurrent,
  onRebuildOriginal,
}: {
  busy: boolean;
  detail: FavoriteModpackExportDetail;
  onDownload: () => Promise<void>;
  onRebuildCurrent: () => Promise<void>;
  onRebuildOriginal: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [copyError, setCopyError] = useState("");
  const groups = useMemo(() => ({
    exported: detail.items.filter((item) => item.resultType === "exported"),
    dependencies: detail.items.filter((item) => item.resultType === "auto_dependency"),
    skipped: detail.items.filter((item) => item.resultType === "skipped"),
    failed: detail.items.filter((item) => item.resultType === "failed"),
  }), [detail.items]);
  async function copyFailed() {
    setCopyError("");
    try { await navigator.clipboard.writeText(groups.failed.map(item => item.sourceProjectName).join("\n")); }
    catch { setCopyError(t("common.copyFailed")); }
  }
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
          {new Date(detail.task.createdAt).toLocaleString(locale)} {detail.task.expiresAt ? `· ${t("favorites.modpackExport.expiresAt")} ${new Date(detail.task.expiresAt).toLocaleString(locale)}` : ""}
        </p>
        {detail.task.resultSha256 ? <p className="break-all font-mono text-xs">SHA-256 {detail.task.resultSha256}</p> : null}
      </div>
      <ExportItemGroup items={groups.exported} title={t("favorites.modpackExport.exportedItems")} />
      <ExportItemGroup items={groups.dependencies} title={t("favorites.modpackExport.autoDependencies")} />
      <ExportItemGroup items={groups.skipped} title={t("favorites.modpackExport.skippedItems")} />
      <ExportItemGroup items={groups.failed} title={t("favorites.modpackExport.failedItems")} />
      {copyError ? <p role="alert" className="text-sm font-bold text-[var(--danger)]">{copyError}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {groups.failed.length ? (
          <button
            className="button-secondary focus-ring"
            type="button"
            onClick={() => void copyFailed()}
          >
            {t("favorites.modpackExport.copyFailed")}
          </button>
        ) : null}
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void onRebuildCurrent()}>
          {t("favorites.modpackExport.rebuildCurrentCollection")}
        </button>
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={() => void onRebuildOriginal()}>
          {t("favorites.modpackExport.rebuildOriginalSnapshot")}
        </button>
        {detail.downloadAvailable ? (
          <button
            className="button-primary focus-ring"
            type="button"
            onClick={() => void onDownload()}
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

function favoriteModpackExportDownloadErrorKey(reason: unknown) {
  if (reason instanceof ApiError) {
    if (reason.code === "MODPACK_EXPORT_DOWNLOAD_EXPIRED" || reason.status === 410) {
      return "favorites.modpackExport.downloadExpired";
    }
    if (reason.status === 401 || reason.status === 403) {
      return "favorites.modpackExport.downloadForbidden";
    }
  }
  return "favorites.modpackExport.downloadFailed";
}
