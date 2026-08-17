"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadPublicLogShare, logShareDownloadURL, type LogShare } from "../_lib/log-share-api";

const maxRenderedCharacters = 1_500_000;

export function LogShareViewer({ code }: { code: string }) {
  const [share, setShare] = useState<LogShare>();
  const [entryIndex, setEntryIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    loadPublicLogShare(code, controller.signal).then(setShare).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => controller.abort();
  }, [code]);
  const entry = share?.entries[entryIndex];
  const rendered = useMemo(() => {
    const text = entry?.text ?? "";
    if (!query.trim()) return text.slice(0, maxRenderedCharacters);
    const lines = text.split("\n").filter((line) => line.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5000);
    return lines.join("\n").slice(0, maxRenderedCharacters);
  }, [entry?.text, query]);
  if (error) return <main className="grid min-h-[60vh] place-items-center p-8"><div className="text-center"><h1 className="text-2xl font-black">日志不存在或已失效</h1><p className="mt-2 text-[var(--muted)]">{error}</p></div></main>;
  if (!share) return <main className="grid min-h-[60vh] place-items-center p-8 font-bold text-[var(--muted)]">正在读取脱敏日志…</main>;
  return <main className="min-h-screen bg-[var(--background)] px-3 py-6 text-[var(--foreground)]"><div className="mx-auto max-w-[1500px]">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-[var(--accent)]">日志查看分析器</p><h1 className="mt-1 break-all text-3xl font-black">{share.title || share.originalName || "脱敏日志"}</h1><p className="mt-2 text-sm text-[var(--muted)]">创建于 {formatDate(share.createdAt)} · 到期 {formatDate(share.expiresAt)} · 脱敏规则 v{share.redactionVersion}</p></div><div className="flex flex-wrap gap-2"><Link className="button-secondary" href="/tools/logs">创建分享</Link>{share.downloadable ? <a className="button-primary" href={logShareDownloadURL(code)}>下载脱敏文件</a> : null}</div></div>
    <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">❄ 表示系统自动隐藏的敏感信息。请勿将页面内容视为绝对无敏感信息。</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><input className="field" placeholder="搜索当前日志（仅显示匹配行）" value={query} onChange={(event) => setQuery(event.target.value)} /><label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-bold"><input checked={wrap} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />自动换行</label></div>
    {share.entries.length > 1 ? <div className="mt-4 flex max-w-full gap-2 overflow-x-auto">{share.entries.map((item, index) => <button className={index === entryIndex ? "button-primary shrink-0" : "button-secondary shrink-0"} key={item.index} type="button" onClick={() => setEntryIndex(index)}>{item.name}</button>)}</div> : null}
    <section className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[#111827] text-[#e5e7eb]"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-4 py-2 text-xs"><span>{entry?.name} · {entry?.lineCount} 行 · {formatBytes(entry?.byteSize ?? 0)}</span><button type="button" onClick={() => navigator.clipboard.writeText(entry?.text ?? "")}>复制脱敏文本</button></header><pre className={`max-h-[75vh] overflow-auto p-4 font-mono text-xs leading-5 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{rendered}</pre></section>
    {(entry?.text.length ?? 0) > maxRenderedCharacters ? <p className="mt-2 text-sm text-[var(--muted)]">日志过大，页面仅渲染前 {maxRenderedCharacters.toLocaleString()} 个字符；可下载完整脱敏文件。</p> : null}
  </div></main>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(1)} MiB`; }
