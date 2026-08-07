"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { loadProjectChangelogs, type ChangelogCollection, type ChangelogTargetType } from "../_lib/project-changelog-api";
import { MarkdownRenderer } from "./markdown-renderer";
import { PageFeedback } from "./page-feedback";

type ChangelogGroup = { id: string; label: string; kind: "category" | "minecraft" };

export function ProjectChangelog({ targetId, targetType }: { targetId: string; targetType: ChangelogTargetType }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [collection, setCollection] = useState<ChangelogCollection>();
  const [activeGroup, setActiveGroup] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready || !targetId) return;
    const controller = new AbortController();
    loadProjectChangelogs(targetType, targetId, locale, token, controller.signal)
      .then((value) => { setCollection(value); setMessage(""); })
      .catch((error) => setMessage(error instanceof Error ? error.message : t("changelog.loadFailed")));
    return () => controller.abort();
  }, [locale, ready, t, targetId, targetType, token]);

  const groups = useMemo(() => buildGroups(collection), [collection]);
  const visibleItems = useMemo(() => {
    if (!collection || !activeGroup) return collection?.items ?? [];
    if (activeGroup.startsWith("tag:")) return collection.items.filter((item) => item.category?.id === activeGroup.slice(4));
    return collection.items.filter((item) => !item.category && item.minecraftVersions.includes(activeGroup.slice(3)));
  }, [activeGroup, collection]);

  if (!collection && !message) return <PageFeedback title={t("common.loading")} />;
  if (!collection) return <PageFeedback description={message} tone="danger" title={t("changelog.loadFailed")} />;

  return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-black">{t("changelog.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("changelog.description")}</p></div>
      {collection.target.canEdit ? <Link className="button-primary focus-ring" href={`/changelogs/new?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`}>{t("changelog.create")}</Link> : null}
    </header>
    {message ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    {groups.length ? <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label={t("changelog.groups")}>
      <GroupButton active={!activeGroup} label={t("common.all")} onClick={() => setActiveGroup("")} />
      {groups.map((group) => <GroupButton active={activeGroup === group.id} key={group.id} label={group.label} onClick={() => setActiveGroup(group.id)} />)}
    </nav> : null}
    {visibleItems.length ? <div className="relative mt-6 grid gap-0 before:absolute before:bottom-4 before:left-[6.25rem] before:top-4 before:w-px before:bg-[var(--line)] sm:before:left-[8.5rem]">
      {visibleItems.map((item) => <article className="relative grid grid-cols-[5.25rem_minmax(0,1fr)] gap-5 py-5 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]" key={item.id}>
        <time className="pt-1 text-sm font-bold text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.eventAt))}</time>
        <span className="absolute left-[5.93rem] top-7 h-3 w-3 rounded-full border-2 border-[var(--panel)] bg-[var(--accent)] sm:left-[8.18rem]" />
        <div className="min-w-0 pl-1 sm:pl-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black"><Link className="hover:text-[var(--accent)] hover:underline" href={`/changelogs/${item.id}`}>{item.projectVersion}</Link></h3>{item.category ? <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--accent)]">{item.category.name}</span> : null}{item.minecraftVersions.map((version) => <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold" key={version}>{version}</span>)}</div>
            <div className="flex flex-wrap gap-2">{item.canEdit && !item.pendingChange ? <Link className="button-secondary focus-ring px-3 py-2 text-sm" href={`/changelogs/${item.id}/edit`}>{t("common.edit")}</Link> : null}<Link className="button-secondary focus-ring px-3 py-2 text-sm" href={`/changelogs/${item.id}/history`}>{t("mods.detail.history")}</Link></div>
          </div>
          {item.pendingChange ? <p className="mt-2 text-sm font-bold text-[var(--warning)]">{t("changelog.pendingChange")}</p> : null}
          <div className="markdown-preview mt-4 min-w-0"><MarkdownRenderer config={defaultMarkdownConfig} emptyText={t("changelog.emptyBody")} markdown={item.bodyMarkdown} /></div>
          <p className="mt-4 text-xs text-[var(--muted)]">{t("changelog.submittedBy")} <Link className="font-bold text-[var(--accent)] hover:underline" href={`/user/${item.createdById}`}>{item.createdByName}</Link></p>
        </div>
      </article>)}
    </div> : <div className="mt-6 grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--line)] text-center font-bold text-[var(--muted)]">{t("changelog.empty")}</div>}
  </section>;
}

function buildGroups(collection?: ChangelogCollection): ChangelogGroup[] {
  if (!collection) return [];
  const groups: ChangelogGroup[] = collection.categories.map((category) => ({ id: `tag:${category.id}`, label: category.name, kind: "category" }));
  const versions = new Set<string>();
  collection.items.forEach((item) => { if (!item.category) item.minecraftVersions.forEach((version) => versions.add(version)); });
  [...versions].sort(compareMinecraftVersions).forEach((version) => groups.push({ id: `mc:${version}`, label: version, kind: "minecraft" }));
  return groups;
}

function compareMinecraftVersions(left: string, right: string) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (rightParts[index] || 0) - (leftParts[index] || 0);
    if (difference) return difference;
  }
  return right.localeCompare(left);
}

function GroupButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`focus-ring shrink-0 rounded-full border px-4 py-2 text-sm font-black ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} type="button" onClick={onClick}>{label}</button>;
}
