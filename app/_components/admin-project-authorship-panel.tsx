"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { mergeProjectAuthorshipPage, projectAuthorshipPagePath } from "../_lib/project-authorship-pagination.mts";

type RelationStatus = "pending" | "approved" | "rejected" | "revoked";
type ProjectAuthorshipRelation = {
  id: string;
  projectType: string;
  projectId: string;
  creatorId: string;
  creatorKind: "author" | "team";
  creatorName: string;
  roleName: string;
  permissionGranting: boolean;
  status: RelationStatus;
  createdAt: string;
};

const statuses: RelationStatus[] = ["pending", "approved", "rejected", "revoked"];
const pageSize = 50;

export function AdminProjectAuthorshipPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<RelationStatus>("pending");
  const [items, setItems] = useState<ProjectAuthorshipRelation[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor = "") => {
    const append = Boolean(cursor);
    const generation = ++requestGeneration.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setItems([]);
      setNextCursor("");
    }
    try {
      const result = await apiRequest<{ items: ProjectAuthorshipRelation[]; hasMore: boolean; nextCursor: string }>(
        projectAuthorshipPagePath(status, pageSize, cursor),
        { signal: controller.signal },
        token,
      );
      if (generation !== requestGeneration.current) return;
      setItems((current) => append ? mergeProjectAuthorshipPage(current, result.items) : result.items);
      setNextCursor(result.hasMore ? result.nextCursor : "");
      setMessage("");
    } catch (error) {
      if (generation !== requestGeneration.current || (error as { name?: string }).name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : t("admin.projectAuthorship.loadFailed"));
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [status, t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestGeneration.current += 1;
      requestController.current?.abort();
    };
  }, [load]);

  async function review(item: ProjectAuthorshipRelation, nextStatus: "approved" | "rejected" | "revoked") {
    try {
      await apiRequest(`/api/v1/admin/project-authorship-relations/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, note: notes[item.id] ?? "" }),
      }, token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.projectAuthorship.reviewFailed"));
    }
  }

  return <section>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-black">{t("admin.projectAuthorship.title")}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.projectAuthorship.description")}</p></div>
      <button className="button-secondary focus-ring" type="button" onClick={() => void load()}>{t("common.refresh")}</button>
    </div>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t("admin.projectAuthorship.statusFilter")}>
      {statuses.map((value) => <button key={value} className={value === status ? "button-primary focus-ring" : "button-secondary focus-ring"} type="button" onClick={() => setStatus(value)}>{t(`admin.projectAuthorship.statuses.${value}`)}</button>)}
    </div>
    {message ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <div className="mt-5 grid gap-4">
      {items.map((item) => <article className="surface p-5" key={item.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[var(--accent)]">{t(`creators.kinds.${item.creatorKind}`)}</span>{item.permissionGranting ? <span className="rounded-full border border-[var(--warning)] px-2.5 py-1 text-[var(--warning)]">{t("admin.projectAuthorship.grantsAccess")}</span> : <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[var(--muted)]">{t("admin.projectAuthorship.attributionOnly")}</span>}</div>
            <h3 className="mt-2 text-lg font-black"><Link className="hover:text-[var(--accent)]" href={`${item.creatorKind === "team" ? "/teams" : "/authors"}/${item.creatorId}`}>{item.creatorName}</Link> · {item.roleName}</h3>
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.projectType}: {item.projectId}</p>
          </div>
          <time className="text-sm text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
        </div>
        {(status === "pending" || status === "approved") ? <>
          <textarea className="field mt-4 min-h-20 resize-y" value={notes[item.id] ?? ""} placeholder={t("admin.projectAuthorship.notePlaceholder")} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
          <div className="mt-3 flex justify-end gap-2">
            {status === "pending" ? <><button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => void review(item, "rejected")}>{t("admin.reviews.reject")}</button><button className="button-primary focus-ring" type="button" onClick={() => void review(item, "approved")}>{t("admin.reviews.approve")}</button></> : <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => void review(item, "revoked")}>{t("admin.projectAuthorship.revoke")}</button>}
          </div>
        </> : null}
      </article>)}
      {loading ? <div className="surface grid min-h-48 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("common.loading")}</div> : null}
      {!loading && !items.length ? <div className="surface grid min-h-48 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("admin.projectAuthorship.empty")}</div> : null}
    </div>
    {nextCursor ? <button className="button-secondary focus-ring mt-5 w-full" disabled={loadingMore} type="button" onClick={() => void load(nextCursor)}>{loadingMore ? t("common.loading") : t("admin.projectAuthorship.loadMore")}</button> : null}
  </section>;
}
