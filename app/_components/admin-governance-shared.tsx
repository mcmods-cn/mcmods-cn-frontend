"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";

export type BanReason = { code: string; label: string; sortOrder: number };
export type BanReasonLoadState = {
  items: BanReason[];
  loading: boolean;
  error: string;
  reload: () => void;
};
export type GovernancePage<T> = {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export function AdminSplit({
  title,
  message,
  left,
  right,
}: {
  title: string;
  message: string;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <section>
      <PanelHeader title={title} description="" />
      {message ? <Notice text={message} /> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="max-h-[72vh] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          {left}
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          {right}
        </div>
      </div>
    </section>
  );
}
export function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <h2 className="text-2xl font-black">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
      ) : null}
    </header>
  );
}
export function Notice({ text }: { text: string }) {
  return (
    <p
      className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold"
      role="status"
    >
      {text}
    </p>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-48 place-items-center text-center font-bold text-[var(--muted)]">
      {text}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 font-bold">
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
export function BanReasonSelect({
  items,
  name,
  required,
  loading,
  error,
  loadingText,
  errorText,
  retryText,
  onRetry,
}: {
  items: BanReason[];
  name: string;
  required: boolean;
  loading: boolean;
  error: string;
  loadingText: string;
  errorText: string;
  retryText: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-2">
      <select
        aria-busy={loading}
        className="field"
        defaultValue=""
        disabled={loading || Boolean(error)}
        name={name}
        required={required}
      >
        <option value="">—</option>
        {items.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      {loading ? (
        <p className="text-xs font-bold text-[var(--muted)]" role="status">
          {loadingText}
        </p>
      ) : null}
      {error ? (
        <div
          className="rounded-lg border border-[var(--red)] p-3 text-sm text-[var(--red)]"
          role="alert"
        >
          <p className="font-bold">{errorText}</p>
          <p className="mt-1 break-words text-xs">{error}</p>
          <button
            className="button-secondary focus-ring mt-2"
            type="button"
            onClick={onRetry}
          >
            {retryText}
          </button>
        </div>
      ) : null}
    </div>
  );
}
export function useBanReasons(
  token: string,
  locale: string,
): BanReasonLoadState {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${locale}\u0000${token}\u0000${attempt}`;
  const [result, setResult] = useState<{
    requestKey: string;
    items: BanReason[];
    error: string;
  }>({ requestKey: "", items: [], error: "" });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ items: BanReason[] }>(
      `/api/v1/admin/ban-reasons?locale=${encodeURIComponent(locale)}`,
      { signal: controller.signal },
      token,
    )
      .then((value) => setResult({ requestKey, items: value.items, error: "" }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ requestKey, items: [], error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [locale, requestKey, token]);
  const loading = result.requestKey !== requestKey;
  return {
    items: loading ? [] : result.items,
    loading,
    error: loading ? "" : result.error,
    reload,
  };
}
export function RecordTable({
  title,
  items,
  onSelect,
  selectLabel,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  onSelect?: (item: Record<string, unknown>) => void;
  selectLabel?: string;
}) {
  return (
    <section className="mt-6">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--panel-subtle)]">
            <tr>
              {Object.keys(items[0] || {}).map((key) => (
                <th className="px-3 py-2" key={key}>
                  {key}
                </th>
              ))}
              {onSelect ? (
                <th className="px-3 py-2">
                  <span className="sr-only">{selectLabel}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                className="border-t border-[var(--line)]"
                key={String(
                  item.id || item.public_id || item.externalProjectId || index,
                )}
              >
                {Object.keys(items[0] || {}).map((key) => (
                  <td
                    className="max-w-72 truncate px-3 py-2"
                    title={display(item[key])}
                    key={key}
                  >
                    {display(item[key])}
                  </td>
                ))}
                {onSelect ? (
                  <td className="px-3 py-2">
                    <button
                      className="button-secondary focus-ring whitespace-nowrap"
                      type="button"
                      onClick={() => onSelect(item)}
                    >
                      {selectLabel}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="p-6 text-center text-[var(--muted)]">—</p>
        ) : null}
      </div>
    </section>
  );
}
export function display(value: unknown) {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value ?? "—");
}
export function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
export function today() {
  return new Date().toISOString().slice(0, 10);
}
