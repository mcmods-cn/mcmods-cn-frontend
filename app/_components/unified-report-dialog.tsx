"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { processEvidenceUploadBatch } from "../_lib/report-evidence-batch";
import {
  completeOSSUpload,
  computeFileSHA256,
  formatBytes,
  OSSDirectUploadTicket,
  putFileToOSS,
} from "../_lib/oss-upload";
import { FileDropZone } from "./file-drop-zone";

export type ReportTargetType =
  | "mod" | "modpack" | "plugin" | "map" | "shader" | "resource_pack" | "datapack" | "addon"
  | "discussion" | "bug" | "news" | "tutorial" | "skin" | "blueprint" | "server"
  | "comment" | "user";

type ReportReason = {
  code: string;
  i18nKey: string;
  requiresCustomText: boolean;
};

type UploadedEvidence = {
  id: string;
  originalName: string;
  sizeBytes: number;
};

type EvidenceUploadFailure = {
  message: string;
  originalName: string;
};

type ReportDialogProps = {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  targetSummary: string;
  targetAuthor?: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function UnifiedReportButton({
  targetType,
  targetId,
  targetSummary,
  targetAuthor,
  className = "button-secondary focus-ring",
  label,
}: Omit<ReportDialogProps, "open" | "onClose"> & { className?: string; label?: string }) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [open, setOpen] = useState(false);
  if (!token) return null;
  return <>
    <button className={className} type="button" onClick={() => setOpen(true)}>{label || t("reports.action")}</button>
    <UnifiedReportDialog
      open={open}
      targetAuthor={targetAuthor}
      targetId={targetId}
      targetSummary={targetSummary}
      targetType={targetType}
      onClose={() => setOpen(false)}
    />
  </>;
}

export function UnifiedReportDialog(props: ReportDialogProps) {
  const { token, user } = useAuthSnapshot();
  if (!props.open || !token) return null;
  return <ReportDialogContent key={`${user?.id || "guest"}:${props.targetType}:${props.targetId}:${token}`} {...props} />;
}

function ReportDialogContent({ targetType, targetId, targetSummary, targetAuthor, onClose, onSubmitted }: ReportDialogProps) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [reasonCode, setReasonCode] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [detail, setDetail] = useState("");
  const [evidence, setEvidence] = useState<UploadedEvidence[]>([]);
  const [evidenceFailures, setEvidenceFailures] = useState<EvidenceUploadFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const busy = loading || uploading;
  const mutationInFlight = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items: ReportReason[] }>(`/api/v1/reports/reasons?targetType=${encodeURIComponent(targetType)}`)
      .then((result) => {
        if (cancelled) return;
        setReasons(result.items);
        setReasonCode((current) => result.items.some((item) => item.code === current) ? current : result.items[0]?.code || "");
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("reports.loadFailed")); });
    return () => { cancelled = true; };
  }, [t, targetType]);

  const selectedReason = reasons.find((item) => item.code === reasonCode);

  async function uploadEvidenceFiles(files: File[]) {
    if (!token || files.length === 0) return;
    if (busy || mutationInFlight.current) return;
    if (files.length + evidence.length > 5) {
      setMessage(t("reports.maximumEvidence"));
      return;
    }
    mutationInFlight.current = true;
    setUploading(true);
    setMessage("");
    setEvidenceFailures([]);
    try {
      await processEvidenceUploadBatch(files, async (file) => {
        const sha256 = await computeFileSHA256(file);
        const ticket = await apiRequest<OSSDirectUploadTicket>("/api/v1/reports/evidence/uploads", {
          method: "POST",
          body: JSON.stringify({
            originalName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            sha256,
            category: "report_evidence",
            source: "report_evidence",
          }),
        }, token);
        if (ticket.uploadRequired !== false) await putFileToOSS(ticket, file);
        const completed = ticket.uploadRequired === false && ticket.file?.id
          ? ticket.file
          : await completeOSSUpload<{ id: string; originalName?: string; sizeBytes?: number }>("/api/v1/reports/evidence/uploads/complete", ticket, token);
        return { id: completed.id, originalName: completed.originalName || file.name, sizeBytes: completed.sizeBytes ?? file.size };
      }, (uploaded) => {
        setEvidence((current) => current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]);
      }, (file, error) => {
        setEvidenceFailures((current) => [...current, { message: error instanceof Error ? error.message : t("reports.uploadFailed"), originalName: file.name }]);
        setMessage(t("reports.someEvidenceFailed"));
      });
    } finally {
      mutationInFlight.current = false;
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || busy || mutationInFlight.current || !reasonCode || selectedReason?.requiresCustomText && !customReason.trim()) return;
    mutationInFlight.current = true;
    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType,
          targetId,
          reasonCode,
          customReason: customReason.trim(),
          detail: detail.trim(),
          evidenceIds: evidence.map((item) => item.id),
        }),
      }, token);
      setReasonCode("");
      setCustomReason("");
      setDetail("");
      setEvidence([]);
      setEvidenceFailures([]);
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("reports.submitFailed"));
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
    }
  }

  return <dialog className="fixed m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-2xl rounded-xl border-0 bg-transparent p-0 text-[var(--foreground)] backdrop:bg-black/55" ref={dialogRef} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="surface max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] p-5 shadow-2xl" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <fieldset disabled={busy}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-black" id={titleId}>{t("reports.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("reports.targetType")}: {t(`reports.targets.${targetType}`)}</p></div>
        <button className="button-secondary focus-ring" type="button" disabled={busy} onClick={onClose}>{t("common.close")}</button>
      </div>
      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
        <strong className="block break-words">{targetSummary}</strong>
        {targetAuthor ? <span className="mt-1 block text-sm text-[var(--muted)]">{t("reports.targetAuthor")}: {targetAuthor}</span> : null}
        <span className="mt-1 block font-mono text-xs text-[var(--muted)]">{targetId}</span>
      </section>
      <label className="mt-5 block"><span className="mb-2 block text-sm font-black">{t("reports.reason")}</span><select className="field" disabled={busy} required value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>{reasons.map((item) => <option key={item.code} value={item.code}>{t(item.i18nKey)}</option>)}</select></label>
      {selectedReason?.requiresCustomText ? <label className="mt-4 block"><span className="mb-2 block text-sm font-black">{t("reports.customReason")}</span><textarea disabled={busy} className="field min-h-24 resize-y" maxLength={500} required value={customReason} onChange={(event) => setCustomReason(event.target.value)} /></label> : null}
      <label className="mt-4 block"><span className="mb-2 block text-sm font-black">{t("reports.detail")}</span><textarea disabled={busy} className="field min-h-32 resize-y" maxLength={4000} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
      <div className="mt-4">
        <span className="block text-sm font-black">{t("reports.evidence")}</span>
        <FileDropZone
          accept=""
          className="mt-2 min-h-28 p-4"
          disabled={busy || evidence.length >= 5}
          hint={t("reports.dragEvidence")}
          multiple
          title={uploading ? t("reports.uploading") : t("reports.addEvidence")}
          onFiles={(files) => void uploadEvidenceFiles(files)}
        />
        <div className="mt-3 grid gap-2">
          {evidence.map((item) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm" key={item.id}>
              <span className="min-w-0 truncate">{item.originalName} · {formatBytes(item.sizeBytes)}</span>
              <button className="text-[var(--red)]" disabled={busy} type="button" onClick={() => setEvidence((current) => current.filter((value) => value.id !== item.id))}>{t("common.delete")}</button>
            </div>
          ))}
          {evidenceFailures.map((item, index) => (
            <div className="rounded-md border border-[var(--red)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--red)]" key={`${item.originalName}-${index}`}>
              <strong className="block truncate">{item.originalName}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-sm leading-6 text-[var(--muted)]">{t("reports.notice")}</p>
      {message ? <p role="alert" className="mt-4 rounded-md border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button className="button-secondary focus-ring" type="button" disabled={busy} onClick={onClose}>{t("common.cancel")}</button><button className="button-primary focus-ring" disabled={loading || uploading || !reasonCode} type="submit">{loading ? t("reports.submitting") : t("reports.submit")}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
