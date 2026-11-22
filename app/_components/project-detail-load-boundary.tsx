"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthSnapshot } from "../_lib/auth";
import { classifyProjectDetailFailure } from "../_lib/project-detail-state.mts";
import { useI18n } from "../_lib/i18n-provider";
import { PageFeedback } from "./page-feedback";

export type ProjectDetailLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function useProjectDetailQuery<T>(
  { generation, ready, user }: AuthSnapshot,
  target: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const scope = JSON.stringify([target, user?.id, user ? generation : null]);
  const [result, setResult] = useState<{ scope: string; state: ProjectDetailLoadState<T> }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const update = (state: ProjectDetailLoadState<T>) => {
      if (!controller.signal.aborted) setResult({ scope, state });
    };
    const timer = window.setTimeout(() => {
      update({ status: "loading" });
      void load(controller.signal)
        .then((data) => update({ status: "ready", data }))
        .catch((error: unknown) => {
          const failure = classifyProjectDetailFailure(error);
          update(failure.status === "not_found"
            ? { status: "not_found" }
            : { status: "error", message: failure.message });
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, load, ready, scope]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  // A previous result can include a project visible only to its submitter.
  const state: ProjectDetailLoadState<T> = ready && result?.scope === scope ? result.state : { status: "loading" };
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
