"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { createFileLogShares, createPastedLogShare, deleteLogShare, loadMyLogShares, logShareURL, type CreatedLogShare, type LogShareHistoryItem } from "../_lib/log-share-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";

const retentionOptions = [1, 3, 7, 30, 90, 365, 1095];

export function LogShareTool() {
  const { token, user } = useAuthSnapshot();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [files, setFiles] = useState<File[]>([]);
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

  useEffect(() => {
    if (!token) return;
    let active = true;
    void loadMyLogShares(token, { query: historyQuery, sourceType: historySourceType, status: historyStatus, direction: historyDirection, offset: historyOffset }).then((page) => {
      if (active) { setHistory(page.items); setHistoryTotal(page.total); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [historyDirection, historyOffset, historyQuery, historySourceType, historyStatus, token]);

  async function refreshHistory() {
    if (!token) return;
    const page = await loadMyLogShares(token, { query: historyQuery, sourceType: historySourceType, status: historyStatus, direction: historyDirection, offset: historyOffset });
    setHistory(page.items);
    setHistoryTotal(page.total);
  }

  async function submitPaste() {
    if (!content.trim()) { setMessage("请粘贴一条日志。"); return; }
    setBusy(true); setMessage(""); setResults([]);
    try {
      const result = await createPastedLogShare(title, content, retentionDays, token);
      setResults([result]);
      setContent("");
      setMessage("脱敏日志已保存，请在分享前检查预览。");
      if (token) await refreshHistory();
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  }

  async function submitFiles() {
    if (!token || !user) { setMessage("文件模式仅供已登录用户使用。"); return; }
    if (!files.length || files.length > 10) { setMessage("请选择 1 至 10 个 .zip、.log 或 .txt 文件。"); return; }
    setBusy(true); setMessage(""); setResults([]);
    try {
      const uploadedIds: string[] = [];
      for (const file of files) {
        if (![".zip", ".log", ".txt"].some((extension) => file.name.toLowerCase().endsWith(extension))) throw new Error(`${file.name}：不支持的文件类型`);
        const uploaded = await uploadUserFileToOSS(file, token, "log_share");
        uploadedIds.push(uploaded.id);
      }
      const response = await createFileLogShares(uploadedIds, retentionDays, token);
      setResults(response.items);
      setFiles([]);
      setMessage("文件已计入个人储存；公开分享只包含系统生成的脱敏副本。");
      await refreshHistory();
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  }

  async function remove(code: string) {
    if (!token || !confirm("删除分享记录？原始文件仍保留在个人文件管理中。")) return;
    try {
      await deleteLogShare(code, token);
      setHistory((current) => current.filter((item) => item.publicCode !== code));
      setHistoryTotal((current) => Math.max(0, current - 1));
    } catch (error) { setMessage(errorText(error)); }
  }

  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-bold text-[var(--accent)]">小工具</p>
      <h1 className="mt-1 text-3xl font-black">日志查看与分享器</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">上传文件或粘贴日志，后端先使用 ❄ 隐藏常见敏感信息，再生成不可枚举的分享链接。</p>
      <div className="mt-6 flex gap-2"><button className={mode === "paste" ? "button-primary" : "button-secondary"} type="button" onClick={() => setMode("paste")}>粘贴文本</button><button className={mode === "file" ? "button-primary" : "button-secondary"} type="button" onClick={() => setMode("file")}>文件上传</button></div>

      <section className="surface mt-4 grid gap-4 rounded-lg border border-[var(--line)] p-5">
        <label className="grid gap-2 text-sm font-bold">标题（可选）<input className="field" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-bold">保留时间<select className="field" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))}>{retentionOptions.map((days) => <option key={days} value={days}>{days === 1095 ? "3 年" : days === 365 ? "1 年" : `${days} 天`}</option>)}</select></label>
        {mode === "paste" ? <label className="grid gap-2 text-sm font-bold">日志内容<textarea className="field min-h-80 font-mono text-xs leading-5" maxLength={1_000_000} placeholder="一次粘贴一条日志" value={content} onChange={(event) => setContent(event.target.value)} /></label> : <label className="grid gap-2 text-sm font-bold">日志文件<input accept=".zip,.log,.txt" className="field" disabled={!token} multiple type="file" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><small className="text-[var(--muted)]">文件模式需要登录；原文件占用个人额度，脱敏衍生副本不重复计费。</small></label>}
        <p className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">系统会自动隐藏常见敏感信息，但自动识别无法保证覆盖所有自定义敏感内容，请在分享前检查脱敏预览。</p>
        <button className="button-primary focus-ring" disabled={busy || (mode === "file" && !token)} type="button" onClick={() => void (mode === "paste" ? submitPaste() : submitFiles())}>{busy ? "正在处理…" : "脱敏并保存"}</button>
        {message ? <p className="text-sm font-bold" role="status">{message}</p> : null}
      </section>

      {results.length ? <section className="mt-7"><h2 className="text-xl font-black">处理结果</h2><div className="mt-3 grid gap-3">{results.map((result, index) => <article className="surface rounded-lg border border-[var(--line)] p-4" key={`${result.publicCode || result.fileId}:${index}`}><strong>{result.error ? "处理失败" : "脱敏完成"}</strong>{result.error ? <p className="mt-2 text-sm text-[var(--red)]">{result.error}</p> : <div className="mt-2 flex flex-wrap items-center gap-3"><Link className="text-[var(--accent)] hover:underline" href={logShareURL(result.publicCode)}>检查脱敏预览</Link><button className="button-secondary" type="button" onClick={() => navigator.clipboard.writeText(new URL(logShareURL(result.publicCode), location.origin).toString())}>复制分享链接</button></div>}</article>)}</div></section> : null}

      {token ? <section className="mt-9"><h2 className="text-xl font-black">我的日志分享</h2><form className="mt-3 grid gap-2 md:grid-cols-[minmax(180px,1fr)_140px_140px_140px_auto]" onSubmit={(event) => { event.preventDefault(); setHistoryOffset(0); setHistoryQuery(historyQueryInput.trim()); }}><input className="field" placeholder="搜索标题或文件名" type="search" value={historyQueryInput} onChange={(event) => setHistoryQueryInput(event.target.value)} /><select className="field" value={historySourceType} onChange={(event) => { setHistorySourceType(event.target.value); setHistoryOffset(0); }}><option value="">全部类型</option><option value="file">文件</option><option value="paste">粘贴</option></select><select className="field" value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryOffset(0); }}><option value="">全部状态</option><option value="ready">可用</option><option value="processing">处理中</option><option value="failed">失败</option><option value="expired">已过期</option></select><select className="field" value={historyDirection} onChange={(event) => { setHistoryDirection(event.target.value === "asc" ? "asc" : "desc"); setHistoryOffset(0); }}><option value="desc">最新创建</option><option value="asc">最早创建</option></select><button className="button-secondary" type="submit">筛选</button></form>{history.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--panel-subtle)]"><tr><th className="p-3">标题 / 文件</th><th className="p-3">类型</th><th className="p-3">状态</th><th className="p-3">创建时间</th><th className="p-3">到期时间</th><th className="p-3">操作</th></tr></thead><tbody>{history.map((item) => <tr className="border-t border-[var(--line)]" key={item.publicCode}><td className="p-3 font-bold">{item.title || item.originalName || item.publicCode}</td><td className="p-3">{item.sourceType === "file" ? "文件" : "粘贴"}</td><td className="p-3">{item.status}</td><td className="p-3">{formatDate(item.createdAt)}</td><td className="p-3">{formatDate(item.expiresAt)}</td><td className="p-3"><div className="flex gap-2"><Link className="text-[var(--accent)] hover:underline" href={logShareURL(item.publicCode)}>查看</Link><button className="text-[var(--red)] hover:underline" type="button" onClick={() => void remove(item.publicCode)}>删除分享记录</button></div></td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">暂无日志分享。</p>}{historyTotal > 30 ? <div className="mt-3 flex items-center justify-end gap-2"><button className="button-secondary" disabled={historyOffset === 0} type="button" onClick={() => setHistoryOffset(Math.max(0, historyOffset - 30))}>上一页</button><span className="text-sm font-bold text-[var(--muted)]">{Math.floor(historyOffset / 30) + 1} / {Math.ceil(historyTotal / 30)}</span><button className="button-secondary" disabled={historyOffset + 30 >= historyTotal} type="button" onClick={() => setHistoryOffset(historyOffset + 30)}>下一页</button></div> : null}</section> : null}
    </div>
  </main>;
}

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function formatDate(value: string) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
