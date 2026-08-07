"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { loadProjectChangelog, type ChangelogItem, type ChangelogTarget } from "../_lib/project-changelog-api";
import { MarkdownRenderer } from "./markdown-renderer";
import { PageFeedback } from "./page-feedback";

export function ProjectChangelogEntry({ id }: { id: string }) {
  const { ready, token } = useAuthSnapshot();
  const { locale, t } = useI18n();
  const [value, setValue] = useState<{ target: ChangelogTarget; item: ChangelogItem }>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    loadProjectChangelog(id, token).then(setValue).catch((error) => setMessage(error instanceof Error ? error.message : t("changelog.loadFailed")));
  }, [id, ready, t, token]);
  if (!value) return <PageFeedback description={message || undefined} tone={message ? "danger" : "default"} title={message ? t("changelog.loadFailed") : t("common.loading")} />;
  const { item, target } = value;
  const body = item.localizations?.find((entry) => entry.locale === locale)?.bodyMarkdown || item.bodyMarkdown;
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-5xl">
    <header className="border-b border-[var(--line)] pb-5"><Link className="font-bold text-[var(--accent)] hover:underline" href={`${target.url}?tab=changelog`}>← {target.name}</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black">{item.projectVersion}</h1><p className="mt-2 text-sm text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(item.eventAt))}</p></div><div className="flex gap-2">{item.canEdit && !item.pendingChange ? <Link className="button-primary focus-ring" href={`/changelogs/${item.id}/edit`}>{t("common.edit")}</Link> : null}<Link className="button-secondary focus-ring" href={`/changelogs/${item.id}/history`}>{t("mods.detail.history")}</Link></div></div><div className="mt-4 flex flex-wrap gap-2">{item.category ? <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-black text-[var(--accent)]">{item.category.name}</span> : null}{item.minecraftVersions.map((version) => <span className="rounded-full border border-[var(--line)] px-3 py-1 text-sm font-bold" key={version}>{version}</span>)}</div></header>
    {item.pendingChange ? <p className="mt-5 rounded-lg border border-[var(--warning)] p-3 font-bold text-[var(--warning)]">{t("changelog.pendingChange")}</p> : null}
    <section className="markdown-preview mt-6"><MarkdownRenderer config={defaultMarkdownConfig} emptyText={t("changelog.emptyBody")} markdown={body} /></section>
    <p className="mt-8 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">{t("changelog.submittedBy")} <Link className="font-bold text-[var(--accent)] hover:underline" href={`/user/${item.createdById}`}>{item.createdByName}</Link></p>
  </article></main>;
}
