"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { contentLanguageCandidates, normalizeContentLanguage } from "../_lib/content-language";
import { loadModContentResource, type ModContentLocalization, type ModContentResource } from "../_lib/mod-content-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";

export function ModContentResourceDetail({ siteId, resourceId, versionId }: { siteId: string; resourceId: string; versionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [detail, setDetail] = useState<ModContentResource>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadModContentResource(siteId, resourceId, token)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [resourceId, siteId, token]);

  if (!detail) return <main className="grid min-h-[65vh] place-items-center p-6">{error || t("common.loading")}</main>;

  const requestedIndex = detail.versions.findIndex((item) => item.publicId === versionId);
  const firstDetailedIndex = detail.versions.findIndex((item) => item.hasDetail);
  const currentIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, firstDetailedIndex);
  const current = detail.versions[currentIndex];
  const versionDetail = detail.details.find((item) => item.versionPublicId === current?.publicId);
  const localization = resolveVersionLocalization(versionDetail?.localizations || [], locale, versionDetail?.defaultLocale || "en");
  const missing = !versionDetail;

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-5">
      <Link className="font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>← {t("mods.detail.back")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black">{localization?.name || detail.canonicalId}</h1><code className="mt-1 block text-sm text-[var(--muted)]">{detail.canonicalId}</code></div><Link className="button-secondary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/data/edit#mod-content-workspace`}>{t("common.edit")}</Link></div>
      <div className="mt-4 flex gap-1 overflow-x-auto">{detail.versions.map((version, index) => {
        const href = version.detailUrl || `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(version.publicId)}`;
        return <Link className={`focus-ring shrink-0 rounded px-2 py-1 text-xs font-black ${index === currentIndex ? "bg-[var(--accent)] text-white" : version.hasDetail ? "bg-[var(--panel-subtle)]" : "border border-[var(--red)] text-[var(--red)]"}`} href={href} key={version.publicId}>{version.label}</Link>;
      })}</div>
    </header>
    {missing ? <section className="mt-8 rounded-lg border border-dashed border-[var(--red)] bg-[var(--panel)] p-8 text-center"><h2 className="text-xl font-black">{current?.label}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t("modContent.versionContentMissing")}</p></section> : <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div><p className="text-sm font-bold text-[var(--muted)]">{current?.label}</p>{localization?.summary ? <p className="mt-4 leading-7 text-[var(--muted)]">{localization.summary}</p> : null}{localization?.contentMarkdown ? <div className="markdown-preview mt-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.contentMarkdown} /></div> : <p className="mt-5 text-[var(--muted)]">{t("mods.exportImport.entry.noIntroduction")}</p>}</div>
      <aside><dl className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm"><dt className="font-bold text-[var(--muted)]">{t("resourceEditor.kind")}</dt><dd>{detail.kindCode}</dd><dt className="font-bold text-[var(--muted)]">ID</dt><dd className="break-all font-mono">{detail.canonicalId}</dd></dl><details className="mt-4"><summary className="cursor-pointer font-bold">{t("globalCatalog.technicalInfo")}</summary><pre className="mt-2 max-h-80 overflow-auto rounded bg-[var(--panel-subtle)] p-3 text-xs">{JSON.stringify(versionDetail.definition, null, 2)}</pre></details></aside>
    </div>}
  </article></main>;
}

function resolveVersionLocalization(values: ModContentLocalization[], locale: string, defaultLocale: string) {
  for (const candidate of contentLanguageCandidates(locale, "", defaultLocale)) {
    const normalized = normalizeContentLanguage(candidate).toLowerCase();
    const match = values.find((item) => normalizeContentLanguage(item.locale).toLowerCase() === normalized);
    if (match) return match;
  }
  return values[0];
}
