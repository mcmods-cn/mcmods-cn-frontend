"use client";

import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadProjectChangelog } from "../_lib/project-changelog-api";
import { ContentHistory } from "./content-history";
import { PageFeedback } from "./page-feedback";

export function ProjectChangelogHistory({ id }: { id: string }) {
  const { token, user } = useAuthSnapshot();
  return <ProjectChangelogHistoryContent key={`${user?.id || "guest"}:${token || "guest"}:${id}`} id={id} />;
}

function ProjectChangelogHistoryContent({ id }: { id: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const [backHref, setBackHref] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadProjectChangelog(id, token).then((result) => { if (!cancelled) { setBackHref(`${result.target.url}?tab=changelog`); setMessage(""); } })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("changelog.loadFailed")); });
    return () => { cancelled = true; };
  }, [id, ready, t, token]);
  if (!backHref) return <PageFeedback description={message || undefined} tone={message ? "danger" : "default"} title={message ? t("changelog.loadFailed") : t("common.loading")} />;
  return <ContentHistory backHref={backHref} endpoint={`/api/v1/changelogs/${encodeURIComponent(id)}/history`} titleKey="changelog.title" />;
}
