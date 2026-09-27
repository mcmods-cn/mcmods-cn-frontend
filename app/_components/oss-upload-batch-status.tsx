"use client";

import type { OSSUploadBatchTask } from "../_lib/oss-upload-batch.mts";
import { useI18n } from "../_lib/i18n-provider";

export function OSSUploadBatchStatus({ busy, onRetry, tasks }: {
  busy: boolean;
  onRetry: (key: string) => void;
  tasks: Array<Pick<OSSUploadBatchTask<unknown>, "error" | "key" | "name" | "stage" | "uploadedFileId">>;
}) {
  const { t } = useI18n();
  if (!tasks.length) return null;
  return <ul className="mt-3 grid gap-2" aria-label={t("uploadBatch.title")}>
    {tasks.map((task) => <li className="rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm" key={task.key}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="min-w-0 truncate">{task.name}</strong>
        <span className={task.stage === "failed" || task.stage === "invalid" ? "font-bold text-[var(--red)]" : "text-[var(--muted)]"}>
          {t(`uploadBatch.status.${task.stage}`)}
        </span>
      </div>
      {task.uploadedFileId ? <code className="mt-1 block break-all text-xs text-[var(--muted)]">{task.uploadedFileId}</code> : null}
      {task.error ? <p className="mt-1 text-[var(--red)]">{task.error}</p> : null}
      {task.stage === "failed" ? <button className="button-secondary mt-2" disabled={busy} type="button" onClick={() => onRetry(task.key)}>{t("common.retry")}</button> : null}
    </li>)}
  </ul>;
}
