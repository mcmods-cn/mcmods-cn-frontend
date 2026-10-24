"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";

type ImportRevision = {
  id: string;
  revisionNo: number;
  status: string;
  modSiteId: string;
  sourceKind: string;
  namespace: string;
  minecraftVersion: string;
  loader: string;
  targetVersionPublicId: string;
  targetVersionLabel: string;
  package: { sha256: string; archiveName: string };
  counts: Record<string, number>;
  previousRevisionId?: string;
  resourceChanges?: Record<string, number>;
};

export function ModImportHistory({ siteId, revisionId }: { siteId: string; revisionId: string }) {
  const { token, user } = useAuthSnapshot();
  return <ImportRevisionDetail key={`${user?.id || "guest"}:${token}:${siteId}:${revisionId}`} siteId={siteId} revisionId={revisionId} />;
}

function ImportRevisionDetail({ siteId, revisionId }: { siteId: string; revisionId: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const [revision, setRevision] = useState<ImportRevision>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiRequest<ImportRevision>(`/api/v1/export-revisions/${encodeURIComponent(revisionId)}`, { signal: controller.signal }, token)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value.modSiteId !== siteId || value.id !== revisionId) throw new Error(t("catalogEditor.loadFailed"));
        setRevision(value);
        setError("");
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("catalogEditor.loadFailed")); });
    return () => controller.abort();
  }, [attempt, ready, revisionId, siteId, t, token]);
  return <main className="min-h-screen px-4 py-7"><article className="mx-auto max-w-5xl">
    <Link className="font-bold text-[var(--accent)]" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link>
    <h1 className="mt-3 text-3xl font-black">{t("modImportHistory.title")}</h1>
    {error ? <div className="mt-5" role="alert"><p>{error}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : !revision ? <p className="mt-5">{t("common.loading")}</p> : <>
      <dl className="mt-5 grid gap-3 rounded border border-[var(--line)] p-5 sm:grid-cols-2">
        {[["revision", `${revision.id} · #${revision.revisionNo}`], ["status", revision.status], ["source", `${revision.sourceKind} · ${revision.namespace}`], ["target", `${revision.targetVersionLabel || revision.targetVersionPublicId} · ${revision.minecraftVersion} · ${revision.loader}`], ["archive", revision.package?.archiveName || ""], ["hash", revision.package?.sha256 || ""]].map(([key, value]) => <div className="min-w-0" key={key}><dt className="text-sm text-[var(--muted)]">{t(`modImportHistory.${key}`)}</dt><dd className="break-all font-mono text-sm">{value}</dd></div>)}
      </dl>
      <h2 className="mt-6 text-xl font-black">{t("modImportHistory.scope")}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(revision.counts || {}).map(([key, count]) => <div className="rounded border border-[var(--line)] p-3" key={key}><dt>{key}</dt><dd>{count}</dd></div>)}</dl>
      <h2 className="mt-6 text-xl font-black">{t("modImportHistory.changes")}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(revision.resourceChanges || {}).map(([key, count]) => <div className="rounded border border-[var(--line)] p-3" key={key}><dt>{t(`modImportHistory.${key}`)}</dt><dd>{count}</dd></div>)}</dl>
      {revision.previousRevisionId ? <Link className="button-secondary focus-ring mt-4 inline-block" href={`/mods/${encodeURIComponent(siteId)}/history?importRevisionId=${encodeURIComponent(revision.previousRevisionId)}`}>{t("modImportHistory.previous")}</Link> : null}
    </>}
  </article></main>;
}
