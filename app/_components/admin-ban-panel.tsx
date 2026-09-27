"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { datetimeLocalToRFC3339 } from "../_lib/ban-end-time";
import {
  normalizeBlackroomStatus,
  type BlackroomStatus,
} from "../_lib/blackroom-status";
import { useI18n } from "../_lib/i18n-provider";
import {
  BanReasonSelect,
  type GovernancePage,
  Notice,
  PanelHeader,
  errorMessage,
  useBanReasons,
} from "./admin-governance-shared";

type BanRow = {
  id: string;
  userId: string;
  username: string;
  reasonCode: string;
  customReason: string;
  status: BlackroomStatus;
  startsAt: string;
  endsAt?: string;
  publicRecordMarkdown: string;
  internalNote: string;
  moderatorId: string;
  moderatorName: string;
  revokedAt?: string;
  revokedById: string;
  revokedByName: string;
  revokeReason: string;
};

type BanWireRow = Omit<BanRow, "status"> & { status: unknown };

export function BanAdminPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [page, setPage] = useState<GovernancePage<BanRow>>({
    items: [],
    limit: 30,
    hasMore: false,
    nextCursor: "",
  });
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const banReasons = useBanReasons(token, locale);
  const load = useCallback(
    (targetCursor = cursor, signal?: AbortSignal) => {
      const pageCursor = targetCursor
        ? `&cursor=${encodeURIComponent(targetCursor)}`
        : "";
      return apiRequest<GovernancePage<BanWireRow>>(
        `/api/v1/admin/bans?limit=30${pageCursor}`,
        { signal },
        token,
      )
        .then((value) =>
          setPage({
            ...value,
            items: value.items.map((item) => ({
              ...item,
              status: normalizeBlackroomStatus(item.status),
            })),
          }),
        )
        .catch((error) => {
          if (!signal?.aborted) setMessage(errorMessage(error));
        });
    },
    [cursor, token],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(cursor, controller.signal));
    return () => controller.abort();
  }, [cursor, load]);
  function previousPage() {
    const history = cursorHistory.slice();
    const previousCursor = history.pop() || "";
    setCursorHistory(history);
    setCursor(previousCursor);
  }
  function nextPage() {
    if (!page.nextCursor) return;
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(page.nextCursor);
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let endsAt: string | null;
    try {
      endsAt = datetimeLocalToRFC3339(String(form.get("endsAt") || ""));
    } catch {
      setMessage(t("admin.governance.invalidBanEnd"));
      return;
    }
    try {
      await apiRequest(
        "/api/v1/admin/bans",
        {
          method: "POST",
          body: JSON.stringify({
            userId: form.get("userId"),
            reasonCode: form.get("reasonCode"),
            customReason: form.get("customReason"),
            publicRecordMarkdown: form.get("publicRecordMarkdown"),
            internalNote: form.get("internalNote"),
            endsAt,
          }),
        },
        token,
      );
    } catch (error) {
      setMessage(errorMessage(error));
      return;
    }
    formElement.reset();
    setCursor("");
    setCursorHistory([]);
    await load("");
  }
  async function revoke(id: string) {
    const reason = window.prompt(t("admin.governance.revokeReason"));
    if (!reason) return;
    try {
      await apiRequest(
        `/api/v1/admin/bans/${id}/revoke`,
        { method: "POST", body: JSON.stringify({ reason }) },
        token,
      );
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <section>
      <PanelHeader
        title={t("admin.governance.bans")}
        description={t("admin.governance.bansDescription")}
      />
      {message ? <Notice text={message} /> : null}
      <form
        className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 md:grid-cols-2"
        onSubmit={create}
      >
        <input
          className="field"
          name="userId"
          required
          placeholder={t("admin.governance.banUserId")}
        />
        <BanReasonSelect
          error={banReasons.error}
          items={banReasons.items}
          loading={banReasons.loading}
          loadingText={t("admin.governance.banReasonsLoading")}
          errorText={t("admin.governance.banReasonsLoadFailed")}
          name="reasonCode"
          required
          retryText={t("common.retry")}
          onRetry={banReasons.reload}
        />
        <input
          className="field"
          name="customReason"
          placeholder={t("admin.governance.customReason")}
        />
        <input className="field" name="endsAt" type="datetime-local" />
        <textarea
          className="field min-h-24 md:col-span-2"
          name="publicRecordMarkdown"
          placeholder={t("admin.governance.publicRecord")}
        />
        <textarea
          className="field min-h-20 md:col-span-2"
          name="internalNote"
          placeholder={t("admin.governance.internalNote")}
        />
        <button
          className="button-primary focus-ring md:col-span-2"
          disabled={banReasons.loading || Boolean(banReasons.error)}
          type="submit"
        >
          {t("admin.governance.createBan")}
        </button>
      </form>
      <div className="mt-5 grid gap-3">
        {page.items.map((item) => (
          <article
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
            key={item.id}
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{item.username}</strong>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {item.reasonCode}
                  {item.customReason ? ` · ${item.customReason}` : ""} ·{" "}
                  {item.status}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-bold">
                    {t("admin.governance.moderator")}:
                  </span>{" "}
                  {item.moderatorName}
                </p>
                {item.internalNote ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <span className="font-bold">
                      {t("admin.governance.internalNote")}:
                    </span>{" "}
                    {item.internalNote}
                  </p>
                ) : null}
                {item.revokedByName ? (
                  <p className="mt-2 text-sm">
                    <span className="font-bold">
                      {t("admin.governance.releasedBy")}:
                    </span>{" "}
                    {item.revokedByName}
                  </p>
                ) : null}
                {item.revokeReason ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <span className="font-bold">
                      {t("admin.governance.releaseReason")}:
                    </span>{" "}
                    {item.revokeReason}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Link
                  className="button-secondary focus-ring"
                  href={`/site-affairs/blackroom/${item.id}`}
                >
                  {t("admin.governance.publicView")}
                </Link>
                {item.status !== "released" ? (
                  <button
                    className="button-secondary focus-ring"
                    type="button"
                    onClick={() => void revoke(item.id)}
                  >
                    {t("admin.governance.revoke")}
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex justify-between">
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
    </section>
  );
}
