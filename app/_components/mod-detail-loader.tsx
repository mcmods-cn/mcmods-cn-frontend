"use client";

import { useCallback } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { BackendModRecord, backendModToCatalogEntry } from "../_lib/mod-api";
import { ModCatalogEntry } from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { loadResolvedContent } from "../_lib/editor-api";
import { ModDetail } from "./mod-detail";
import { ProjectDetailLoadFeedback, useProjectDetailQuery } from "./project-detail-load-boundary";

export function ModDetailLoader({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const load = useCallback(async (signal: AbortSignal) => {
    const record = await apiRequest<BackendModRecord>(
      `/api/v1/mods/${encodeURIComponent(siteId)}`,
      { signal },
      token,
    );
    const content = await loadResolvedContent(record.uniqueId, locale, "en-US", token, signal).catch(() => undefined);
    const fields = content?.localization?.fields;
    const localizedRecord = fields
      ? { ...record, secondaryName: fields.name || record.secondaryName, summary: fields.summary, bodyMarkdown: fields.contentMarkdown }
      : record;
    return backendModToCatalogEntry(localizedRecord);
  }, [locale, siteId, token]);
  const { state, retry } = useProjectDetailQuery<ModCatalogEntry>(ready, load);

  if (state.status === "ready") return <ModDetail mod={state.data} />;
  return <ProjectDetailLoadFeedback errorTitle={t("mods.detail.loadFailed")} notFoundTitle={t("mods.detail.notFound")} onRetry={retry} state={state} />;
}
