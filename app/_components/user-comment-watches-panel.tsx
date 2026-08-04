"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CommentWatchListItem,
  loadMyCommentWatches,
  markCommentWatchRead,
  setCommentWatch,
  updateCommentWatchMute,
} from "../_lib/comment-api";
import { useI18n } from "../_lib/i18n-provider";

export function UserCommentWatchesPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<CommentWatchListItem[]>([]);
  const [sort, setSort] = useState("activity");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadMyCommentWatches(token, { sort, filter });
      setItems(result.items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("commentWatches.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [filter, sort, t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function markRead(item: CommentWatchListItem) {
    try {
      await markCommentWatchRead(item.id, token);
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, unreadCount: 0 } : value));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("commentWatches.actionFailed"));
    }
  }

  async function unwatch(item: CommentWatchListItem) {
    try {
      await setCommentWatch(item.comment.id, false, token);
      setItems((current) => current.filter((value) => value.id !== item.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("commentWatches.actionFailed"));
    }
  }

  async function mute(item: CommentWatchListItem, value: "none" | "1h" | "24h" | "7d" | "forever") {
    try {
      await updateCommentWatchMute(item.id, value, token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("commentWatches.actionFailed"));
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
          <select className="field py-2" aria-label={t("commentWatches.filter")} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">{t("commentWatches.all")}</option>
            <option value="unread">{t("commentWatches.unread")}</option>
            <option value="muted">{t("commentWatches.muted")}</option>
          </select>
          <select className="field py-2" aria-label={t("commentWatches.sort")} value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="activity">{t("commentWatches.sortActivity")}</option>
            <option value="created">{t("commentWatches.sortCreated")}</option>
            <option value="unread">{t("commentWatches.sortUnread")}</option>
          </select>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 grid gap-3">
        {items.map((item) => {
    const authorName = item.comment.author.username;
          return <article className={`rounded-lg border bg-[var(--panel)] p-4 ${item.unreadCount ? "border-[var(--accent)]" : "border-[var(--line)]"}`} key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link className="font-black hover:text-[var(--accent)]" href={`${item.target.url}#comment-${item.comment.id}`}>{item.target.title}</Link>
                <p className="mt-1 text-xs text-[var(--muted)]">{t("commentWatches.watchedCommentBy", { name: authorName })} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</p>
              </div>
              {item.unreadCount ? <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-white">{t("commentWatches.unreadCount", { count: item.unreadCount })}</span> : null}
            </div>
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.comment.deleted ? t("mods.comments.deleted") : item.comment.body}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
              <div><dt className="inline">{t("commentWatches.totalReplies")}: </dt><dd className="inline font-bold">{item.watchedReplies}</dd></div>
              <div><dt className="inline">{t("commentWatches.lastActivity")}: </dt><dd className="inline font-bold">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.lastActivityAt))}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
              <Link className="button-secondary focus-ring px-3 py-2 text-sm" href={`${item.target.url}#comment-${item.comment.id}`}>{t("commentWatches.view")}</Link>
              <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={!item.unreadCount} type="button" onClick={() => void markRead(item)}>{t("commentWatches.markRead")}</button>
              <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                {t("commentWatches.mute")}
                <select className="field py-2" value={item.mutedForever ? "forever" : item.mutedUntil ? "24h" : "none"} onChange={(event) => void mute(item, event.target.value as "none" | "1h" | "24h" | "7d" | "forever")}>
                  <option value="none">{t("commentWatches.muteNone")}</option>
                  <option value="1h">{t("commentWatches.mute1h")}</option>
                  <option value="24h">{t("commentWatches.mute24h")}</option>
                  <option value="7d">{t("commentWatches.mute7d")}</option>
                  <option value="forever">{t("commentWatches.muteForever")}</option>
                </select>
              </label>
              <button className="ml-auto text-sm font-bold text-[var(--red)] hover:underline" type="button" onClick={() => void unwatch(item)}>{t("commentWatches.unwatch")}</button>
            </div>
          </article>;
        })}
        {!loading && !items.length ? <p className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm font-bold text-[var(--muted)]">{t("commentWatches.empty")}</p> : null}
        {loading ? <p className="p-6 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
      </div>
    </section>
  );
}
