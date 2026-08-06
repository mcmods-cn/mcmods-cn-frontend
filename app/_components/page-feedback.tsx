"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "../_lib/i18n-provider";

type PageFeedbackProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  progress?: number;
  compact?: boolean;
  tone?: "default" | "danger";
};

export function PageFeedback({ title, description, action, progress, compact = false, tone = "default" }: PageFeedbackProps) {
  return (
    <div className={`grid place-items-center bg-[var(--background)] px-4 text-[var(--foreground)] ${compact ? "min-h-64 py-8" : "min-h-[65vh] py-12"}`}>
      <section className={`surface w-full max-w-lg rounded-xl border p-6 text-center shadow-sm ${tone === "danger" ? "border-[var(--red)]" : "border-[var(--line)]"}`}>
        <h1 className={`text-xl font-black ${tone === "danger" ? "text-[var(--red)]" : ""}`}>{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
        {progress !== undefined ? <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div> : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </section>
    </div>
  );
}

export function LoginRequiredState({ nextPath, description, compact = false }: { nextPath: string; description?: string; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <PageFeedback
      compact={compact}
      title={t("site.loginRequiredTitle")}
      description={description || t("site.loginRequiredDescription")}
      action={<Link className="button-primary focus-ring inline-flex" href={`/login?next=${encodeURIComponent(nextPath)}`}>{t("common.login")}</Link>}
    />
  );
}
