"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { BackendModRecord, backendModToCatalogEntry } from "../_lib/mod-api";
import { ModCatalogEntry } from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { loadResolvedContent } from "../_lib/editor-api";
import { ModDetail } from "./mod-detail";

export function ModDetailLoader({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [mod, setMod] = useState<ModCatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}`, {}, token)
      .then(async (record) => {
        const content = await loadResolvedContent(record.uniqueId, locale, "en", token).catch(() => undefined);
        const fields = content?.localization?.fields;
        const localizedRecord = fields ? { ...record, secondaryName: fields.name || record.secondaryName, summary: fields.summary, bodyMarkdown: fields.contentMarkdown } : record;
        if (!cancelled) {
          setMod(backendModToCatalogEntry(localizedRecord));
          setNotFound(false);
        }
      })
      .catch((error) => {
        if (!cancelled && error instanceof ApiError && error.status === 404) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, ready, siteId, token]);

  if (mod) return <ModDetail mod={mod} />;
  return (
    <main className="grid min-h-[60vh] place-items-center bg-[var(--background)] px-4 text-center text-[var(--foreground)]">
      <div>
        <h1 className="text-2xl font-black">{notFound ? t("mods.detail.notFound") : t("common.loading")}</h1>
        {loading ? <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded bg-[var(--panel-subtle)]"><div className="h-full w-1/2 animate-pulse bg-[var(--accent)]" /></div> : null}
      </div>
    </main>
  );
}
