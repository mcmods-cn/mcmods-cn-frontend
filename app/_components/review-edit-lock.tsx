"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";

export type ReviewLockStatus = {
  locked: boolean;
  requestId?: string;
  submittedAt?: string;
  subscribed: boolean;
  canSubscribe: boolean;
};

type ReviewTargetType = "mod" | "modpack" | "plugin" | "map" | "resource_pack" | "shader_pack" | "datapack" | "addon" | "creator" | "community_post" | "blueprint" | "skin" | "project_changelog";

function useReviewLock(entityType: ReviewTargetType, publicId: string, enabled = true) {
  const { ready, token } = useAuthSnapshot();
  const [status, setStatus] = useState<ReviewLockStatus>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !ready || !token || !publicId) return;
    let cancelled = false;
    apiRequest<ReviewLockStatus>(`/api/v1/review-locks/${entityType}/${encodeURIComponent(publicId)}`, {}, token)
      .then((value) => { if (!cancelled) setStatus(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : ""); });
    return () => { cancelled = true; };
  }, [enabled, entityType, publicId, ready, token]);

  async function subscribe() {
    if (!token || !status?.locked) return;
    setError("");
    try {
      await apiRequest(`/api/v1/review-locks/${entityType}/${encodeURIComponent(publicId)}/subscribe`, { method: "POST" }, token);
      setStatus((current) => current ? { ...current, subscribed: true } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "");
    }
  }

  return { status, error, subscribe };
}

export function ReviewAwareEditAction({ canEdit, editHref, entityType, publicId }: {
  canEdit: boolean;
  editHref: string;
  entityType: ReviewTargetType;
  publicId: string;
}) {
  const { t } = useI18n();
  const { status, error, subscribe } = useReviewLock(entityType, publicId, canEdit);
  if (!canEdit) return null;
  if (error && !status) return <Link className="button-primary focus-ring" href={editHref}>{t("common.edit")}</Link>;
  if (!status) return <span className="button-primary opacity-60" aria-busy="true">{t("common.loading")}</span>;
  if (!status.locked) return <Link className="button-primary focus-ring" href={editHref}>{t("common.edit")}</Link>;
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <span className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm font-bold">{t("reviewLock.editBlocked")}</span>
    {status.canSubscribe ? <button className="button-secondary focus-ring" disabled={status.subscribed} type="button" onClick={() => void subscribe()}>{t(status.subscribed ? "reviewLock.subscribed" : "reviewLock.notifyMe")}</button> : null}
    {error ? <span className="text-xs font-bold text-[var(--red)]">{error}</span> : null}
  </div>;
}

export function ReviewLockGate({ children, entityType, publicId, returnHref }: {
  children: React.ReactNode;
  entityType: ReviewTargetType;
  publicId: string;
  returnHref: string;
}) {
  const { t } = useI18n();
  const { status, error, subscribe } = useReviewLock(entityType, publicId);
  if (error && !status) return <main className="grid min-h-[60vh] place-items-center px-4 text-center"><section className="w-full max-w-xl rounded-lg border border-[var(--red)] bg-[var(--panel)] p-6"><p className="font-bold text-[var(--red)]">{error}</p><Link className="button-secondary focus-ring mt-5 inline-flex" href={returnHref}>{t("common.back")}</Link></section></main>;
  if (!status) return <main className="grid min-h-[60vh] place-items-center"><p className="font-black">{t("common.loading")}</p></main>;
  if (!status.locked) return children;
  return <main className="grid min-h-[60vh] place-items-center px-4 text-center">
    <section className="w-full max-w-xl rounded-lg border border-[var(--warning)] bg-[var(--panel)] p-6">
      <h1 className="text-2xl font-black">{t("reviewLock.title")}</h1>
      <p className="mt-3 leading-7 text-[var(--muted)]">{t("reviewLock.description")}</p>
      {error ? <p className="mt-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link className="button-secondary focus-ring" href={returnHref}>{t("common.back")}</Link>
        {status.canSubscribe ? <button className="button-primary focus-ring" disabled={status.subscribed} type="button" onClick={() => void subscribe()}>{t(status.subscribed ? "reviewLock.subscribed" : "reviewLock.notifyMe")}</button> : null}
      </div>
    </section>
  </main>;
}
