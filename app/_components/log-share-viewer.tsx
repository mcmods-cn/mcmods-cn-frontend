"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import { apiErrorMessage } from "../_lib/api-error.mts";
import { loadPublicLogShare, loadPublicLogShareEntry, logShareDownloadURL, type LogShare, type LogShareChunk } from "../_lib/log-share-api";

export function LogShareViewer({ code }: { code: string }) {
  const { locale, t } = useI18n();
  const [share, setShare] = useState<LogShare>();
  const [entryIndex, setEntryIndex] = useState(0);
  const [chunk, setChunk] = useState<LogShareChunk>();
  const [chunkCursor, setChunkCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [chunkBusy, setChunkBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState<unknown>();
  const [chunkError, setChunkError] = useState<unknown>();
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setShare(undefined);
      setError(undefined);
    });
    loadPublicLogShare(code, controller.signal).then((value) => {
      setShare(value);
      setEntryIndex(value.entries[0]?.index ?? 0);
      setChunkCursor("");
      setCursorHistory([]);
    }).catch((reason: unknown) => { if (!isAbortError(reason)) setError(reason); });
    return () => controller.abort();
  }, [code]);
  useEffect(() => {
    if (!share?.entries.some((entry) => entry.index === entryIndex)) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setChunk(undefined);
      setChunkBusy(true);
      setChunkError(undefined);
    });
    loadPublicLogShareEntry(code, entryIndex, { cursor: chunkCursor, signal: controller.signal })
      .then(setChunk)
      .catch((reason: unknown) => { if (!isAbortError(reason)) setChunkError(reason); })
      .finally(() => { if (!controller.signal.aborted) setChunkBusy(false); });
    return () => controller.abort();
  }, [chunkCursor, code, entryIndex, share?.entries]);
  const entry = share?.entries.find((item) => item.index === entryIndex);
  const rendered = useMemo(() => {
    const loadedText = chunk?.text ?? "";
    if (!query.trim()) return loadedText;
    const normalizedQuery = query.trim().toLowerCase();
    return loadedText.split("\n").filter((line) => line.toLowerCase().includes(normalizedQuery)).join("\n");
  }, [chunk?.text, query]);
  if (error) return <main className="grid min-h-[60vh] place-items-center p-8"><div className="text-center"><h1 className="text-2xl font-black">{t("logShare.missing")}</h1><p className="mt-2 text-[var(--muted)]">{apiErrorMessage(error, t, t("logShare.loadFailed"))}</p></div></main>;
  if (!share) return <main className="grid min-h-[60vh] place-items-center p-8 font-bold text-[var(--muted)]">{t("logShare.loading")}</main>;
  return <main className="min-h-screen bg-[var(--background)] px-3 py-6 text-[var(--foreground)]"><div className="mx-auto max-w-[1500px]">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">{t("logShare.title")}</p><h1 className="mt-1 break-all text-3xl font-black">{share.title || share.originalName || t("logShare.fallbackTitle")}</h1><p className="mt-2 text-sm text-[var(--muted)]">{t("logShare.dates", { created: formatDate(share.createdAt, locale), expires: formatDate(share.expiresAt, locale), version: share.redactionVersion })}</p></div><div className="flex flex-wrap gap-2"><Link className="button-secondary" href="/tools/logs">{t("logShare.create")}</Link>{share.downloadable ? <a className="button-primary" href={logShareDownloadURL(code)}>{t("logShare.download")}</a> : null}</div></div>
    <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">{t("logShare.privacyHint")}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><input className="field" placeholder={t("logShare.search")} value={query} onChange={(event) => setQuery(event.target.value)} /><label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-bold"><input checked={wrap} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />{t("logShare.wrap")}</label></div>
    {share.entries.length > 1 ? <div className="mt-4 flex max-w-full gap-2 overflow-x-auto">{share.entries.map((item) => <button className={item.index === entryIndex ? "button-primary shrink-0" : "button-secondary shrink-0"} key={item.index} type="button" onClick={() => { setEntryIndex(item.index); setChunk(undefined); setChunkCursor(""); setCursorHistory([]); setQuery(""); }}>{item.name}</button>)}</div> : null}
    <section className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[#111827] text-[#e5e7eb]"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-4 py-2 text-xs"><span>{t("logShare.chunkInfo", { name: entry?.name ?? "", lines: entry?.lineCount ?? 0, size: formatBytes(entry?.byteSize ?? 0), offset: chunk?.characterOffset.toLocaleString(locale) ?? "—" })}</span><button disabled={!chunk?.text} type="button" onClick={() => navigator.clipboard.writeText(chunk?.text ?? "")}>{t("logShare.copy")}</button></header>{chunkError ? <p className="p-4 text-[var(--red)]">{apiErrorMessage(chunkError, t, t("logShare.chunkLoadFailed"))}</p> : <pre className={`max-h-[75vh] overflow-auto p-4 font-mono text-xs leading-5 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{chunkBusy ? t("logShare.chunkLoading") : rendered}</pre>}</section>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">{t("logShare.boundedHint")}</p><div className="flex gap-2"><button className="button-secondary" disabled={chunkBusy || !cursorHistory.length} type="button" onClick={() => { setChunkCursor(cursorHistory.at(-1) || ""); setCursorHistory((history) => history.slice(0, -1)); setQuery(""); }}>{t("logShare.previous")}</button><button className="button-secondary" disabled={chunkBusy || !chunk?.hasMore || !chunk.nextCursor} type="button" onClick={() => { if (!chunk?.nextCursor) return; setCursorHistory((history) => [...history, chunkCursor]); setChunkCursor(chunk.nextCursor); setQuery(""); }}>{t("logShare.next")}</button></div></div>
  </div></main>;
}

function formatDate(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(1)} MiB`; }
function isAbortError(value: unknown) { return value instanceof DOMException && value.name === "AbortError"; }
