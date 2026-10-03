"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { BackendModRevision, BackendModRevisionComparison, BackendModRevisionList, CreateModPayload } from "../_lib/mod-api";
import { modRevisionHistoryPagePath, toggleModRevisionSelection } from "../_lib/mod-history-pagination.mts";
import { useI18n } from "../_lib/i18n-provider";

export function ModHistory({ siteId }: { siteId: string }) {
  const { token, user } = useAuthSnapshot();
  return <ModHistoryPage key={`${user?.id || "guest"}:${token}:${siteId}`} siteId={siteId} />;
}

function ModHistoryPage({ siteId }: { siteId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [page, setPage] = useState<BackendModRevisionList | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<BackendModRevision[]>([]);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const currentCursor = cursorHistory[cursorHistory.length - 1] || "";
  const items = page?.items ?? [];

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const controller = new AbortController();
    apiRequest<BackendModRevisionList>(modRevisionHistoryPagePath(siteId, currentCursor), { signal: controller.signal }, token)
      .then((result) => {
        if (!cancelled) {
          setPage(result);
          setMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled && (!(error instanceof DOMException) || error.name !== "AbortError")) {
          setMessage(error instanceof Error ? error.message : t("mods.history.loadFailed"));
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, currentCursor, ready, siteId, t, token]);

  function toggle(item: BackendModRevision) {
    setSelected((current) => toggleModRevisionSelection(current, item));
  }

  const sortedSelection = [...selected].sort((left, right) => left.version - right.version);
  const showPagination = cursorHistory.length > 1 || Boolean(page?.hasMore);
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link className="text-sm font-bold text-[var(--accent)]" href={`/mods/${siteId}`}>{t("mods.history.back")}</Link>
            <h1 className="mt-2 text-3xl font-black">{t("mods.history.title")}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{t("mods.history.description")}</p>
          </div>
          <div className="flex gap-2">
            <Link className="button-secondary focus-ring" href={`/mods/${siteId}/edit`}>{t("mods.history.edit")}</Link>
            {sortedSelection.length === 2 ? (
              <Link className="button-primary focus-ring" href={`/mods/${siteId}/compare?before=${sortedSelection[0].id}&after=${sortedSelection[1].id}`}>{t("mods.history.compare")}</Link>
            ) : <button className="button-primary" disabled type="button">{t("mods.history.selectTwo")}</button>}
          </div>
        </header>
        {message ? <p role="alert" className="mt-5 rounded-lg border border-[var(--red)] p-3 text-[var(--red)]">{message}</p> : null}
        {message ? <button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setMessage(""); setAttempt(value => value + 1); }}>{t("common.retry")}</button> : null}
        {!page && !message ? <p className="mt-5 text-sm text-[var(--muted)]">{t("common.loading")}</p> : null}
        <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[48px_80px_120px_150px_1fr_180px] gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 text-sm font-black">
              <span /><span>{t("mods.history.version")}</span><span>{t("mods.history.status")}</span><span>{t("mods.history.submitter")}</span><span>{t("mods.history.reason")}</span><span>{t("mods.history.time")}</span>
            </div>
            {items.map((item) => (
              <label key={item.id} className="grid cursor-pointer grid-cols-[48px_80px_120px_150px_1fr_180px] items-center gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 hover:bg-[var(--panel-subtle)]">
                <input type="checkbox" checked={selected.some((value) => value.id === item.id)} onChange={() => toggle(item)} />
                <strong>v{item.version}</strong>
                <Status status={item.status} />
                {item.submittedBy ? <Link className="truncate text-sm font-bold text-[var(--accent)] hover:underline" href={`/user/${item.submittedBy}`}>{item.submittedByName || item.submittedBy}</Link> : <span className="truncate text-sm text-[var(--muted)]">{item.submittedByName || "system"}</span>}
                <span className="text-sm text-[var(--muted)]">{item.changeReason || t("mods.history.initialSubmission")}</span>
                <time className="text-sm">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
              </label>
            ))}
          </div>
        </div>
        {showPagination ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <button className="button-secondary focus-ring" disabled={!page || cursorHistory.length <= 1} type="button" onClick={() => { setPage(null); setCursorHistory((history) => history.slice(0, -1)); }}>{t("common.previous")}</button>
            <span className="text-sm font-bold text-[var(--muted)]">{cursorHistory.length}</span>
            <button className="button-secondary focus-ring" disabled={!page?.hasMore || !page.nextCursor} type="button" onClick={() => { setPage(null); setCursorHistory((history) => [...history, page?.nextCursor || ""]); }}>{t("common.next")}</button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export function ModRevisionCompare(props: { siteId: string; before: string; after: string }) {
  const { token, user } = useAuthSnapshot();
  const { locale } = useI18n();
  return <ModRevisionCompareSession key={`${user?.id || "guest"}:${token || "guest"}:${locale}:${props.siteId}:${props.before}:${props.after}`} {...props} />;
}

function ModRevisionCompareSession({ siteId, before, after }: { siteId: string; before: string; after: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [comparison, setComparison] = useState<BackendModRevisionComparison | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    apiRequest<BackendModRevisionComparison>(`/api/v1/mods/${encodeURIComponent(siteId)}/revisions/compare?before=${encodeURIComponent(before)}&after=${encodeURIComponent(after)}`, {}, token)
      .then((result) => { if (!cancelled) setComparison(result); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("mods.history.compareFailed")); });
    return () => { cancelled = true; };
  }, [after, before, ready, siteId, t, token]);
  if (!comparison) return <main className="grid min-h-[60vh] place-items-center px-4">{message || t("common.loading")}</main>;
  const fields = Object.keys(comparison.after.snapshot) as Array<keyof CreateModPayload>;
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]"><div className="mx-auto max-w-[1440px]"><Link className="text-sm font-bold text-[var(--accent)]" href={`/mods/${siteId}/history`}>{t("mods.history.backToHistory")}</Link><h1 className="mt-2 text-3xl font-black">{t("mods.history.compareTitle", { before: comparison.before.version, after: comparison.after.version })}</h1><p className="mt-2 text-sm text-[var(--muted)]">{t("mods.history.compareDescription")}</p><div className="mt-6 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]"><div className="min-w-[1000px]"><div className="grid grid-cols-[220px_1fr_1fr] border-b border-[var(--line)] bg-[var(--panel-subtle)] font-black"><span className="p-4">{t("mods.history.field")}</span><span className="border-l border-[var(--line)] p-4">v{comparison.before.version}</span><span className="border-l border-[var(--line)] p-4">v{comparison.after.version}</span></div>{fields.map((field) => { const changed = comparison.changedFields.includes(field); return <div key={field} className={`grid grid-cols-[220px_1fr_1fr] border-b border-[var(--line)] last:border-b-0 ${changed ? "bg-[color-mix(in_srgb,var(--warning)_8%,var(--panel))]" : ""}`}><strong className="p-4 text-sm">{t(`mods.history.fields.${field}`)}</strong><DiffValue value={comparison.before.snapshot[field]} /><DiffValue value={comparison.after.snapshot[field]} /></div>; })}</div></div></div></main>;
}

function DiffValue({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-l border-[var(--line)] p-4 text-xs leading-5">{typeof value === "string" ? value || "-" : JSON.stringify(value, null, 2)}</pre>;
}

function Status({ status }: { status: BackendModRevision["status"] }) {
  const { t } = useI18n();
  return <span className={`w-fit rounded-md border px-2 py-1 text-xs font-bold ${status === "approved" ? "border-[var(--accent)] text-[var(--accent)]" : status === "rejected" ? "border-[var(--red)] text-[var(--red)]" : "border-[var(--warning)] text-[var(--warning)]"}`}>{t(`mods.history.statuses.${status}`)}</span>;
}
