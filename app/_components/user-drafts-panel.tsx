"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { deleteUserDraft, draftResumeURL, loadUserDrafts, type UserDraftSummary } from "../_lib/draft-api";
import { useI18n } from "../_lib/i18n-provider";

export function UserDraftsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<UserDraftSummary[]>([]);
  const [retentionSeconds, setRetentionSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await loadUserDrafts(token);
      setItems(result.items);
      setRetentionSeconds(result.retentionSeconds);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("drafts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [refresh]);

  async function removeDraft(draft: UserDraftSummary) {
    if (!window.confirm(t("drafts.deleteConfirm", { title: draft.title || t("drafts.untitled") }))) return;
    try {
      await deleteUserDraft(draft.id, token);
      setItems((current) => current.filter((item) => item.id !== draft.id));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("drafts.deleteFailed"));
    }
  }

  return <section className="surface rounded-lg p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-black">{t("drafts.title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("drafts.description")}</p>
        {retentionSeconds > 0 ? <p className="mt-1 text-xs font-bold text-[var(--muted)]">{t("drafts.retentionSeconds", { count: retentionSeconds })}</p> : null}
      </div>
      <button className="button-secondary focus-ring" disabled={loading} type="button" onClick={() => void refresh()}>{t("user.refresh")}</button>
    </div>
    {message ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
    {loading ? <p className="py-14 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : items.length ? (
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map((draft) => <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" key={draft.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-black text-[var(--accent)]">{t(`drafts.kinds.${draft.kind}`)}</span>
              <h3 className="mt-1 truncate text-lg font-black">{draft.title || t("drafts.untitled")}</h3>
            </div>
            <button className="focus-ring rounded-md px-2 py-1 text-sm font-bold text-[var(--red)]" type="button" onClick={() => void removeDraft(draft)}>{t("common.delete")}</button>
          </div>
          <dl className="mt-4 grid gap-1 text-xs text-[var(--muted)]">
            <div className="flex justify-between gap-3"><dt>{t("drafts.updatedAt")}</dt><dd>{new Date(draft.updatedAt).toLocaleString(locale)}</dd></div>
            <div className="flex justify-between gap-3"><dt>{t("drafts.expiresAt")}</dt><dd>{new Date(draft.expiresAt).toLocaleString(locale)}</dd></div>
          </dl>
          <Link className="button-primary focus-ring mt-4 w-full justify-center" href={draftResumeURL(draft)}>{t("drafts.continueEditing")}</Link>
        </article>)}
      </div>
    ) : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] py-14 text-center text-sm font-bold text-[var(--muted)]">{t("drafts.empty")}</p>}
  </section>;
}
