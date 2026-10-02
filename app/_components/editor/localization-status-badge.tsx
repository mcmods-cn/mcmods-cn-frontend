"use client";

import { useI18n } from "../../_lib/i18n-provider";
import type { ContentResolution, LocalizationVersion, ReviewStatus } from "../../_lib/editor-types";
import { resolveReviewStatusPresentation } from "../../_lib/review-status-presentation.mts";

export type LocalizationStatusLabels = Partial<{
  ai: string;
  humanCorrected: string;
  missing: string;
  original: string;
  human: string;
  draft: string;
  pending: string;
  approved: string;
  rejected: string;
  freeTranslation: string;
  paidTranslation: string;
}>;

export function LocalizationStatusBadge({
  version,
  resolution,
  labels = {},
  showApproved = false,
}: {
  version?: LocalizationVersion<unknown>;
  resolution?: ContentResolution;
  labels?: LocalizationStatusLabels;
  showApproved?: boolean;
}) {
  const { t } = useI18n();
  if (!version) {
    return <Badge tone="muted">{labels.missing ?? t("common.create")}</Badge>;
  }

  const review = resolveReviewStatusPresentation(version.reviewStatus);
  const knownReviewStatus = "status" in review ? review.status : undefined;
  const reviewText = knownReviewStatus
    ? labels[knownReviewStatus] ?? t(review.translationKey)
    : t(review.translationKey);
  const reviewTone: Record<ReviewStatus, BadgeTone> = {
    draft: "muted",
    pending: "warning",
    approved: "success",
    rejected: "danger",
  };
  const costText = resolution?.translationCost === "free_system"
    ? labels.freeTranslation
    : resolution?.translationCost === "user_daily_tokens"
      ? labels.paidTranslation
      : undefined;

  return <span className="inline-flex flex-wrap items-center gap-1" role="status">
    {version.provenance === "ai" ? <Badge tone="accent">{labels.ai ?? "AI"}</Badge> : null}
    {version.provenance === "human_corrected" ? <Badge tone="success">{labels.humanCorrected ?? `${t("common.edit")} ✓`}</Badge> : null}
    {(version.provenance === "original" || version.provenance === "import") && labels.original ? <Badge tone="muted">{labels.original}</Badge> : null}
    {version.provenance === "human" && labels.human ? <Badge tone="muted">{labels.human}</Badge> : null}
    {knownReviewStatus !== "approved" || showApproved ? <Badge tone={knownReviewStatus ? reviewTone[knownReviewStatus] : "danger"}>{reviewText}</Badge> : null}
    {costText ? <Badge tone={resolution?.translationCost === "free_system" ? "accent" : "warning"}>{costText}</Badge> : null}
  </span>;
}

type BadgeTone = "accent" | "success" | "warning" | "danger" | "muted";

function Badge({ children, tone }: { children: React.ReactNode; tone: BadgeTone }) {
  const styles: Record<BadgeTone, string> = {
    accent: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-[var(--warning)]/45 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]",
    danger: "border-[var(--red)]/45 bg-[color-mix(in_srgb,var(--red)_8%,transparent)] text-[var(--red)]",
    muted: "border-[var(--line)] bg-[var(--panel-subtle)] text-[var(--muted)]",
  };
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black leading-4 ${styles[tone]}`}>{children}</span>;
}
