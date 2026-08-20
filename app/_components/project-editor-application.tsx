"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, uploadUserFileToOSS } from "../_lib/oss-upload";

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
    {open ? <ProjectEditorApplicationDialog projectId={projectId} projectName={projectName} projectType={projectType} token={token} onClose={() => setOpen(false)} /> : null}
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
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      const uploaded: Array<{ id: string; name: string; size: number }> = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) {
        const record = await uploadUserFileToOSS(file, token, "project-editor-application");
        uploaded.push({ id: record.id, name: record.originalName, size: record.sizeBytes });
      }
      setAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.applications.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await apiRequest<ProjectEditorApplication>(
        `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/editor-applications`,
        {
          method: "POST",
          body: JSON.stringify({
            proofMarkdown,
            attachmentIds: attachments.map((item) => item.id),
          }),
        },
        token,
      );
      setMessage(t("mods.applications.submitted"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.applications.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
    <form className="surface max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] p-5 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-black">{t("mods.applications.editorTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{projectName}</p></div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </div>
      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-black">{t("mods.applications.proof")}</span>
        <textarea className="field min-h-40 resize-y" required maxLength={10000} value={proofMarkdown} placeholder={t("mods.applications.editorProofPlaceholder")} onChange={(event) => setProofMarkdown(event.target.value)} />
      </label>
      <div className="mt-4">
        <span className="block text-sm font-black">{t("mods.applications.attachments")}</span>
        <label className="button-secondary focus-ring mt-2 inline-flex cursor-pointer">
          <input className="sr-only" type="file" multiple disabled={uploading || attachments.length >= 10} onChange={(event) => void addFiles(event.target.files)} />
          {uploading ? t("mods.applications.uploading") : t("mods.applications.addAttachments")}
        </label>
        <div className="mt-3 grid gap-2">{attachments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{item.name} · {formatBytes(item.size)}</span>
          <button className="text-[var(--red)]" type="button" onClick={() => setAttachments((current) => current.filter((file) => file.id !== item.id))}>{t("common.delete")}</button>
        </div>)}</div>
      </div>
      {message ? <p className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.cancel")}</button>
        <button className="button-primary focus-ring" disabled={submitting || uploading} type="submit">{submitting ? t("mods.submission.actions.submitting") : t("mods.applications.submit")}</button>
      </div>
    </form>
  </div>;
}
