"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CommentWatchListItem,
  loadMyCommentWatches,
  markCommentWatchRead,
  setCommentWatch,
  updateCommentWatchMute,
} from "../_lib/comment-api";
import { useI18n } from "../_lib/i18n-provider";
import { resolveCommentWatchMute } from "../_lib/comment-watch-mute.mts";

export function UserCommentWatchesPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [sort, setSort] = useState("activity");
  const [filter, setFilter] = useState("all");
  const [cursors, setCursors] = useState([""]);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<{ key: string; items: CommentWatchListItem[]; nextCursor: string; error?: string }>();
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify([filter, sort, cursor, revision]);
  const current = page?.key === key ? page : undefined;

  useEffect(() => {
    const controller = new AbortController();
    loadMyCommentWatches(token, { sort, filter, cursor }, controller.signal).then(result => {
      if (!controller.signal.aborted) setPage({ ...result, key });
    }).catch(error => {
      if (!controller.signal.aborted) setPage({ key, items: [], nextCursor: "", error: error instanceof Error ? error.message : t("commentWatches.loadFailed") });
    });
    return () => controller.abort();
  }, [cursor, filter, key, sort, t, token]);

  async function updateWatch(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setActionError("");
    try {
      await action();
      // Read again from the current filter: marking read and muting can
      // change both membership and sort order, including on earlier pages.
      setCursors([""]);
      setRevision(value => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("commentWatches.actionFailed"));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{t("commentWatches.title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("commentWatches.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="field py-2" aria-label={t("commentWatches.filter")} value={filter} onChange={(event) => { setCursors([""]); setFilter(event.target.value); }}>
            <option value="all">{t("commentWatches.all")}</option>
            <option value="unread">{t("commentWatches.unread")}</option>
            <option value="muted">{t("commentWatches.muted")}</option>
          </select>
          <select className="field py-2" aria-label={t("commentWatches.sort")} value={sort} onChange={(event) => { setCursors([""]); setSort(event.target.value); }}>
            <option value="activity">{t("commentWatches.sortActivity")}</option>
            <option value="created">{t("commentWatches.sortCreated")}</option>
            <option value="unread">{t("commentWatches.sortUnread")}</option>
          </select>
        </div>
      </div>
      {actionError ? <p className="mt-4 text-sm font-bold" role="alert">{actionError}</p> : null}
      {current?.error ? <p className="mt-4 text-sm font-bold" role="alert">{current.error} <button className="button-secondary focus-ring" type="button" onClick={() => setRevision(value => value + 1)}>{t("common.retry")}</button></p> : null}
      <div className="mt-5 grid gap-3">
        {current?.items.map((item) => {
          const authorName = item.comment.author.username;
          const muteState = resolveCommentWatchMute(item.mutedForever, item.mutedUntil);
          return <article className={`rounded-lg border bg-[var(--panel)] p-4 ${item.unreadCount ? "border-[var(--accent)]" : "border-[var(--line)]"}`} key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link className="font-black hover:text-[var(--accent)]" href={`${item.target.url}#comment-${item.comment.id}`}>{item.target.title}</Link>
                <p className="mt-1 text-xs text-[var(--muted)]">{t("commentWatches.watchedCommentBy", { name: authorName })} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</p>
              </div>
              {item.unreadCount ? <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--on-accent)]">{t("commentWatches.unreadCount", { count: item.unreadCount })}</span> : null}
            </div>
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.comment.deleted ? t("mods.comments.deleted") : item.comment.body}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
              <div><dt className="inline">{t("commentWatches.totalReplies")}: </dt><dd className="inline font-bold">{item.watchedReplies}</dd></div>
              <div><dt className="inline">{t("commentWatches.lastActivity")}: </dt><dd className="inline font-bold">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.lastActivityAt))}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
              <Link className="button-secondary focus-ring px-3 py-2 text-sm" href={`${item.target.url}#comment-${item.comment.id}`}>{t("commentWatches.view")}</Link>
              <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={saving || !item.unreadCount} type="button" onClick={() => void updateWatch(() => markCommentWatchRead(item.id, token))}>{t("commentWatches.markRead")}</button>
              <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                {t("commentWatches.mute")}
                <select className="field py-2" disabled={saving} value={muteState.selection} onChange={(event) => {
                  const value = event.target.value;
                  if (value === "until" || value === "invalid") return;
                  void updateWatch(() => updateCommentWatchMute(item.id, value as "none" | "1h" | "24h" | "7d" | "forever", token));
                }}>
                  <option value="none">{t("commentWatches.muteNone")}</option>
                  {muteState.selection === "until" ? <option disabled value="until">{t("commentWatches.mutedUntil", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(muteState.expiresAt)) })}</option> : null}
                  {muteState.selection === "invalid" ? <option disabled value="invalid">{t("commentWatches.muteInvalid")}</option> : null}
                  <option value="1h">{t("commentWatches.mute1h")}</option>
                  <option value="24h">{t("commentWatches.mute24h")}</option>
                  <option value="7d">{t("commentWatches.mute7d")}</option>
                  <option value="forever">{t("commentWatches.muteForever")}</option>
                </select>
              </label>
              <button className="ml-auto text-sm font-bold text-[var(--red)] hover:underline" disabled={saving} type="button" onClick={() => void updateWatch(() => setCommentWatch(item.comment.id, false, token))}>{t("commentWatches.unwatch")}</button>
            </div>
          </article>;
        })}
        {current && !current.error && !current.items.length ? <p className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm font-bold text-[var(--muted)]">{t("commentWatches.empty")}</p> : null}
        {!current ? <p className="p-6 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
      </div>
      {(cursors.length > 1 || current?.nextCursor) ? <div className="mt-4 flex justify-end gap-2">
        <button className="button-secondary focus-ring" disabled={cursors.length === 1} type="button" onClick={() => setCursors(history => history.slice(0, -1))}>{t("common.previous")}</button>
        <button className="button-secondary focus-ring" disabled={!current?.nextCursor} type="button" onClick={() => { if (current?.nextCursor) setCursors(history => [...history, current.nextCursor]); }}>{t("common.next")}</button>
      </div> : null}
    </section>
  );
}
