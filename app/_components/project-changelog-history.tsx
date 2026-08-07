"use client";

import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadProjectChangelog } from "../_lib/project-changelog-api";
import { ContentHistory } from "./content-history";
import { PageFeedback } from "./page-feedback";

export function ProjectChangelogHistory({ id }: { id: string }) {
  const { ready, token } = useAuthSnapshot();
  const { t } = useI18n();
  const [backHref, setBackHref] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    loadProjectChangelog(id, token).then((result) => setBackHref(`${result.target.url}?tab=changelog`))
      .catch((error) => setMessage(error instanceof Error ? error.message : t("changelog.loadFailed")));
  }, [id, ready, t, token]);
  if (!backHref) return <PageFeedback description={message || undefined} tone={message ? "danger" : "default"} title={message ? t("changelog.loadFailed") : t("common.loading")} />;
  return <ContentHistory backHref={backHref} endpoint={`/api/v1/changelogs/${encodeURIComponent(id)}/history`} titleKey="changelog.title" />;
}
