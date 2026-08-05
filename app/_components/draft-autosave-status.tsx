"use client";

import type { AutoDraftStatus } from "../_lib/use-auto-draft";
import { useI18n } from "../_lib/i18n-provider";

export function DraftAutosaveStatus({ error, savedAt, status }: { error?: string; savedAt?: string; status: AutoDraftStatus }) {
  const { locale, t } = useI18n();
  if (status === "idle") return null;
  const label = status === "saved" && savedAt
    ? t("drafts.savedAt", { time: new Date(savedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })
    : t(`drafts.status.${status}`);
  return <p className={`text-sm font-bold ${status === "error" ? "text-[var(--red)]" : "text-[var(--muted)]"}`} title={error || undefined}>{label}</p>;
}
