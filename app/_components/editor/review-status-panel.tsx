"use client";

import type { EditResult, ReviewStatus } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";

export type ReviewStatusPanelLabels = Partial<{
  title: string;
  draft: string;
  pending: string;
  approved: string;
  rejected: string;
  changeRequest: string;
  revision: string;
  activity: string;
  note: string;
}>;

export function ReviewStatusPanel({
  result,
  status,
  note,
  labels = {},
}: {
  result?: EditResult;
  status?: ReviewStatus;
  note?: string;
  labels?: ReviewStatusPanelLabels;
}) {
  const { t } = useI18n();
  const currentStatus = status ?? result?.reviewStatus;
  if (!currentStatus && !result && !note) return null;
  const statusLabels: Record<ReviewStatus, string> = {
    draft: labels.draft ?? t("common.edit"),
    pending: labels.pending ?? t("common.loading"),
    approved: labels.approved ?? t("common.confirm"),
    rejected: labels.rejected ?? t("common.cancel"),
  };
  const tones: Record<ReviewStatus, string> = {
    draft: "border-[var(--line)]",
    pending: "border-[var(--warning)] text-[var(--warning)]",
    approved: "border-emerald-500 text-emerald-700 dark:text-emerald-300",
    rejected: "border-[var(--red)] text-[var(--red)]",
  };

  return <section className={`rounded-lg border bg-[var(--panel)] p-4 ${currentStatus ? tones[currentStatus] : "border-[var(--line)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-black">{labels.title ?? t("common.notice")}</h2>
      {currentStatus ? <span className="rounded-md border border-current px-2 py-1 text-xs font-black">{statusLabels[currentStatus]}</span> : null}
    </div>
    {note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{note}</p> : null}
    {result ? <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
      <StatusValue label={labels.changeRequest ?? t("common.notice")} value={String(result.changeRequestId)} />
      {result.revisionId ? <StatusValue label={labels.revision ?? t("mods.history.version")} value={String(result.revisionId)} /> : null}
      <StatusValue label={labels.activity ?? t("admin.community.activity")} value={String(result.activityEventId)} />
    </dl> : null}
  </section>;
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-bold text-[var(--muted)]">{label}</dt><dd className="mt-1 font-mono font-bold">{value}</dd></div>;
}
