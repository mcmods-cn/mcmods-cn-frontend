"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission, useAuthSnapshot } from "../../_lib/auth";
import { loadContentLanguageSettings } from "../../_lib/content-language-api";
import {
  loadContentTranslationTask,
  loadResolvedContent,
  requestContentTranslation,
} from "../../_lib/editor-api";
import type { LocalizedContentFields, LocalizationVersion, ResolvedContentDocument } from "../../_lib/editor-types";
import { useI18n } from "../../_lib/i18n-provider";
import { LocalizationStatusBadge } from "./localization-status-badge";

export function ContentTranslationControl({
  publicId,
  compact = false,
  onResolved,
}: {
  publicId: string;
  compact?: boolean;
  onResolved?: (version: LocalizationVersion<LocalizedContentFields> | undefined) => void;
}) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [languageSettings, setLanguageSettings] = useState<{ token: string; primaryLocale: string; secondaryLocale: string }>();
  const [document, setDocument] = useState<ResolvedContentDocument<LocalizedContentFields>>();
  const [pendingTaskId, setPendingTaskId] = useState<string>();
  const [requesting, setRequesting] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [error, setError] = useState("");
  const primaryLocale = token && languageSettings?.token === token ? languageSettings.primaryLocale : locale;
  const secondaryLocale = token && languageSettings?.token === token ? languageSettings.secondaryLocale : "";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadContentLanguageSettings(token).then((settings) => {
      if (cancelled) return;
      setLanguageSettings({
        token,
        primaryLocale: settings.primaryLocale || locale,
        secondaryLocale: settings.secondaryLocale || "",
      });
    }).catch(() => {
      // Content remains readable with the current interface locale when settings
      // cannot be loaded. The content endpoint still applies its server defaults.
    });
    return () => { cancelled = true; };
  }, [locale, token]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await loadResolvedContent(publicId, primaryLocale, secondaryLocale, token, signal);
    setDocument(next);
    setPendingTaskId(translationInProgress(next.translation.status) ? next.translation.taskId : undefined);
    setError("");
    return next;
  }, [primaryLocale, publicId, secondaryLocale, token]);

  useEffect(() => {
    const controller = new AbortController();
    loadResolvedContent(publicId, primaryLocale, secondaryLocale, token, controller.signal).then((next) => {
      setDocument(next);
      setPendingTaskId(translationInProgress(next.translation.status) ? next.translation.taskId : undefined);
      setError("");
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    });
    return () => controller.abort();
  }, [primaryLocale, publicId, secondaryLocale, token]);

  useEffect(() => {
    onResolved?.(document?.localization);
  }, [document?.localization, onResolved]);

  const activeStatus = document?.translation.status;
  // pendingTaskId is only retained for an explicitly in-progress task. A
  // completed translation can still be waiting for review and must not be
  // treated as runnable work or polled forever.
  const shouldPoll = translationInProgress(activeStatus) || Boolean(pendingTaskId);
  useEffect(() => {
    if (!shouldPoll) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        if (pendingTaskId && token) {
          const task = await loadContentTranslationTask(pendingTaskId, token, controller.signal);
          if (task.status === "failed") {
            setPendingTaskId(undefined);
            setError(task.error || t("contentTranslation.failed"));
            return;
          }
          if (translationInProgress(task.status)) {
            setPollAttempt((current) => current + 1);
            return;
          }
          if (task.status !== "completed" && task.status !== "ready") {
            setPendingTaskId(undefined);
            return;
          }
          setPendingTaskId(undefined);
        }
        const next = await refresh(controller.signal);
        if (translationInProgress(next.translation.status)) {
          setPollAttempt((current) => current + 1);
        }
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
      }
    }, 1800);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [pendingTaskId, pollAttempt, refresh, shouldPoll, t, token]);

  async function translate() {
    if (!document || !token || !user) return;
    setRequesting(true);
    setError("");
    try {
      const result = await requestContentTranslation(
        `/api/v1/content/${encodeURIComponent(publicId)}/translations`,
        {
          objectType: document.entityType,
          objectPublicId: publicId,
          sourceLocale: document.resolvedLocale,
          targetLocale: document.requestedLocale,
        },
        token,
      );
      setPendingTaskId(result.taskId && translationInProgress(result.status) ? result.taskId : undefined);
      await refresh();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setRequesting(false);
    }
  }

  const requestedEditable = useMemo(() => document?.editableLocales.some(
    (candidate) => candidate.toLowerCase() === document.requestedLocale.toLowerCase(),
  ) ?? true, [document]);
  const canRequestTranslation = hasPermission(user, "content.translate");
  if (!document && !error) return compact ? null : <p className="text-xs text-[var(--muted)]">{t("contentTranslation.loading")}</p>;

  const fallback = Boolean(document?.resolvedLocale && document.requestedLocale.toLowerCase() !== document.resolvedLocale.toLowerCase());
  const automatic = document?.translation.automatic && translationInProgress(activeStatus);
  const requestRequired = activeStatus === "request_required" && document?.translation.canRequest;
  const show = Boolean(error || fallback || automatic || requestRequired || pendingTaskId || document?.localization?.provenance === "ai" || document?.localization?.provenance === "human_corrected");
  if (!show) return null;

  return <aside className={`${compact ? "px-3 py-2" : "p-3"} mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] text-sm`} aria-live="polite">
    <div className="flex flex-wrap items-center gap-2">
      {document?.localization ? <LocalizationStatusBadge
        version={document.localization}
        labels={{
          ai: t("contentTranslation.aiBadge"),
          humanCorrected: t("contentTranslation.humanCorrectedBadge"),
        }}
      /> : null}
      {fallback ? <span className="text-xs font-bold text-[var(--muted)]">{t("contentTranslation.showingFallback", { locale: document?.resolvedLocale ?? "" })}</span> : null}
      {automatic || pendingTaskId ? <span className="text-xs font-bold text-[var(--accent)]">{t(document?.translation.countsTowardDailyTokenQuota ? "contentTranslation.paidInProgress" : "contentTranslation.freeInProgress")}</span> : null}
    </div>
    {requestRequired ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 flex-1 text-xs text-[var(--muted)]">{t("contentTranslation.paidExplanation", { locale: document?.requestedLocale ?? primaryLocale })}</p>
      <button className="button-secondary focus-ring shrink-0 px-3 py-1.5 text-xs" disabled={!ready || !user || !canRequestTranslation || requesting} type="button" onClick={() => void translate()}>
        {requesting ? t("contentTranslation.requesting") : !user ? t("contentTranslation.loginToTranslate") : canRequestTranslation ? t("contentTranslation.translate") : t("contentTranslation.noPermission")}
      </button>
    </div> : null}
    {!requestedEditable && document ? <p className="mt-2 text-[11px] text-[var(--muted)]">{t("contentTranslation.readOnly", { locale: document.requestedLocale })}</p> : null}
    {error ? <p className="mt-2 text-xs font-bold text-[var(--red)]" role="alert">{error}</p> : null}
  </aside>;
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function translationInProgress(status: string | undefined) {
  return status === "queued" || status === "running" || status === "retrying";
}
