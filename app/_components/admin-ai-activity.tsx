"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { ApiError, apiErrorMessage } from "../_lib/api-error.mts";
import { resolveAIDeliveryFailure } from "../_lib/ai-delivery-retry.mts";
import { aiTranslationTaskTypes } from "../_lib/admin-ai-tasks";
import { useI18n } from "../_lib/i18n-provider";
import { EmptyState, InlineMessage, cleanError, displayCell, type LogRow } from "./admin-console-shared";

type AIRequestBudgetRow = {
  provider: string;
  model: string;
  state: "reserved" | "settled" | "usage_unknown";
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  reserved_tokens: number;
  reserved_cost_micros: number;
};

export function AICostsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<Record<string, unknown>>("/api/v1/admin/ai/stats", {}, token)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((error) => { if (!cancelled) setMessage(cleanError(error)); });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const byStatus = Array.isArray(stats?.byStatus) ? stats.byStatus as LogRow[] : [];
  const byProvider = Array.isArray(stats?.byProvider) ? stats.byProvider as LogRow[] : [];
  const requestBudget = Array.isArray(stats?.requestBudget) ? stats.requestBudget as AIRequestBudgetRow[] : undefined;
  const tokenFormat = new Intl.NumberFormat(locale);
  const costFormat = new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", minimumFractionDigits: 6, maximumFractionDigits: 6 });

  return (
    <div className="grid gap-4">
      <section className="surface rounded-lg p-4">
        <h2 className="text-xl font-bold">{t("admin.ai.costs")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.ai.costsDesc")}</p>
        {message ? <InlineMessage text={message} /> : null}
      </section>
      <AIStatsTable title={t("admin.ai.byStatus")} rows={byStatus} />
      <AIStatsTable title={t("admin.ai.byProvider")} rows={byProvider} />
      <section className="surface rounded-lg p-4">
        <h3 className="font-bold">{t("admin.ai.requestBudgetTitle")}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("admin.ai.requestBudgetDesc")}</p>
        {stats && !requestBudget ? <InlineMessage text={t("admin.ai.budgetUnavailable")} /> : null}
        {requestBudget ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead><tr>{[t("admin.ai.provider"), t("admin.ai.model"), t("admin.status"), t("admin.ai.requestCount"), t("admin.ai.tokens"), t("admin.ai.cost"), t("admin.ai.reservedTokens"), t("admin.ai.reservedCost")].map((heading) => <th className="border-b border-[var(--line)] px-2 py-2" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{requestBudget.map((row) => <tr key={`${row.provider}/${row.model}/${row.state}`}>
            <td className="border-b border-[var(--line)] px-2 py-2">{row.provider}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{row.model}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{t(`admin.ai.requestStates.${row.state}`)}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{tokenFormat.format(row.requests)}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{row.state === "settled" ? `${tokenFormat.format(row.input_tokens)} / ${tokenFormat.format(row.output_tokens)}` : t("admin.ai.unknownUsage")}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{row.state === "settled" ? costFormat.format(row.cost_micros / 1_000_000) : t("admin.ai.unknownUsage")}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{tokenFormat.format(row.reserved_tokens)}</td>
            <td className="border-b border-[var(--line)] px-2 py-2">{costFormat.format(row.reserved_cost_micros / 1_000_000)}</td>
          </tr>)}</tbody>
        </table>{!requestBudget.length ? <EmptyState text={t("admin.logs.noRecords")} /> : null}</div> : null}
      </section>
    </div>
  );
}

export function AITaskLogsPanel({ token, canEnqueue }: { token: string; canEnqueue: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  const [retryingUID, setRetryingUID] = useState("");
  const [deliveryQueuedUIDs, setDeliveryQueuedUIDs] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const acceptedUIDs = useRef(new Map<string, string>());
  const operationInFlight = useRef(false);
  const loadGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const active = useRef(true);
  const latestFilters = useRef({ query, status });
  useEffect(() => { latestFilters.current = { query, status }; }, [query, status]);
  const invalidateLoad = useCallback(() => { loadGeneration.current++; loadController.current?.abort(); }, []);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; invalidateLoad(); };
  }, [invalidateLoad]);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const params = new URLSearchParams();
    if (latestFilters.current.query) params.set("q", latestFilters.current.query);
    if (latestFilters.current.status) params.set("status", latestFilters.current.status);
    if (active.current) setLoading(true);
    try {
      const data = await apiRequest<LogRow[]>(`/api/v1/admin/ai/tasks?${params.toString()}`, { signal: controller.signal, cache: "no-store" }, token);
      if (active.current && !controller.signal.aborted && generation === loadGeneration.current) setRows(data);
    } catch (error) {
      if (!active.current || controller.signal.aborted || generation !== loadGeneration.current) return;
      throw error;
    } finally {
      if (active.current && generation === loadGeneration.current) setLoading(false);
    }
  }, [token]);

  const reportLoadError = useEffectEvent((error: unknown) => {
    if (active.current) setMessage(apiErrorMessage(error, t, t("common.loadFailed")));
  });
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(reportLoadError); }, 0);
    return () => { window.clearTimeout(timer); invalidateLoad(); };
  }, [invalidateLoad, load, query, status]);

  async function refresh() {
    setMessage("");
    try { await load(); } catch (error) { if (active.current) setMessage(apiErrorMessage(error, t, t("common.loadFailed"))); }
  }

  async function retryDelivery(row: LogRow) {
    const failure = resolveAIDeliveryFailure(row);
    if (!canEnqueue || !failure?.retryable || !failure.deadLetterId || operationInFlight.current || acceptedUIDs.current.get(failure.taskUID) === failure.deadLetterId) return;
    const deadLetterId = failure.deadLetterId;
    operationInFlight.current = true;
    setRetryingUID(failure.taskUID);
    setMessage("");
    try {
      const result = await apiRequest<{ id: string; status: string; deliveryQueued: boolean }>(
        `/api/v1/admin/ai/tasks/${encodeURIComponent(failure.taskUID)}/retry-delivery`, { method: "POST" }, token,
      );
      if (!active.current) return;
      if (result.id !== failure.taskUID || result.status !== "queued" || result.deliveryQueued !== true) throw new Error("Invalid AI delivery retry response");
      acceptedUIDs.current.set(failure.taskUID, deadLetterId);
      setDeliveryQueuedUIDs((current) => new Map(current).set(failure.taskUID, deadLetterId));
      setMessage(t("admin.ai.deliveryRetryQueued"));
      try { await load(); }
      catch { if (active.current) setMessage(t("admin.ai.deliveryRetryRefreshFailed")); }
    } catch (error) {
      if (active.current) setMessage(error instanceof ApiError && error.code === "AI_DELIVERY_RETRY_UNAVAILABLE"
        ? t("admin.ai.deliveryRetryUnavailable") : apiErrorMessage(error, t, t("admin.ai.deliveryRetryFailed")));
    } finally {
      operationInFlight.current = false;
      if (active.current) setRetryingUID("");
    }
  }

  async function createTestTask() {
    if (!canEnqueue || operationInFlight.current) return;
    operationInFlight.current = true;
    setRetryingUID("test-task");
    setMessage("");
    try {
      await apiRequest<{ id: string; taskUid: string; status: string }>(
        "/api/v1/admin/ai/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            taskType: aiTranslationTaskTypes.i18n,
            payload: { sourceLocale: "zh-CN", targetLocale: "en-US", items: [{ key: "test", text: "测试" }] },
          }),
        },
        token,
      );
      await load();
    } catch (error) {
      if (active.current) setMessage(apiErrorMessage(error, t, t("admin.ai.deliveryRetryFailed")));
    } finally {
      operationInFlight.current = false;
      if (active.current) setRetryingUID("");
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("admin.ai.taskLogs")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.ai.taskLogsDesc")}</p>
        </div>
        {canEnqueue ? <button className="button-primary focus-ring" disabled={Boolean(retryingUID)} type="button" onClick={createTestTask}>
          {t("admin.ai.createTestTask")}
        </button> : null}
      </div>
      <fieldset disabled={Boolean(retryingUID)} className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_120px]">
        <input className="field" value={query} placeholder={t("admin.logs.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t("admin.ai.allStatuses")}</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
        </select>
        <button className="button-secondary focus-ring" type="button" disabled={loading} onClick={() => void refresh()}>
          {t("admin.logs.query")}
        </button>
      </fieldset>
      {message ? <p role="status" className="mb-3 text-sm font-semibold">{message}</p> : null}
      <p className="mb-3 text-sm text-[var(--muted)]">{t("admin.ai.deliveryRetryHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr>
              {["ID", t("admin.ai.taskType"), t("admin.ai.provider"), t("admin.ai.model"), t("admin.status"), t("admin.ai.tokens"), t("admin.ai.cost"), t("admin.createdAt"), t("admin.ai.delivery")].map((heading) => (
                <th key={heading} className="border-b border-[var(--line)] py-2">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const failure = resolveAIDeliveryFailure(row);
              const queued = failure && deliveryQueuedUIDs.get(failure.taskUID) === failure.deadLetterId;
              return (
              <tr key={String(row.id)} className="align-top">
                <td className="border-b border-[var(--line)] py-2 font-mono text-xs">{String(row.task_uid ?? row.id)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.task_type)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.provider)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.model)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.status)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.input_tokens)} / {displayCell(row.output_tokens)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.cost_micros)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.created_at)}</td>
                <td className="border-b border-[var(--line)] py-2">
                  {failure ? <div className="grid gap-2"><span>{queued ? t("admin.ai.deliveryRetryQueued") : t("admin.ai.deliveryFailed")}</span>
                    {canEnqueue && failure.retryable && !queued ? <button className="button-secondary focus-ring" type="button" disabled={Boolean(retryingUID)} onClick={() => void retryDelivery(row)}>{retryingUID === failure.taskUID ? t("common.loading") : t("admin.ai.retryDelivery")}</button> : null}
                  </div> : "—"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : null}
    </section>
  );
}

function AIStatsTable({ title, rows }: { title: string; rows: LogRow[] }) {
  const { t } = useI18n();
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section className="surface rounded-lg p-4">
      <h3 className="mb-3 font-bold">{title}</h3>
      {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>{columns.map((column) => <th key={column} className="border-b border-[var(--line)] py-2">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => <td key={column} className="border-b border-[var(--line)] py-2">{displayCell(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
