"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const mutation = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setItems([]); } });
    apiRequest<{ items: PendingComment[] }>(`/api/v1/admin/comments/pending?status=${status}`, { signal: controller.signal }, token)
      .then((result) => { if (!controller.signal.aborted) { setItems(result.items); setError(""); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("common.loadFailed")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, status, t, token]);
  async function review(id: string, decision: "approved" | "rejected" | "restore") {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(id);
    try {
      await apiRequest(`/api/v1/comments/${encodeURIComponent(id)}/review`, { method: "PATCH", body: JSON.stringify({ status: decision, note: notes[id] || "" }) }, token);
      setItems((current) => current.filter((item) => item.id !== id));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.loadFailed")); }
    finally { mutation.current = false; setBusy(""); }
  }
  return <section className="surface rounded-xl p-5"><header className="flex flex-wrap items-center gap-3"><h1 className="mr-auto text-xl font-black">{t("commentModeration.title")}</h1><select aria-label={t("commentModeration.status")} className="field w-auto" disabled={Boolean(busy)} value={status} onChange={(event) => setStatus(event.target.value as "pending" | "hidden")}><option value="pending">{t("commentModeration.pending")}</option><option value="hidden">{t("commentModeration.rejected")}</option></select><button className="button-secondary focus-ring" disabled={loading || Boolean(busy)} type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.refresh")}</button></header><p className="mt-3 text-sm text-[var(--muted)]">{t("commentModeration.description")}</p>
    {error ? <div className="mt-3" role="alert">{error}<button className="button-secondary focus-ring ml-2" disabled={loading} type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
    <div className="mt-5 grid gap-3">{items.map((item) => <article className="rounded border border-[var(--line)] p-4" key={item.id}><Link className="font-bold text-[var(--accent)]" href={item.target.url}>{item.target.title || item.target.key}</Link><p className="mt-2 whitespace-pre-wrap break-words">{item.body}</p><p className="mt-2 text-sm text-[var(--muted)]">{item.authorId} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p><label className="mt-3 block text-sm">{t("commentModeration.note")}<textarea className="field mt-1" disabled={Boolean(busy)} value={notes[item.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label><div className="mt-3 flex flex-wrap gap-3">{status === "pending" ? <><button className="button-primary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "approved")}>{t("admin.reviews.approve")}</button><button className="button-secondary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "rejected")}>{t("admin.reviews.reject")}</button></> : <button className="button-secondary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void review(item.id, "restore")}>{t("commentModeration.restore")}</button>}</div></article>)}</div>
    {!error && !items.length ? <p className="mt-5">{t(loading ? "common.loading" : "contentHistory.empty")}</p> : null}
  </section>;
}
