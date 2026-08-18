"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { followProject, loadProjectFollowStatus, unfollowProject } from "../_lib/project-follow-api";
import { useI18n } from "../_lib/i18n-provider";
import { useAuthSnapshot } from "../_lib/auth";

export function ProjectFollowButton({ publicId }: { publicId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !token || !publicId) return;
    const controller = new AbortController();
    loadProjectFollowStatus(token, publicId)
      .then((result) => { if (!controller.signal.aborted) setFollowed(result.followed); })
      .catch((reason) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : t("projectFollows.loadFailed")); setFollowed(false); } });
    return () => controller.abort();
  }, [publicId, ready, t, token]);

  if (!ready) return null;
  if (!token) return <Link className="button-secondary focus-ring" href="/login">{t("projectFollows.follow")}</Link>;
  return <span className="inline-flex flex-col items-start gap-1">
    <button
      aria-pressed={followed === true}
      className="button-secondary focus-ring"
      disabled={busy || followed === null}
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
    >{busy || followed === null ? t("common.loading") : t(followed ? "projectFollows.followed" : "projectFollows.follow")}</button>
    {error ? <span className="max-w-64 text-xs font-bold text-[var(--danger)]" role="alert">{error}</span> : null}
  </span>;
}
