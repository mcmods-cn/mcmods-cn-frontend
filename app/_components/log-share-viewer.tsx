"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import { loadPublicLogShare, logShareDownloadURL, type LogShare } from "../_lib/log-share-api";

const maxRenderedCharacters = 1_500_000;

export function LogShareViewer({ code }: { code: string }) {
  return <LogShareWorkspace key={code} code={code} />;
}

function LogShareWorkspace({ code }: { code: string }) {
  const { locale, t } = useI18n();
  const [share, setShare] = useState<LogShare>();
  const [entryIndex, setEntryIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    loadPublicLogShare(code, controller.signal).then((value) => {
      if (!cancelled) setShare(value);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [code, reload]);
  async function copyText() {
    try {
      await navigator.clipboard.writeText(entry?.text ?? "");
      setCopyMessage(t("logShareViewer.copied"));
    } catch {
      setCopyMessage(t("logShareViewer.copyFailed"));
    }
  }
  const entry = share?.entries[entryIndex];
  const rendered = useMemo(() => {
    const text = entry?.text ?? "";
    if (!query.trim()) return text.slice(0, maxRenderedCharacters);
    const lines = text.split("\n").filter((line) => line.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5000);
    return lines.join("\n").slice(0, maxRenderedCharacters);
  }, [entry?.text, query]);
  if (error) return <main className="grid min-h-[60vh] place-items-center p-8"><div className="text-center"><h1 className="text-2xl font-black">{t("logShareViewer.missing")}</h1><p className="mt-2 text-[var(--muted)]">{error}</p><button className="button-secondary mt-4" type="button" onClick={() => { setError(""); setReload((value) => value + 1); }}>{t("common.retry")}</button></div></main>;
  if (!share) return <main className="grid min-h-[60vh] place-items-center p-8 font-bold text-[var(--muted)]">{t("logShareViewer.loading")}</main>;
  return <main className="min-h-screen bg-[var(--background)] px-3 py-6 text-[var(--foreground)]"><div className="mx-auto max-w-[1500px]">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">{t("logShareViewer.kicker")}</p><h1 className="mt-1 break-all text-3xl font-black">{share.title || share.originalName || t("logShareViewer.untitled")}</h1><p className="mt-2 text-sm text-[var(--muted)]">{t("logShareViewer.dates", { created: formatDate(share.createdAt, locale), expires: formatDate(share.expiresAt, locale), version: share.redactionVersion })}</p></div><div className="flex flex-wrap gap-2"><Link className="button-secondary" href="/tools/logs">{t("logShareViewer.create")}</Link>{share.downloadable ? <a className="button-primary" href={logShareDownloadURL(code)}>{t("logShareViewer.download")}</a> : null}</div></div>
    <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">{t("logShareViewer.privacyNotice")}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><input className="field" aria-label={t("logShareViewer.search")} placeholder={t("logShareViewer.search")} value={query} onChange={(event) => setQuery(event.target.value)} /><label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-bold"><input checked={wrap} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />{t("logShareViewer.wrap")}</label></div>
    {share.entries.length > 1 ? <div className="mt-4 flex max-w-full gap-2 overflow-x-auto">{share.entries.map((item, index) => <button className={index === entryIndex ? "button-primary shrink-0" : "button-secondary shrink-0"} key={item.index} type="button" onClick={() => setEntryIndex(index)}>{item.name}</button>)}</div> : null}
    <section className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[#111827] text-[#e5e7eb]"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-4 py-2 text-xs"><span>{t("logShareViewer.entryInfo", { name: entry?.name ?? "", lines: entry?.lineCount ?? 0, size: formatBytes(entry?.byteSize ?? 0) })}</span><button type="button" onClick={() => void copyText()}>{t("logShareViewer.copy")}</button></header><pre className={`max-h-[75vh] overflow-auto p-4 font-mono text-xs leading-5 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{rendered}</pre></section>
    {copyMessage ? <p role="status" className="mt-2 text-sm">{copyMessage}</p> : null}
    {(entry?.text.length ?? 0) > maxRenderedCharacters ? <p className="mt-2 text-sm text-[var(--muted)]">{t("logShareViewer.truncated", { count: maxRenderedCharacters.toLocaleString(locale) })}</p> : null}
  </div></main>;
}

function formatDate(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(1)} MiB`; }
