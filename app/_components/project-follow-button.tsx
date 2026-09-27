"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { followProject, loadProjectFollowStatus, unfollowProject } from "../_lib/project-follow-api";
import { ApiError } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { useAuthSnapshot } from "../_lib/auth";

export function ProjectFollowButton({ publicId }: { publicId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !token || !publicId) return;
    const controller = new AbortController();
    loadProjectFollowStatus(token, publicId)
      .then((result) => {
        if (!controller.signal.aborted) {
          setFollowed(result.followed);
          setTargetUnavailable(result.target?.unavailable === true);
          setError("");
        }
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setFollowed(false);
          setTargetUnavailable(true);
          setError("");
          return;
        }
        setError(reason instanceof Error ? reason.message : t("projectFollows.loadFailed"));
        setFollowed(null);
      });
    return () => controller.abort();
  }, [publicId, ready, t, token]);

  if (!ready) return null;
  if (!token) return <Link className="button-secondary focus-ring" href="/login">{t("projectFollows.follow")}</Link>;
  return <span className="inline-flex flex-col items-start gap-1">
    <button
      aria-pressed={followed === true}
      className="button-secondary focus-ring"
      disabled={busy || followed === null || (targetUnavailable && !followed)}
      type="button"
      onClick={async () => {
        setBusy(true);
        setError("");
        try {
          if (followed === true) await unfollowProject(token, publicId);
          else await followProject(token, publicId);
          setFollowed(followed !== true);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : t("projectFollows.saveFailed"));
        } finally {
          setBusy(false);
        }
      }}
    >{targetUnavailable && !followed ? t("projectFollows.unavailable") : busy || followed === null ? t("common.loading") : t(followed ? "projectFollows.followed" : "projectFollows.follow")}</button>
    {error ? <span className="max-w-64 text-xs font-bold text-[var(--danger)]" role="alert">{error}</span> : null}
  </span>;
}
