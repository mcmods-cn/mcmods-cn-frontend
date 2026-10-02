"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type DeadLetterStatus = "unresolved" | "replayed" | "all";

type DeadLetterItem = {
  id: number;
  eventId: string;
  eventType: string;
  subject: string;
  failureStage: string;
  aggregateType: string;
  aggregateId: string;
  attempts: number;
  lastError: string;
  failedAt: string;
  replayedAt: string | null;
  status: "unresolved" | "replayed";
};

type DeadLetterPage = {
  items: DeadLetterItem[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

type DeadLetterFilters = {
  status: DeadLetterStatus;
  aggregateType: string;
  aggregateId: string;
};

const initialFilters: DeadLetterFilters = { status: "unresolved", aggregateType: "", aggregateId: "" };

export function AdminDeadLetterPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [page, setPage] = useState<DeadLetterPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [replayingID, setReplayingID] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const cursor = cursorHistory[cursorHistory.length - 1] ?? "";

  const path = useMemo(() => {
    const parameters = new URLSearchParams();
    parameters.set("status", filters.status);
    parameters.set("limit", "50");
    if (filters.aggregateType) parameters.set("aggregateType", filters.aggregateType);
    if (filters.aggregateId) parameters.set("aggregateId", filters.aggregateId);
    if (cursor) parameters.set("cursor", cursor);
    return `/api/v1/admin/infrastructure/dead-letters?${parameters.toString()}`;
  }, [cursor, filters]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DeadLetterPage>(path, { signal: controller.signal }, token)
      .then((value) => { if (!controller.signal.aborted) { setPage(value); setError(""); } })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(deadLetterError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, reloadKey, token]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const aggregateType = draft.aggregateType.trim();
    const aggregateId = draft.aggregateId.trim();
    if (aggregateId && !aggregateType) {
      setError(t("admin.nats.deadLettersAggregateTypeRequired"));
      return;
    }
    setLoading(true);
    setError("");
    setFilters({ status: draft.status, aggregateType, aggregateId });
    setCursorHistory([""]);
  }

  async function replay(item: DeadLetterItem) {
    if (!window.confirm(t("admin.nats.deadLettersReplayConfirm", { eventId: item.eventId }))) return;
    setReplayingID(item.id);
    setError("");
    try {
      await apiRequest(`/api/v1/admin/infrastructure/dead-letters/${item.id}/replay`, { method: "POST" }, token);
      setLoading(true);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(deadLetterError(cause));
    } finally {
      setReplayingID(null);
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div>
        <h3 className="font-bold">{t("admin.nats.deadLetters")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.nats.deadLettersDescription")}</p>
      </div>
      <form className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_1fr_auto]" onSubmit={applyFilters}>
        <label className="text-sm font-semibold">
          {t("admin.nats.deadLettersStatus")}
          <select className="field mt-2" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as DeadLetterStatus })}>
            <option value="unresolved">{t("admin.nats.deadLettersUnresolved")}</option>
            <option value="replayed">{t("admin.nats.deadLettersReplayed")}</option>
            <option value="all">{t("admin.nats.deadLettersAll")}</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("admin.nats.deadLettersAggregateType")}
          <input className="field mt-2" maxLength={100} value={draft.aggregateType} onChange={(event) => setDraft({ ...draft, aggregateType: event.target.value })} />
        </label>
        <label className="text-sm font-semibold">
          {t("admin.nats.deadLettersAggregateId")}
          <input className="field mt-2" maxLength={200} value={draft.aggregateId} onChange={(event) => setDraft({ ...draft, aggregateId: event.target.value })} />
        </label>
        <button className="button-secondary focus-ring self-end" type="submit">{t("common.search")}</button>
      </form>
      {error ? <p className="mt-3 rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-4 grid gap-3">
        {page?.items.map((item) => (
          <article className="rounded-lg border border-[var(--line)] p-3" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-semibold">{item.eventType} / {item.eventId}</p>
                <p className="mt-1 break-all text-xs text-[var(--muted)]">
                  {item.failureStage} · {item.subject} · {item.aggregateType || "—"}/{item.aggregateId || "—"} · {new Date(item.failedAt).toLocaleString(locale)}
                </p>
              </div>
              {item.status === "unresolved" ? (
                <button className="button-secondary focus-ring" disabled={replayingID === item.id} type="button" onClick={() => void replay(item)}>
                  {replayingID === item.id ? t("admin.nats.deadLettersReplaying") : t("admin.nats.deadLettersReplay")}
                </button>
              ) : <span className="text-xs text-[var(--muted)]">{t("admin.nats.deadLettersReplayed")}</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--danger)]">{item.lastError}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{t("admin.nats.deadLettersAttempts", { count: item.attempts })}</p>
          </article>
        ))}
        {!loading && page?.items.length === 0 ? <p className="text-sm text-[var(--muted)]">{t("admin.nats.deadLettersEmpty")}</p> : null}
        {loading ? <p className="text-sm text-[var(--muted)]">{t("common.loading")}</p> : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button className="button-secondary focus-ring" disabled={loading || cursorHistory.length === 1} type="button" onClick={() => { setLoading(true); setCursorHistory((values) => values.slice(0, -1)); }}>
          {t("common.previous")}
        </button>
        <span className="text-xs text-[var(--muted)]">{t("admin.nats.deadLettersPage", { page: cursorHistory.length })}</span>
        <button className="button-secondary focus-ring" disabled={loading || !page?.hasMore || !page.nextCursor} type="button" onClick={() => { if (page?.nextCursor) { setLoading(true); setCursorHistory((values) => [...values, page.nextCursor]); } }}>
          {t("common.next")}
        </button>
      </div>
    </section>
  );
}

function deadLetterError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
