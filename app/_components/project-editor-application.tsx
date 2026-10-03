"use client";

import { apiErrorMessage } from "../_lib/api-error.mts";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, uploadUserFileToOSS, type OSSFileRecord } from "../_lib/oss-upload";
import { FileDropZone } from "./file-drop-zone";
import { createOSSUploadBatchTasks, processOSSUploadBatch, type OSSUploadBatchTask } from "../_lib/oss-upload-batch.mts";
import { OSSUploadBatchStatus } from "./oss-upload-batch-status";

export type ProjectEditorApplication = {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  targetUrl: string;
  userId: string;
  username: string;
  proofMarkdown: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  reviewNote: string;
  attachments: Array<{ id: string; originalName: string; sizeBytes: number }>;
  createdAt: string;
  reviewedAt?: string;
};

type ProjectEditorApplicationButtonProps = {
  canEdit: boolean;
  projectId: string;
  projectName: string;
  projectType: string;
  returnPath: string;
};

export function ProjectEditorApplicationButton({
  canEdit,
  projectId,
  projectName,
  projectType,
  returnPath,
}: ProjectEditorApplicationButtonProps) {
  const { token, user } = useAuthSnapshot();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (canEdit) return null;
  if (!user || !token) {
    return <Link className="button-secondary focus-ring" href={`/login?next=${encodeURIComponent(returnPath)}`}>{t("mods.applications.applyEditor")}</Link>;
  }
  if (!hasPermission(user, "project.editor.apply")) return null;
  return <>
    <button className="button-secondary focus-ring" type="button" onClick={() => setOpen(true)}>{t("mods.applications.applyEditor")}</button>
    {open ? <ProjectEditorApplicationDialog key={`${user.id}:${token}:${projectType}:${projectId}`} projectId={projectId} projectName={projectName} projectType={projectType} token={token} onClose={() => setOpen(false)} /> : null}
  </>;
}

function ProjectEditorApplicationDialog({ projectId, projectName, projectType, token, onClose }: {
  projectId: string;
  projectName: string;
  projectType: string;
  token: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [proofMarkdown, setProofMarkdown] = useState("");
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const attachmentsRef = useRef(attachments);
  const operationInFlight = useRef(false);
  const submitted = useRef(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const mounted = useRef(true);
  const [uploadTasks, setUploadTasks] = useState<OSSUploadBatchTask<File, OSSFileRecord>[]>([]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function closeDialog() {
    if (!operationInFlight.current) onClose();
  }

  function removeAttachment(id: string) {
    if (operationInFlight.current || submitted.current) return;
    attachmentsRef.current = attachmentsRef.current.filter((item) => item.id !== id);
    setAttachments(attachmentsRef.current);
  }

  async function addFiles(files: File[]) {
    if (!files.length || operationInFlight.current || submitted.current) return;
    const tasks = createOSSUploadBatchTasks<File, OSSFileRecord>(files, {
      capacity: Math.max(0, 10 - attachmentsRef.current.length),
      capacityError: t("uploadBatch.capacityReached"),
      identity: () => crypto.randomUUID(),
      validate: () => "",
    });
    await processFiles(tasks);
  }

  async function processFiles(tasks: OSSUploadBatchTask<File, OSSFileRecord>[], retryKey?: string) {
    if (operationInFlight.current || submitted.current) return;
    operationInFlight.current = true;
    setUploading(true);
    setMessage("");
    try {
      await processOSSUploadBatch(tasks, {
        upload: (file) => {
          if (!mounted.current) throw new DOMException("The application dialog was closed", "AbortError");
          return uploadUserFileToOSS(file, token, "project-editor-application");
        },
        shouldProcess: retryKey ? (task) => task.key === retryKey : undefined,
        onChange: (next) => { if (mounted.current) setUploadTasks(next); },
        onUploaded: (_, record) => {
          if (!mounted.current || attachmentsRef.current.some((item) => item.id === record.id)) return;
          attachmentsRef.current = [...attachmentsRef.current, { id: record.id, name: record.originalName, size: record.sizeBytes }];
          setAttachments(attachmentsRef.current);
        },
      });
    } catch (error) {
      if (mounted.current) setMessage(apiErrorMessage(error, t, t("mods.applications.uploadFailed")));
    } finally {
      operationInFlight.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (operationInFlight.current || submitted.current) return;
    operationInFlight.current = true;
    setSubmitting(true);
    setMessage("");
    try {
      await apiRequest<ProjectEditorApplication>(
        `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/editor-applications`,
        {
          method: "POST",
          body: JSON.stringify({
            proofMarkdown,
            attachmentIds: attachmentsRef.current.map((item) => item.id),
          }),
        },
        token,
      );
      submitted.current = true;
      if (mounted.current) setSubmittedSuccessfully(true);
      if (mounted.current) setMessage(t("mods.applications.submitted"));
    } catch (error) {
      if (mounted.current) setMessage(apiErrorMessage(error, t, t("mods.applications.submitFailed")));
    } finally {
      operationInFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={closeDialog}>
    <form className="surface max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label={t("mods.applications.editorTitle")} onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-black">{t("mods.applications.editorTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{projectName}</p></div>
        <button className="button-secondary focus-ring" type="button" disabled={uploading || submitting} onClick={closeDialog}>{t("common.close")}</button>
      </div>
      <fieldset disabled={uploading || submitting || submittedSuccessfully} className="min-w-0">
      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-black">{t("mods.applications.proof")}</span>
        <textarea className="field min-h-40 resize-y" required maxLength={10000} value={proofMarkdown} placeholder={t("mods.applications.editorProofPlaceholder")} onChange={(event) => setProofMarkdown(event.target.value)} />
      </label>
      <div className="mt-4">
        <span className="block text-sm font-black">{t("mods.applications.attachments")}</span>
        <FileDropZone
          accept=""
          className="mt-2 min-h-28 p-4"
          disabled={uploading || submitting || submittedSuccessfully || attachments.length >= 10}
          hint={`${attachments.length} / 10 · ${t("mods.applications.attachments")}`}
          multiple
          title={uploading ? t("mods.applications.uploading") : t("mods.applications.addAttachments")}
          onFiles={(files) => void addFiles(files)}
        />
        <OSSUploadBatchStatus busy={uploading || submitting || submittedSuccessfully} tasks={uploadTasks} onRetry={(key) => void processFiles(uploadTasks, key)} />
        <div className="mt-3 grid gap-2">{attachments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{item.name} · {formatBytes(item.size)}</span>
          <button className="text-[var(--red)]" type="button" onClick={() => removeAttachment(item.id)}>{t("common.delete")}</button>
        </div>)}</div>
      </div>
      </fieldset>
      {message ? <p role="status" className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button className="button-secondary focus-ring" type="button" disabled={uploading || submitting} onClick={closeDialog}>{t("common.cancel")}</button>
        <button className="button-primary focus-ring" disabled={submitting || uploading || submittedSuccessfully} type="submit">{submitting ? t("mods.submission.actions.submitting") : t("mods.applications.submit")}</button>
      </div>
    </form>
  </div>;
}
