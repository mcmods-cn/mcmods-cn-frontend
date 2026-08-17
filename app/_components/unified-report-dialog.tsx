"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import {
  completeOSSUpload,
  computeFileSHA256,
  formatBytes,
  OSSDirectUploadTicket,
  putFileToOSS,
} from "../_lib/oss-upload";

export type ReportTargetType =
  | "mod" | "plugin" | "map" | "shader" | "resource_pack" | "datapack" | "addon"
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

export function UnifiedReportDialog({ open, targetType, targetId, targetSummary, targetAuthor, onClose, onSubmitted }: ReportDialogProps) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [reasonCode, setReasonCode] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [detail, setDetail] = useState("");
  const [evidence, setEvidence] = useState<UploadedEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiRequest<{ items: ReportReason[] }>(`/api/v1/reports/reasons?targetType=${encodeURIComponent(targetType)}`)
      .then((result) => {
        if (cancelled) return;
        setReasons(result.items);
        setReasonCode((current) => result.items.some((item) => item.code === current) ? current : result.items[0]?.code || "");
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("reports.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, t, targetType]);

  if (!open) return null;
  const selectedReason = reasons.find((item) => item.code === reasonCode);

  async function addEvidence(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!token || files.length === 0) return;
    if (files.length + evidence.length > 5) {
      setMessage(t("reports.maximumEvidence"));
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const uploaded: UploadedEvidence[] = [];
      for (const file of files) {
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
            preferMultipart: true,
          }),
        }, token);
        if (ticket.uploadRequired !== false) await putFileToOSS(ticket, file);
        const completed = ticket.uploadRequired === false && ticket.file?.id
          ? ticket.file
          : await completeOSSUpload<{ id: string; originalName?: string; sizeBytes?: number }>("/api/v1/reports/evidence/uploads/complete", ticket, token);
        uploaded.push({ id: completed.id, originalName: completed.originalName || file.name, sizeBytes: completed.sizeBytes ?? file.size });
      }
      setEvidence((current) => [...current, ...uploaded]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("reports.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !reasonCode || selectedReason?.requiresCustomText && !customReason.trim()) return;
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
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("reports.submitFailed"));
    } finally {
      setLoading(false);
    }
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={onClose}>
    <form className="surface max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] p-5 shadow-2xl" aria-labelledby="report-dialog-title" aria-modal="true" role="dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-black" id="report-dialog-title">{t("reports.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("reports.targetType")}: {t(`reports.targets.${targetType}`)}</p></div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </div>
      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
        <strong className="block break-words">{targetSummary}</strong>
        {targetAuthor ? <span className="mt-1 block text-sm text-[var(--muted)]">{t("reports.targetAuthor")}: {targetAuthor}</span> : null}
        <span className="mt-1 block font-mono text-xs text-[var(--muted)]">{targetId}</span>
      </section>
      <label className="mt-5 block"><span className="mb-2 block text-sm font-black">{t("reports.reason")}</span><select className="field" required value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>{reasons.map((item) => <option key={item.code} value={item.code}>{t(item.i18nKey)}</option>)}</select></label>
      {selectedReason?.requiresCustomText ? <label className="mt-4 block"><span className="mb-2 block text-sm font-black">{t("reports.customReason")}</span><textarea className="field min-h-24 resize-y" maxLength={500} required value={customReason} onChange={(event) => setCustomReason(event.target.value)} /></label> : null}
      <label className="mt-4 block"><span className="mb-2 block text-sm font-black">{t("reports.detail")}</span><textarea className="field min-h-32 resize-y" maxLength={4000} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
      <div className="mt-4"><span className="block text-sm font-black">{t("reports.evidence")}</span><label className="button-secondary focus-ring mt-2 inline-flex cursor-pointer"><input className="sr-only" type="file" multiple disabled={uploading || evidence.length >= 5} onChange={(event) => void addEvidence(event)} />{uploading ? t("reports.uploading") : t("reports.addEvidence")}</label><div className="mt-3 grid gap-2">{evidence.map((item) => <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm" key={item.id}><span className="min-w-0 truncate">{item.originalName} · {formatBytes(item.sizeBytes)}</span><button className="text-[var(--red)]" type="button" onClick={() => setEvidence((current) => current.filter((value) => value.id !== item.id))}>{t("common.delete")}</button></div>)}</div></div>
      <p className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-sm leading-6 text-[var(--muted)]">{t("reports.notice")}</p>
      {message ? <p aria-live="polite" className="mt-4 rounded-md border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary focus-ring" disabled={loading || uploading || !reasonCode} type="submit">{loading ? t("reports.submitting") : t("reports.submit")}</button></div>
    </form>
  </div>;
}
