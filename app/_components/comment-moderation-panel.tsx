"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

type PendingComment = { id: string; body: string; authorId: string; status: string; createdAt: string; target: { type: string; key: string; title: string; url: string } };

export function CommentModerationPanel() {
  const { ready, token, user } = useAuthSnapshot();
  const { t } = useI18n();
  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user) return <LoginRequiredState nextPath="/comments/moderation" />;
  if (!hasPermission(user, "comment.moderate")) return <PageFeedback title={t("commentModeration.denied")} tone="danger" />;
  return <ModerationQueue key={`${user.id}:${token}`} token={token} />;
}

function ModerationQueue({ token }: { token: string }) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<"pending" | "hidden">("pending");
  const [items, setItems] = useState<PendingComment[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const generation = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  const reviewedIds = useRef(new Set<string>());
  const abortMore = useCallback(() => moreRequest.current?.abort(), []);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const mutation = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    abortMore();
    reviewedIds.current.clear();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setLoadingMore(false); setItems([]); setNextCursor(""); setHasMore(false); setMoreError(""); } });
    apiRequest<{ items: PendingComment[]; hasMore?: boolean; nextCursor?: string }>(`/api/v1/admin/comments/pending?status=${status}`, { signal: controller.signal }, token)
      .then((result) => { if (!controller.signal.aborted) { if (result.hasMore && !result.nextCursor) throw new Error(t("common.loadFailed")); setItems(result.items); setNextCursor(result.nextCursor || ""); setHasMore(result.hasMore === true); setError(""); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("common.loadFailed")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); abortMore(); };
  }, [abortMore, attempt, status, t, token]);
  async function loadMore() {
    if (moreRequest.current || loading || !hasMore || !nextCursor || mutation.current) return;
    const controller = new AbortController();
    const currentGeneration = generation.current;
    const cursor = nextCursor;
    moreRequest.current = controller;
    setLoadingMore(true);
    setMoreError("");
    try {
      const result = await apiRequest<{ items: PendingComment[]; hasMore: boolean; nextCursor: string }>(`/api/v1/admin/comments/pending?status=${status}&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal }, token);
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      if (result.hasMore && (!result.nextCursor || result.nextCursor === cursor)) throw new Error(t("common.loadFailed"));
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !existing.has(item.id) && !reviewedIds.current.has(item.id))];
      });
      setNextCursor(result.nextCursor || "");
      setHasMore(result.hasMore);
    } catch (reason) {
      if (!controller.signal.aborted && currentGeneration === generation.current) setMoreError(reason instanceof Error ? reason.message : t("common.loadFailed"));
    } finally {
      if (moreRequest.current === controller) { moreRequest.current = null; setLoadingMore(false); }
    }
  }
  async function review(id: string, decision: "approved" | "rejected" | "restore") {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(id);
    try {
      await apiRequest(`/api/v1/comments/${encodeURIComponent(id)}/review`, { method: "PATCH", body: JSON.stringify({ status: decision, note: notes[id] || "" }) }, token);
      reviewedIds.current.add(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.loadFailed")); }
    finally { mutation.current = false; setBusy(""); }
  }
  return <section className="surface rounded-xl p-5"><header className="flex flex-wrap items-center gap-3"><h1 className="mr-auto text-xl font-black">{t("commentModeration.title")}</h1><select aria-label={t("commentModeration.status")} className="field w-auto" disabled={Boolean(busy)} value={status} onChange={(event) => { abortMore(); generation.current++; setItems([]); setNextCursor(""); setHasMore(false); setStatus(event.target.value as "pending" | "hidden"); }}><option value="pending">{t("commentModeration.pending")}</option><option value="hidden">{t("commentModeration.rejected")}</option></select><button className="button-secondary focus-ring" disabled={loading || loadingMore || Boolean(busy)} type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.refresh")}</button></header><p className="mt-3 text-sm text-[var(--muted)]">{t("commentModeration.description")}</p>
    {error ? <div className="mt-3" role="alert">{error}<button className="button-secondary focus-ring ml-2" disabled={loading} type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
    <div className="mt-5 grid gap-3">{items.map((item) => <article className="rounded border border-[var(--line)] p-4" key={item.id}><Link className="font-bold text-[var(--accent)]" href={item.target.url}>{item.target.title || item.target.key}</Link><p className="mt-2 whitespace-pre-wrap break-words">{item.body}</p><p className="mt-2 text-sm text-[var(--muted)]">{item.authorId} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p><label className="mt-3 block text-sm">{t("commentModeration.note")}<textarea className="field mt-1" disabled={Boolean(busy)} value={notes[item.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label><div className="mt-3 flex flex-wrap gap-3">{status === "pending" ? <><button className="button-primary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "approved")}>{t("admin.reviews.approve")}</button><button className="button-secondary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "rejected")}>{t("admin.reviews.reject")}</button></> : <button className="button-secondary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "restore")}>{t("commentModeration.restore")}</button>}</div></article>)}</div>
    {moreError ? <p className="mt-4" role="alert">{moreError}</p> : null}
    {hasMore && nextCursor ? <button className="button-secondary focus-ring mt-4" disabled={loadingMore || Boolean(busy)} type="button" onClick={() => void loadMore()}>{t(loadingMore ? "common.loading" : moreError ? "common.retry" : "commentModeration.loadMore")}</button> : null}
    {!error && !items.length ? <p className="mt-5">{t(loading ? "common.loading" : "contentHistory.empty")}</p> : null}
  </section>;
}
