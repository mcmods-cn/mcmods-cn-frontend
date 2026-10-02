"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { isCurrentReportDetailResponse } from "../_lib/governance-request-order";
import { useI18n } from "../_lib/i18n-provider";
import {
  AdminSplit,
  BanReasonSelect,
  Empty,
  type GovernancePage,
  errorMessage,
  useBanReasons,
} from "./admin-governance-shared";

type ReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  status: string;
  reporterName: string;
  createdAt: string;
};
type ReportDetail = ReportRow & {
  detail: string;
  customReason: string;
  reporterId: string;
  targetActorId?: string;
  targetActorName?: string;
  targetActorRole?: "submitter" | "author" | "owner" | "subject";
  claimedById?: string;
  claimedByName?: string;
  claimedByCurrentUser: boolean;
  canTakeover: boolean;
  snapshot?: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  relatedReports: Array<Record<string, unknown>>;
};

export function UnifiedReportAdminPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const banReasons = useBanReasons(token, locale);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState<GovernancePage<ReportRow>>({
    items: [],
    limit: 50,
    hasMore: false,
    nextCursor: "",
  });
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [detail, setDetail] = useState<ReportDetail>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const detailLoadController = useRef<AbortController | null>(null);
  const detailLoadGeneration = useRef(0);
  const selectedReportId = useRef("");
  const load = useCallback(
    async (targetCursor = cursor, signal?: AbortSignal) => {
      const pageCursor = targetCursor
        ? `&cursor=${encodeURIComponent(targetCursor)}`
        : "";
      try {
        const value = await apiRequest<GovernancePage<ReportRow>>(
          `/api/v1/admin/reports?status=${encodeURIComponent(status)}&limit=50${pageCursor}`,
          { signal },
          token,
        );
        setPage(value);
        setMessage("");
      } catch (error) {
        if (!signal?.aborted) setMessage(errorMessage(error));
      }
    },
    [cursor, status, token],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(cursor, controller.signal));
    return () => controller.abort();
  }, [cursor, load]);
  useEffect(() => () => detailLoadController.current?.abort(), []);
  function clearReportSelection() {
    selectedReportId.current = "";
    detailLoadGeneration.current += 1;
    detailLoadController.current?.abort();
    detailLoadController.current = null;
    setDetail(undefined);
  }
  function previousPage() {
    const history = cursorHistory.slice();
    const previousCursor = history.pop() || "";
    setCursorHistory(history);
    setCursor(previousCursor);
    clearReportSelection();
  }
  function nextPage() {
    if (!page.nextCursor) return;
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(page.nextCursor);
    clearReportSelection();
  }
  async function select(id: string) {
    selectedReportId.current = id;
    detailLoadController.current?.abort();
    const controller = new AbortController();
    const requestGeneration = ++detailLoadGeneration.current;
    detailLoadController.current = controller;
    setDetail(undefined);
    try {
      const value = await apiRequest<ReportDetail>(
        `/api/v1/admin/reports/${id}`,
        { signal: controller.signal },
        token,
      );
      if (
        !isCurrentReportDetailResponse({
          aborted: controller.signal.aborted,
          currentGeneration: detailLoadGeneration.current,
          desiredReportId: selectedReportId.current,
          requestGeneration,
          requestedReportId: id,
          responseReportId: value.id,
        })
      )
        return;
      setDetail(value);
      setMessage("");
    } catch (error) {
      if (
        !controller.signal.aborted &&
        requestGeneration === detailLoadGeneration.current &&
        selectedReportId.current === id
      )
        setMessage(errorMessage(error));
    }
  }
  async function claim() {
    if (!detail) return;
    const reportId = detail.id;
    setBusy(true);
    try {
      await apiRequest(
        `/api/v1/admin/reports/${reportId}/claim`,
        { method: "POST", body: "{}" },
        token,
      );
      if (selectedReportId.current !== reportId) return;
      await select(reportId);
      if (selectedReportId.current === reportId) await load();
    } catch (error) {
      if (selectedReportId.current === reportId)
        setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function takeover() {
    if (!detail) return;
    const reportId = detail.id;
    const reason = window.prompt(t("admin.governance.takeoverReason"));
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await apiRequest(
        `/api/v1/admin/reports/${reportId}/takeover`,
        { method: "POST", body: JSON.stringify({ reason }) },
        token,
      );
      if (selectedReportId.current !== reportId) return;
      await select(reportId);
      if (selectedReportId.current === reportId) await load();
    } catch (error) {
      if (selectedReportId.current === reportId)
        setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const reportId = detail.id;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiRequest(
        `/api/v1/admin/reports/${reportId}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            conclusion: form.get("conclusion"),
            note: form.get("note"),
            deleteTarget: form.get("deleteTarget") === "on",
            banUserId: String(form.get("banUserId") || ""),
            banReasonCode: String(form.get("banReasonCode") || ""),
            banCustomReason: String(form.get("banCustomReason") || ""),
            publicRecordMarkdown: String(
              form.get("publicRecordMarkdown") || "",
            ),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
        token,
      );
      if (selectedReportId.current !== reportId) return;
      clearReportSelection();
      await load();
    } catch (error) {
      if (selectedReportId.current === reportId)
        setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function openEvidence(id: unknown) {
    try {
      const value = await apiRequest<{ url: string }>(
        `/api/v1/reports/evidence/${String(id)}/access`,
        { method: "POST", body: "{}" },
        token,
      );
      window.open(value.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <AdminSplit
      title={t("admin.governance.reports")}
      message={message}
      left={
        <>
          <select
            className="field mb-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setCursor("");
              setCursorHistory([]);
              clearReportSelection();
            }}
          >
            {["pending", "in_review", "resolved_valid", "resolved_invalid"].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
          <div className="grid gap-2">
            {page.items.map((item) => (
              <button
                className="rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--accent)]"
                key={item.id}
                type="button"
                onClick={() => void select(item.id)}
              >
                <strong className="block">
                  {item.targetType} · {item.reasonCode}
                </strong>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {item.reporterName} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between">
            <button
              className="button-secondary focus-ring"
              disabled={cursorHistory.length === 0}
              type="button"
              onClick={previousPage}
            >
              {t("common.previous")}
            </button>
            <button
              className="button-secondary focus-ring"
              disabled={!page.hasMore || !page.nextCursor}
              type="button"
              onClick={nextPage}
            >
              {t("common.next")}
            </button>
          </div>
        </>
      }
      right={
        !detail ? (
          <Empty text={t("admin.governance.selectReport")} />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-black uppercase text-[var(--accent)]">
                {detail.status}
              </p>
              <h3 className="mt-1 text-xl font-black">
                {detail.targetType} · {detail.targetId}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {detail.reasonCode}
                {detail.customReason ? ` · ${detail.customReason}` : ""}
              </p>
              {detail.targetActorRole ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {t("admin.governance.targetActor")}:{" "}
                  {t(
                    `admin.governance.targetActorRoles.${detail.targetActorRole}`,
                  )}
                  {detail.targetActorName ? ` · ${detail.targetActorName}` : ""}
                </p>
              ) : null}
              {detail.claimedByName ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {t("admin.governance.claimedBy")}: {detail.claimedByName}
                </p>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap">{detail.detail}</p>
            </div>
            <section>
              <h4 className="font-black">
                {t("admin.governance.reportSnapshot")}
              </h4>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-[var(--panel-subtle)] p-3 text-xs">
                {detail.snapshot
                  ? JSON.stringify(detail.snapshot, null, 2)
                  : t("admin.governance.snapshotRestricted")}
              </pre>
            </section>
            <section>
              <h4 className="font-black">{t("admin.governance.evidence")}</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.evidence?.map((item) => (
                  <button
                    className="button-secondary focus-ring"
                    key={String(item.public_id)}
                    disabled={item.status === "deleted"}
                    type="button"
                    onClick={() => void openEvidence(item.public_id)}
                  >
                    {String(item.original_name)} · {String(item.scan_status)}
                  </button>
                ))}
              </div>
            </section>
            {detail.status === "pending" ? (
              <button
                className="button-secondary focus-ring"
                disabled={busy}
                type="button"
                onClick={() => void claim()}
              >
                {t("admin.governance.claim")}
              </button>
            ) : null}
            {detail.status === "in_review" &&
            !detail.claimedByCurrentUser &&
            detail.canTakeover ? (
              <button
                className="button-secondary focus-ring"
                disabled={busy}
                type="button"
                onClick={() => void takeover()}
              >
                {t("admin.governance.takeover")}
              </button>
            ) : null}
            {detail.status === "in_review" && detail.claimedByCurrentUser ? (
              <form
                className="grid gap-3 rounded-xl border border-[var(--line)] p-4"
                onSubmit={resolve}
              >
                <select className="field" name="conclusion">
                  <option value="valid">{t("admin.governance.valid")}</option>
                  <option value="invalid">
                    {t("admin.governance.invalid")}
                  </option>
                </select>
                <textarea
                  className="field min-h-24"
                  name="note"
                  placeholder={t("admin.governance.reviewNote")}
                />
                <label className="flex gap-2 font-bold">
                  <input name="deleteTarget" type="checkbox" />
                  {t("admin.governance.deleteTarget")}
                </label>
                <input
                  className="field"
                  disabled={banReasons.loading || Boolean(banReasons.error)}
                  name="banUserId"
                  placeholder={t("admin.governance.banUserId")}
                />
                <BanReasonSelect
                  error={banReasons.error}
                  items={banReasons.items}
                  loading={banReasons.loading}
                  loadingText={t("admin.governance.banReasonsLoading")}
                  errorText={t("admin.governance.banReasonsLoadFailed")}
                  name="banReasonCode"
                  required={false}
                  retryText={t("common.retry")}
                  onRetry={banReasons.reload}
                />
                <input
                  className="field"
                  disabled={banReasons.loading || Boolean(banReasons.error)}
                  name="banCustomReason"
                  placeholder={t("admin.governance.customReason")}
                />
                <textarea
                  className="field min-h-24"
                  name="publicRecordMarkdown"
                  placeholder={t("admin.governance.publicRecord")}
                />
                <button
                  className="button-primary focus-ring"
                  disabled={busy}
                  type="submit"
                >
                  {t("admin.governance.resolve")}
                </button>
              </form>
            ) : null}
          </div>
        )
      }
    />
  );
}
