"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { BackendModRecord, backendModToCatalogEntry } from "../_lib/mod-api";
import { ModCatalogEntry } from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { loadResolvedContent } from "../_lib/editor-api";
import { ModDetail } from "./mod-detail";

type LoadResult = {
  siteId: string;
  locale: string;
  token: string;
  attempt: number;
  mod?: ModCatalogEntry;
  notFound?: boolean;
  error?: string;
};

export function ModDetailLoader({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [result, setResult] = useState<LoadResult>();
  const [attempt, setAttempt] = useState(0);
  // Do not show data from another resource, language, or authenticated session
  // while its replacement request is in flight.
  const current = ready && result?.siteId === siteId && result.locale === locale
    && result.token === token && result.attempt === attempt ? result : undefined;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const identity = { siteId, locale, token, attempt };
    apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}`, { signal: controller.signal }, token)
      .then(async (record) => {
        const content = await loadResolvedContent(record.uniqueId, locale, "en-US", token, controller.signal).catch(() => undefined);
        if (controller.signal.aborted) return;
        const fields = content?.localization?.fields;
        const localizedRecord = fields ? { ...record, secondaryName: fields.name || record.secondaryName, summary: fields.summary, bodyMarkdown: fields.contentMarkdown } : record;
        setResult({ ...identity, mod: backendModToCatalogEntry(localizedRecord) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ ...identity, notFound: error instanceof ApiError && error.status === 404,
          error: error instanceof Error ? error.message : t("mods.submission.loadFailed") });
      });
    return () => controller.abort();
  }, [attempt, locale, ready, siteId, t, token]);

  if (current?.mod) return <ModDetail mod={current.mod} />;
  return (
    <main className="grid min-h-[60vh] place-items-center bg-[var(--background)] px-4 text-center text-[var(--foreground)]">
      <div>
        <h1 className="text-2xl font-black">{current?.notFound ? t("mods.detail.notFound") : current?.error ? t("mods.submission.loadFailed") : t("common.loading")}</h1>
        {current?.error && !current.notFound ? <>
          <p className="mt-3 text-sm text-[var(--red)]" role="alert">{current.error}</p>
          <button className="button-secondary focus-ring mt-4" type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.refresh")}</button>
        </> : null}
        {!current ? <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full w-1/2 animate-pulse bg-[var(--accent)]" /></div> : null}
      </div>
    </main>
  );
}
