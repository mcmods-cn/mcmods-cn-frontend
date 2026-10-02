"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthSnapshot, type AuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { apiErrorMessage } from "../_lib/api-error.mts";
import { createFileLogShares, createPastedLogShare, deleteLogShare, loadMyLogShares, logShareURL, type CreatedLogShare, type LogShareHistoryItem } from "../_lib/log-share-api";
import { mergeLogUploadTasks, processLogUploadBatch, type LogUploadTask } from "../_lib/log-upload-batch.mts";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { FileDropZone } from "./file-drop-zone";

const retentionOptions = [1, 3, 7, 30, 90, 365, 1095];
const maximumLogFiles = 10;
const logFileAccept = ".zip,.log,.txt,application/zip,text/plain";

export function LogShareTool() {
  const auth = useAuthSnapshot();
  return <LogShareForm key={`${auth.user?.id || "guest"}:${auth.token}`} auth={auth} />;
}

function LogShareForm({ auth: { token, user } }: { auth: AuthSnapshot }) {
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [fileTasks, setFileTasks] = useState<Array<LogUploadTask<File>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<CreatedLogShare[]>([]);
  const [history, setHistory] = useState<LogShareHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyQueryInput, setHistoryQueryInput] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySourceType, setHistorySourceType] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyDirection, setHistoryDirection] = useState<"asc" | "desc">("desc");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyState, setHistoryState] = useState<{ scope: string; busy: boolean; error?: unknown }>({ scope: "", busy: false });
  const [deleting, setDeleting] = useState<string[]>([]);
  const deletingRef = useRef(new Set<string>());
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const historyScope = JSON.stringify([historyDirection, historyOffset, historyQuery, historySourceType, historyStatus]);
  const historyCurrent = historyState.scope === historyScope;

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  function current(run: number) { return mounted.current && generation.current === run; }
  function refreshHistory() { setHistoryRefresh((value) => value + 1); }

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setHistoryState({ scope: historyScope, busy: true }); });
    void loadMyLogShares(token, { query: historyQuery, sourceType: historySourceType, status: historyStatus, direction: historyDirection, offset: historyOffset, signal: controller.signal }).then((page) => {
      if (controller.signal.aborted) return;
      if (historyOffset > 0 && historyOffset >= page.total) {
        setHistoryOffset(Math.max(0, Math.floor(Math.max(0, page.total - 1) / 30) * 30));
      }
      setHistory(page.items); setHistoryTotal(page.total); setHistoryState({ scope: historyScope, busy: false });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setHistoryState({ scope: historyScope, busy: false, error });
    });
    return () => controller.abort();
  }, [historyDirection, historyOffset, historyQuery, historySourceType, historyStatus, historyRefresh, historyScope, token]);

  async function submitPaste() {
    if (busyRef.current) return;
    if (!content.trim()) { setMessage(t("logShare.tool.pasteRequired")); return; }
    busyRef.current = true;
    const run = generation.current;
    const submittedContent = content;
    setBusy(true); setMessage(""); setResults([]);
    try {
      const result = await createPastedLogShare(title, submittedContent, retentionDays, token);
      if (!current(run)) return;
      setResults([result]);
      setContent((value) => value === submittedContent ? "" : value);
      setMessage(t("logShare.tool.saved"));
      if (token) refreshHistory();
    } catch (error) { if (current(run)) setMessage(apiErrorMessage(error, t, t("logShare.tool.failed"))); }
    finally { if (current(run)) { busyRef.current = false; setBusy(false); } }
  }

  function addFiles(selected: File[]) {
    if (busyRef.current) return;
    setFileTasks((current) => mergeLogUploadTasks(current, selected, fileIdentity, maximumLogFiles));
  }

  async function submitFiles() {
    if (busyRef.current) return;
    if (!token || !user) { setMessage(t("logShare.tool.loginFiles")); return; }
    if (!fileTasks.length || fileTasks.length > maximumLogFiles) { setMessage(t("logShare.tool.filesRequired", { count: maximumLogFiles })); return; }
    busyRef.current = true;
    const run = generation.current;
    setBusy(true); setMessage(""); setResults([]);
    try {
      const completed = await processLogUploadBatch(fileTasks, {
        upload: (file) => {
          if (!current(run)) throw new DOMException("Request cancelled", "AbortError");
          return uploadUserFileToOSS(file, token, "log_share");
        },
        createShares: (fileIds) => {
          if (!current(run)) throw new DOMException("Request cancelled", "AbortError");
          return createFileLogShares(fileIds, retentionDays, token);
        },
        onChange: (tasks) => { if (current(run)) setFileTasks(tasks); },
        messages: {
          unsupportedFile: (name) => t("logShare.tool.unsupportedFile", { name }),
          missingUploadID: t("logShare.tool.missingUploadID"), missingResult: t("logShare.tool.missingResult"),
          failed: t("logShare.tool.failed"), invalidStatus: t("logShare.tool.invalidStatus"),
        },
      });
      if (!current(run)) return;
      setFileTasks(completed);
      setResults(completed.map((task) => logUploadTaskResult(task, t)));
      const readyCount = completed.filter((task) => task.stage === "ready").length;
      const unfinishedCount = completed.length - readyCount;
      if (readyCount) refreshHistory();
      if (!unfinishedCount) {
        setFileTasks([]);
        setMessage(t("logShare.tool.batchSaved"));
      } else {
        setMessage(t("logShare.tool.batchPartial", { ready: readyCount, pending: unfinishedCount }));
      }
    } catch (error) { if (current(run)) setMessage(apiErrorMessage(error, t, t("logShare.tool.failed"))); }
    finally { if (current(run)) { busyRef.current = false; setBusy(false); } }
  }

  async function remove(code: string) {
    if (!token || deletingRef.current.has(code) || !confirm(t("logShare.tool.deleteConfirm"))) return;
    const run = generation.current;
    deletingRef.current.add(code); setDeleting([...deletingRef.current]);
    try {
      await deleteLogShare(code, token);
      if (!current(run)) return;
      setHistory((current) => current.filter((item) => item.publicCode !== code));
      setHistoryTotal((current) => Math.max(0, current - 1));
      refreshHistory();
    } catch (error) { if (current(run)) setMessage(apiErrorMessage(error, t, t("logShare.tool.failed"))); }
    finally { if (current(run)) { deletingRef.current.delete(code); setDeleting([...deletingRef.current]); } }
  }

  async function copyLink(code: string) {
    const run = generation.current;
    try {
      await navigator.clipboard.writeText(new URL(logShareURL(code), location.origin).toString());
      if (current(run)) setMessage(t("logShare.tool.copied"));
    } catch { if (current(run)) setMessage(t("common.copyFailed")); }
  }

  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-bold text-[var(--accent)]">{t("logShare.tool.kicker")}</p>
      <h1 className="mt-1 text-3xl font-black">{t("logShare.tool.title")}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("logShare.tool.description")}</p>
      <div className="mt-6 flex gap-2">
        <button className={mode === "paste" ? "button-primary" : "button-secondary"} disabled={busy} type="button" onClick={() => setMode("paste")}>{t("logShare.tool.paste")}</button>
        <button className={mode === "file" ? "button-primary" : "button-secondary"} disabled={busy} type="button" onClick={() => setMode("file")}>{t("logShare.tool.upload")}</button>
      </div>
      <section className="surface mt-4 grid gap-4 rounded-lg border border-[var(--line)] p-5">
        <label className="grid gap-2 text-sm font-bold">{t("logShare.tool.optionalTitle")}<input className="field" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-bold">{t("logShare.tool.retention")}<select className="field" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))}>{retentionOptions.map((days) => <option key={days} value={days}>{days >= 365 ? t("logShare.tool.years", { years: days / 365 }) : t("logShare.tool.days", { days })}</option>)}</select></label>
        {mode === "paste" ? (
          <label className="grid gap-2 text-sm font-bold">{t("logShare.tool.content")}
            <textarea className="field min-h-80 font-mono text-xs leading-5" maxLength={1_000_000} placeholder={t("logShare.tool.contentHint")} value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
        ) : (
          <div className="grid gap-2 text-sm font-bold">
            <span>{t("logShare.tool.files")}</span>
            <FileDropZone accept={logFileAccept} className="min-h-44 p-6" disabled={!token || busy}
              hint={token ? t("logShare.tool.filesLimit", { count: maximumLogFiles }) : t("logShare.tool.loginFiles")} multiple
              title={fileTasks.length ? t("logShare.tool.selectedFiles", { count: fileTasks.length }) : t("logShare.tool.chooseFiles")} onFiles={addFiles} />
            {fileTasks.length ? <ul className="grid gap-2" aria-label={t("logShare.tool.selectedLabel")}>
              {fileTasks.map((task, index) => <li className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2" key={task.key}>
                <span className="min-w-0"><span className="block truncate font-medium">{task.name}</span><small className={task.error ? "text-[var(--red)]" : "text-[var(--muted)]"}>{task.error || logUploadTaskStatus(task.stage, t)}</small></span>
                <button className="shrink-0 text-[var(--red)] hover:underline" disabled={busy} type="button" onClick={() => setFileTasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t("logShare.tool.remove")}</button>
              </li>)}
            </ul> : null}
            <small className="text-[var(--muted)]">{t("logShare.tool.storageHint")}</small>
          </div>
        )}
        <p className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{t("logShare.privacyHint")}</p>
        <button className="button-primary focus-ring" disabled={busy || (mode === "file" && !token)} type="button" onClick={() => void (mode === "paste" ? submitPaste() : submitFiles())}>{busy ? t("logShare.tool.processing") : t("logShare.tool.save")}</button>
        {message ? <p className="text-sm font-bold" role="status">{message}</p> : null}
      </section>
      {results.length ? <section className="mt-7"><h2 className="text-xl font-black">{t("logShare.tool.results")}</h2><div className="mt-3 grid gap-3">{results.map((result, index) => <article className="surface rounded-lg border border-[var(--line)] p-4" key={`${result.publicCode || result.fileId}:${index}`}>
        <strong>{result.error ? t("logShare.tool.failed") : result.status === "ready" ? t("logShare.tool.ready") : t("logShare.tool.processing")}</strong>
        {result.error ? <p className="mt-2 text-sm text-[var(--red)]">{result.error}</p> : result.status === "ready" && result.publicCode ? <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link className="text-[var(--accent)] hover:underline" href={logShareURL(result.publicCode)}>{t("logShare.tool.preview")}</Link>
          <button className="button-secondary" type="button" onClick={() => void copyLink(result.publicCode)}>{t("logShare.tool.copyLink")}</button>
        </div> : <p className="mt-2 text-sm text-[var(--muted)]">{t("logShare.tool.pending")}</p>}
      </article>)}</div></section> : null}
      {token ? <section className="mt-9"><h2 className="text-xl font-black">{t("logShare.tool.history")}</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-[minmax(180px,1fr)_140px_140px_140px_auto]" onSubmit={(event) => { event.preventDefault(); setHistoryOffset(0); setHistoryQuery(historyQueryInput.trim()); }}>
          <input className="field" aria-label={t("logShare.tool.historySearch")} placeholder={t("logShare.tool.historySearch")} type="search" value={historyQueryInput} onChange={(event) => setHistoryQueryInput(event.target.value)} />
          <select className="field" aria-label={t("logShare.tool.sourceType")} value={historySourceType} onChange={(event) => { setHistorySourceType(event.target.value); setHistoryOffset(0); }}><option value="">{t("logShare.tool.allTypes")}</option><option value="file">{t("logShare.tool.file")}</option><option value="paste">{t("logShare.tool.paste")}</option></select>
          <select className="field" aria-label={t("logShare.tool.status")} value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryOffset(0); }}><option value="">{t("logShare.tool.allStatuses")}</option><option value="ready">{t("logShare.tool.statusReady")}</option><option value="processing">{t("logShare.tool.statusProcessing")}</option><option value="failed">{t("logShare.tool.statusFailed")}</option><option value="expired">{t("logShare.tool.statusExpired")}</option></select>
          <select className="field" aria-label={t("logShare.tool.created")} value={historyDirection} onChange={(event) => { setHistoryDirection(event.target.value === "asc" ? "asc" : "desc"); setHistoryOffset(0); }}><option value="desc">{t("logShare.tool.newest")}</option><option value="asc">{t("logShare.tool.oldest")}</option></select>
          <button className="button-secondary" type="submit">{t("common.search")}</button>
        </form>
        {!historyCurrent || historyState.busy ? <p className="mt-3 text-sm" role="status">{t("common.loading")}</p> : historyState.error ? <div className="mt-3"><p className="text-sm text-[var(--red)]" role="alert">{apiErrorMessage(historyState.error, t, t("logShare.tool.historyFailed"))}</p><button className="button-secondary mt-2" type="button" onClick={refreshHistory}>{t("common.retry")}</button></div> : history.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--panel-subtle)]"><tr><th className="p-3">{t("logShare.tool.titleFile")}</th><th className="p-3">{t("logShare.tool.sourceType")}</th><th className="p-3">{t("logShare.tool.status")}</th><th className="p-3">{t("logShare.tool.created")}</th><th className="p-3">{t("logShare.tool.expires")}</th><th className="p-3">{t("logShare.tool.actions")}</th></tr></thead>
          <tbody>{history.map((item) => <tr className="border-t border-[var(--line)]" key={item.publicCode}>
            <td className="p-3 font-bold">{item.title || item.originalName || item.publicCode}</td><td className="p-3">{item.sourceType === "file" ? t("logShare.tool.file") : t("logShare.tool.paste")}</td><td className="p-3">{logShareStatus(item.status, t)}</td><td className="p-3">{formatDate(item.createdAt, locale)}</td><td className="p-3">{formatDate(item.expiresAt, locale)}</td>
            <td className="p-3"><div className="flex gap-2"><Link className="text-[var(--accent)] hover:underline" href={logShareURL(item.publicCode)}>{t("logShare.tool.view")}</Link><button className="text-[var(--red)] hover:underline" disabled={deleting.includes(item.publicCode)} type="button" onClick={() => void remove(item.publicCode)}>{t("logShare.tool.delete")}</button></div></td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-3 text-sm text-[var(--muted)]">{t("logShare.tool.empty")}</p>}
        {historyCurrent && !historyState.busy && !historyState.error && historyTotal > 30 ? <div className="mt-3 flex items-center justify-end gap-2"><button className="button-secondary" disabled={historyOffset === 0} type="button" onClick={() => setHistoryOffset(Math.max(0, historyOffset - 30))}>{t("common.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{Math.floor(historyOffset / 30) + 1} / {Math.ceil(historyTotal / 30)}</span><button className="button-secondary" disabled={historyOffset + 30 >= historyTotal} type="button" onClick={() => setHistoryOffset(historyOffset + 30)}>{t("common.next")}</button></div> : null}
      </section> : null}
    </div>
  </main>;
}

function formatDate(value: string, locale: string) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date) : "-"; }

function fileIdentity(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function logUploadTaskResult(task: LogUploadTask<File>, t: Translate): CreatedLogShare {
  if (task.share) {
    return {
      publicCode: task.share.publicCode || "",
      url: task.share.url || "",
      status: task.share.status,
      expiresAt: task.share.expiresAt || "",
      redactionVersion: task.share.redactionVersion || 0,
      redactionCounts: task.share.redactionCounts || {},
      entryCount: task.share.entryCount || 0,
      fileId: task.uploadedFileId,
      error: task.share.error,
    };
  }
  return {
    publicCode: "", url: "", status: task.stage, expiresAt: "", redactionVersion: 0,
    redactionCounts: {}, entryCount: 0, fileId: task.uploadedFileId || task.key,
    error: task.error || t("logShare.tool.stageIncomplete", { name: task.name }),
  };
}

type Translate = ReturnType<typeof useI18n>["t"];

function logUploadTaskStatus(stage: LogUploadTask<File>["stage"], t: Translate) {
  return ({
    pending: t("logShare.tool.stagePending"), invalid: t("logShare.tool.stageInvalid"), uploading: t("logShare.tool.stageUploading"), uploaded: t("logShare.tool.stageUploaded"),
    creating: t("logShare.tool.stageCreating"), processing: t("logShare.tool.statusProcessing"), ready: t("logShare.tool.ready"), failed: t("logShare.tool.stageFailed"),
  } satisfies Record<LogUploadTask<File>["stage"], string>)[stage];
}

function logShareStatus(status: string, t: Translate) {
  switch (status) {
    case "ready": return t("logShare.tool.statusReady");
    case "processing": return t("logShare.tool.statusProcessing");
    case "failed": return t("logShare.tool.statusFailed");
    case "expired": return t("logShare.tool.statusExpired");
    default: return status;
  }
}
