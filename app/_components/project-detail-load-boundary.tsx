"use client";

import { useCallback, useEffect, useState } from "react";
import { classifyProjectDetailFailure } from "../_lib/project-detail-state.mts";
import { useI18n } from "../_lib/i18n-provider";
import { PageFeedback } from "./page-feedback";

export type ProjectDetailLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function useProjectDetailQuery<T>(
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<ProjectDetailLoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ status: "loading" });
      void load(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setState({ status: "ready", data });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const failure = classifyProjectDetailFailure(error);
          setState(failure.status === "not_found"
            ? { status: "not_found" }
            : { status: "error", message: failure.message });
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, enabled, load]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { state, retry };
}

export function ProjectDetailLoadFeedback({
  state,
  notFoundTitle,
  errorTitle,
  onRetry,
}: {
  state: Exclude<ProjectDetailLoadState<never>, { status: "ready" }>;
  notFoundTitle: string;
  errorTitle: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (state.status === "loading") return <PageFeedback title={t("common.loading")} />;
  if (state.status === "not_found") return <PageFeedback title={notFoundTitle} />;
  return (
    <PageFeedback
      action={<button className="button-primary focus-ring" onClick={onRetry} type="button">{t("common.retry")}</button>}
      description={state.message || undefined}
      title={errorTitle}
      tone="danger"
    />
  );
}
