"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteUserDraft, draftResumeURL, loadUserDrafts, type UserDraftSummary } from "../_lib/draft-api";
import { useI18n } from "../_lib/i18n-provider";

type DraftProject = {
  key: string;
  title: string;
  kind: string;
  latestAt: number;
  drafts: UserDraftSummary[];
};

export function UserDraftsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<UserDraftSummary[]>([]);
  const [retentionSeconds, setRetentionSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const projects = useMemo(() => groupDraftsByProject(items), [items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await loadUserDrafts(token);
      setItems(result.items);
      setRetentionSeconds(result.retentionSeconds);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("drafts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [refresh]);

  async function removeDraft(draft: UserDraftSummary) {
    if (!window.confirm(t("drafts.deleteConfirm", { title: draft.title || t("drafts.untitled") }))) return;
    try {
      await deleteUserDraft(draft.id, token);
      setItems((current) => current.filter((item) => item.id !== draft.id));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("drafts.deleteFailed"));
    }
  }

  return <section className="surface rounded-lg p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-black">{t("drafts.title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("drafts.description")}</p>
        {retentionSeconds > 0 ? <p className="mt-1 text-xs font-bold text-[var(--muted)]">{t("drafts.retentionSeconds", { count: retentionSeconds })}</p> : null}
      </div>
      <button className="button-secondary focus-ring" disabled={loading} type="button" onClick={() => void refresh()}>{t("user.refresh")}</button>
    </div>
    {message ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
    {loading ? <p className="py-14 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : projects.length ? (
      <div className="mt-5 space-y-4">
        {projects.map((project) => <article className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]" key={project.key}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3">
            <div className="min-w-0">
              <span className="text-xs font-black text-[var(--accent)]">{t(`drafts.kinds.${project.kind}`)}</span>
              <h3 className="truncate text-lg font-black">{project.title}</h3>
            </div>
            <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
              {t("drafts.draftCount", { count: project.drafts.length })}
            </span>
          </header>
          <ol className="divide-y divide-[var(--line)]">
            {project.drafts.map((draft) => <li className="relative grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={draft.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DraftStatusBadge status={draft.status} />
                  <h4 className="truncate font-black">{draft.title || t("drafts.untitled")}</h4>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {t("drafts.statusTime", { time: new Date(draft.statusAt).toLocaleString(locale) })}
                  <span aria-hidden="true"> · </span>
                  {t("drafts.expiresAt")} {new Date(draft.expiresAt).toLocaleString(locale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {draft.status === "draft" ? (
                  <Link className="button-primary focus-ring" href={draftResumeURL(draft)}>{t("drafts.continueEditing")}</Link>
                ) : draft.targetUrl ? (
                  <Link className="button-secondary focus-ring" href={draft.targetUrl}>{t("drafts.viewProject")}</Link>
                ) : null}
                <button className="focus-ring rounded-md px-3 py-2 text-sm font-bold text-[var(--red)]" type="button" onClick={() => void removeDraft(draft)}>{t("common.delete")}</button>
              </div>
            </li>)}
          </ol>
        </article>)}
      </div>
    ) : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] py-14 text-center text-sm font-bold text-[var(--muted)]">{t("drafts.empty")}</p>}
  </section>;

  function DraftStatusBadge({ status }: { status: UserDraftSummary["status"] }) {
    const className = status === "approved"
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : status === "reviewing"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-[var(--line)] bg-[var(--background)] text-[var(--muted)]";
    return <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${className}`}>{t(`drafts.states.${status}`)}</span>;
  }
}

function groupDraftsByProject(items: UserDraftSummary[]): DraftProject[] {
  const projects = new Map<string, DraftProject>();
  for (const draft of items) {
    const statusTime = Date.parse(draft.statusAt || draft.updatedAt) || 0;
    const existing = projects.get(draft.projectKey);
    if (existing) {
      existing.drafts.push(draft);
      if (statusTime > existing.latestAt) {
        existing.latestAt = statusTime;
        existing.title = draft.projectTitle || draft.title || existing.title;
        existing.kind = draft.kind;
      }
      continue;
    }
    projects.set(draft.projectKey, {
      key: draft.projectKey,
      title: draft.projectTitle || draft.title,
      kind: draft.kind,
      latestAt: statusTime,
      drafts: [draft],
    });
  }
  return [...projects.values()]
    .map((project) => ({ ...project, drafts: project.drafts.sort((left, right) => Date.parse(right.statusAt) - Date.parse(left.statusAt)) }))
    .sort((left, right) => right.latestAt - left.latestAt);
}
