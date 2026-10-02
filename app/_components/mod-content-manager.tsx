"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import type { BackendModRecord } from "../_lib/mod-api";
import { useI18n } from "../_lib/i18n-provider";
import { ModContentWorkspace } from "./mod-content-workspace";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

type ManagerProps = { siteId: string; importSource: "" | "icon" | "exporter" | "iconrenderer" | "letmeseesee" | "irr"; versionId?: string; createNew?: boolean };

export function ModContentManager(props: ManagerProps) {
  const { token, user } = useAuthSnapshot();
  return <ModContentManagerSession key={`${user?.id || "guest"}:${token}:${props.siteId}:${props.versionId || ""}:${props.createNew || false}:${props.importSource}`} {...props} />;
}

function ModContentManagerSession({ siteId, importSource, versionId, createNew }: ManagerProps) {
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [mod, setMod] = useState<BackendModRecord>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}/editor`, {}, token)
      .then((value) => { if (!cancelled) setMod(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [ready, siteId, token]);

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!token || !user) return <LoginRequiredState nextPath={`/mods/${siteId}/data/edit`} description={t("modContent.managerLoginRequired")} />;
  if (error) return <PageFeedback title={error || t("modContent.managerDenied")} tone="danger" action={<Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}`}>{t("mods.detail.back")}</Link>} />;
  if (!mod) return <PageFeedback title={t("common.loading")} />;

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)] lg:px-6">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link><h1 className="mt-2 text-3xl font-black">{t("modContent.managerTitle")}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{t("modContent.managerDescription", { name: mod.primaryName })}</p></div>
        <Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/edit`}>{t("mods.detail.edit")}</Link>
      </header>
      <ModContentWorkspace createNew={createNew} initialImportSource={importSource} initialVersionId={versionId} siteId={siteId} subjectId={user.id} token={token} />
    </div>
  </main>;
}
