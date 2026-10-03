"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { apiErrorMessage } from "../_lib/api-error.mts";
import { useI18n } from "../_lib/i18n-provider";
import { parseRevisionPreview, type RevisionPreview } from "../_lib/admin-review-preview.mts";

export function AdminReviewPreview({ revisionId, token }: { revisionId: string; token: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const identity = `${token}:${revisionId}`;
  const [result, setResult] = useState<{ identity: string; attempt: number; preview?: RevisionPreview; error?: unknown }>();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void apiRequest<unknown>(`/api/v1/content-revisions/${encodeURIComponent(revisionId)}`, { signal: controller.signal }, token)
      .then((value) => {
        const preview = parseRevisionPreview(value, revisionId);
        if (!controller.signal.aborted) setResult({ identity, attempt, preview });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ identity, attempt, error });
      });
    return () => controller.abort();
  }, [attempt, identity, open, revisionId, token]);
  const current = result?.attempt === attempt && result.identity === identity ? result : undefined;
  return <section className="mt-4 rounded-lg border border-[var(--line)] p-3">
    <button className="button-secondary focus-ring" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t(open ? "admin.reviews.hideProposal" : "admin.reviews.viewProposal")}</button>
    {open ? <div className="mt-3">
      <p className="text-sm text-[var(--muted)]">{t("admin.reviews.proposalDescription")}</p>
      {!current ? <p className="mt-3 text-sm" role="status">{t("common.loading")}</p> : null}
      {current?.error ? <div className="mt-3" role="alert"><p className="text-sm text-[var(--red)]">{apiErrorMessage(current.error, t, t("admin.reviews.proposalFailed"))}</p><button className="button-secondary focus-ring mt-2" type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
      {current?.preview ? <div className="mt-3 grid gap-3">
        <p className="text-xs text-[var(--muted)]">{t("admin.reviews.proposalIdentity", { id: current.preview.id, type: current.preview.entityType, project: current.preview.projectId })}</p>
        {Object.entries(current.preview.snapshot).map(([field, value]) => <div className="rounded border border-[var(--line)] p-3" key={field}>
          <h4 className="break-words text-sm font-bold">{proposalFieldLabel(field, t)}</h4>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
        </div>)}
      </div> : null}
    </div> : null}
  </section>;
}

function proposalFieldLabel(field: string, t: (key: string) => string) {
  const key = `admin.reviews.proposalFields.${field}`;
  const message = t(key);
  return message === key ? field : message;
}
