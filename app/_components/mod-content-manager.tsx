"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import type { BackendModRecord } from "../_lib/mod-api";
import { useI18n } from "../_lib/i18n-provider";
import { ModContentWorkspace } from "./mod-content-workspace";

export function ModContentManager({ siteId, importSource, versionId, createNew }: { siteId: string; importSource: "" | "icon" | "exporter"; versionId?: string; createNew?: boolean }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
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

  if (!ready) return <CenteredState text={t("common.loading")} />;
  if (!token) return <CenteredState text={t("modContent.managerLoginRequired")} action={<Link className="button-primary focus-ring" href={`/login?next=/mods/${encodeURIComponent(siteId)}/data/edit`}>{t("common.login")}</Link>} />;
  if (error) return <CenteredState text={error || t("modContent.managerDenied")} action={<Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}`}>{t("mods.detail.back")}</Link>} />;
  if (!mod) return <CenteredState text={t("common.loading")} />;

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)] lg:px-6">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div><Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link><h1 className="mt-2 text-3xl font-black">{t("modContent.managerTitle")}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{t("modContent.managerDescription", { name: mod.primaryName })}</p></div>
        <Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/edit`}>{t("mods.detail.edit")}</Link>
      </header>
      <ModContentWorkspace createNew={createNew} initialImportSource={importSource} initialVersionId={versionId} siteId={siteId} token={token} />
    </div>
  </main>;
}

function CenteredState({ text, action }: { text: string; action?: ReactNode }) {
  return <main className="grid min-h-[65vh] place-items-center bg-[var(--background)] p-6 text-[var(--foreground)]"><div className="max-w-xl text-center"><p className="font-bold text-[var(--muted)]">{text}</p>{action ? <div className="mt-4">{action}</div> : null}</div></main>;
}
