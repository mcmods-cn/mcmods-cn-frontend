"use client";

import { ChangeEvent, DragEvent, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, uploadUserFileToOSS } from "../_lib/oss-upload";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { StickerPicker } from "./sticker-picker";

export type CommentEditorAttachment = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
};

type PendingUpload = {
  key: string;
  name: string;
  sizeBytes: number;
  progress: number;
  error?: string;
};

type CommentMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  token: string;
  attachments: CommentEditorAttachment[];
  onAttachmentsChange: (attachments: CommentEditorAttachment[]) => void;
  onError: (message: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
};

const maxCommentAttachments = 5;

export function CommentMarkdownEditor({
  value,
  onChange,
  token,
  attachments,
  onAttachmentsChange,
  onError,
  onUploadingChange,
  inputRef,
  placeholder,
  disabled = false,
  maxLength = 10000,
}: CommentMarkdownEditorProps) {
  const { t } = useI18n();
  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? localInputRef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const uploading = uploads.some((item) => !item.error && item.progress < 100);

  useEffect(() => onUploadingChange?.(uploading), [onUploadingChange, uploading]);

  function updateText(next: string, selectionStart: number, selectionEnd = selectionStart) {
    onChange(next.slice(0, maxLength));
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(Math.min(selectionStart, maxLength), Math.min(selectionEnd, maxLength));
    });
  }

  function wrapSelection(prefix: string, suffix: string, fallback: string) {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const selected = value.slice(start, end) || fallback;
    const replacement = `${prefix}${selected}${suffix}`;
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    updateText(next, start + prefix.length, start + prefix.length + selected.length);
  }

  function applyTextSize(level: string) {
    const input = textareaRef.current;
    const selectionStart = input?.selectionStart ?? value.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextBreak = value.indexOf("\n", selectionEnd);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const selectedLines = value.slice(lineStart, lineEnd);
    const prefix = level === "large" ? "## " : level === "medium" ? "### " : level === "small" ? "#### " : "";
    const replacement = selectedLines.split("\n").map((line) => `${prefix}${line.replace(/^#{1,6}\s+/, "")}`).join("\n");
    updateText(`${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`, lineStart, lineStart + replacement.length);
  }

  async function uploadFiles(files: File[]) {
    if (!token || files.length === 0) return;
    const available = Math.max(0, maxCommentAttachments - attachments.length - uploads.filter((item) => !item.error).length);
    const accepted = files.slice(0, available);
    if (accepted.length !== files.length) onError(t("mods.comments.editor.attachmentLimit", { count: maxCommentAttachments }));
    const nextAttachments = [...attachments];
    for (const file of accepted) {
      const key = `${file.name}-${file.size}-${file.lastModified}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
      setUploads((current) => [...current, { key, name: file.name, sizeBytes: file.size, progress: 0 }]);
      try {
        const result = await uploadUserFileToOSS(file, token, "comment", (loaded, total) => {
          const progress = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          setUploads((current) => current.map((item) => item.key === key ? { ...item, progress } : item));
        });
        const attachment: CommentEditorAttachment = {
          id: result.id,
          name: result.sourceOriginalName || result.originalName || file.name,
          contentType: result.contentType || file.type || "application/octet-stream",
          sizeBytes: result.sourceSizeBytes || result.sizeBytes || file.size,
        };
        if (!nextAttachments.some((item) => item.id === attachment.id)) nextAttachments.push(attachment);
        onAttachmentsChange([...nextAttachments]);
        setUploads((current) => current.filter((item) => item.key !== key));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("mods.comments.editor.uploadFailed");
        setUploads((current) => current.map((item) => item.key === key ? { ...item, error: message, progress: 0 } : item));
        onError(`${file.name}: ${message}`);
      }
    }
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`overflow-visible rounded-lg border bg-[var(--panel-subtle)] transition ${dragging ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--line)]"}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={dropFiles}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StickerPicker disabled={disabled || mode === "preview"} inputRef={textareaRef} value={value} onChange={onChange} />
          <select
            aria-label={t("mods.comments.editor.fontSize")}
            className="field w-auto min-w-24 py-2 text-sm"
            defaultValue="body"
            disabled={disabled || mode === "preview"}
            onChange={(event) => { applyTextSize(event.target.value); event.target.value = "body"; }}
          >
            <option value="body">{t("mods.comments.editor.bodyText")}</option>
            <option value="large">{t("mods.comments.editor.largeText")}</option>
            <option value="medium">{t("mods.comments.editor.mediumText")}</option>
            <option value="small">{t("mods.comments.editor.smallText")}</option>
          </select>
          <ToolbarButton label={t("mods.comments.editor.bold")} disabled={disabled || mode === "preview"} onClick={() => wrapSelection("**", "**", t("mods.comments.editor.selectedText"))}><strong>B</strong></ToolbarButton>
          <ToolbarButton label={t("mods.comments.editor.italic")} disabled={disabled || mode === "preview"} onClick={() => wrapSelection("*", "*", t("mods.comments.editor.selectedText"))}><em>I</em></ToolbarButton>
          <ToolbarButton label={t("mods.comments.editor.strike")} disabled={disabled || mode === "preview"} onClick={() => wrapSelection("~~", "~~", t("mods.comments.editor.selectedText"))}><span className="line-through">S</span></ToolbarButton>
          <ToolbarButton label={t("mods.comments.editor.code")} disabled={disabled || mode === "preview"} onClick={() => wrapSelection("`", "`", t("mods.comments.editor.selectedText"))}>{"<>"}</ToolbarButton>
          <ToolbarButton label={t("mods.comments.editor.link")} disabled={disabled || mode === "preview"} onClick={() => wrapSelection("[", "](https://)", t("mods.comments.editor.linkText"))}>↗</ToolbarButton>
          <ToolbarButton label={t("mods.comments.editor.attachFile")} disabled={disabled || uploading} onClick={() => fileInputRef.current?.click()}>＋</ToolbarButton>
          <input className="sr-only" multiple ref={fileInputRef} type="file" onChange={chooseFiles} />
        </div>
        <div className="flex rounded-md border border-[var(--line)] bg-[var(--panel)] p-0.5" role="group" aria-label={t("mods.comments.editor.mode")}>
          <button className={`focus-ring rounded px-3 py-1.5 text-xs font-bold ${mode === "edit" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`} type="button" onClick={() => setMode("edit")}>{t("mods.comments.editor.edit")}</button>
          <button className={`focus-ring rounded px-3 py-1.5 text-xs font-bold ${mode === "preview" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`} type="button" onClick={() => setMode("preview")}>{t("mods.comments.editor.preview")}</button>
        </div>
      </div>

      {mode === "edit" ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            className="min-h-32 w-full resize-y bg-transparent p-4 outline-none placeholder:text-[var(--muted)]"
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder}
            required
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {dragging ? <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--panel)]/95 text-sm font-black text-[var(--accent)]">{t("mods.comments.editor.dropFiles")}</div> : null}
        </div>
      ) : (
        <div className="markdown-preview min-h-32 p-4 text-sm leading-7">
          <MarkdownRenderer commentFloorLinks config={defaultMarkdownConfig} emptyText={t("mods.comments.editor.previewEmpty")} markdown={value} />
        </div>
      )}

      {(attachments.length > 0 || uploads.length > 0) ? (
        <div className="grid gap-2 border-t border-[var(--line)] p-3" aria-live="polite">
          {attachments.map((attachment) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2" key={attachment.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{attachment.name}</p>
                <p className="text-xs text-[var(--muted)]">{formatBytes(attachment.sizeBytes)} · {isAutomaticLogAttachment(attachment.name) ? t("mods.comments.editor.logViewer") : t("mods.comments.editor.downloadableFile")}</p>
              </div>
              <button className="focus-ring shrink-0 text-xs font-bold text-[var(--red)] hover:underline" type="button" onClick={() => onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id))}>{t("common.delete")}</button>
            </div>
          ))}
          {uploads.map((upload) => (
            <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2" key={upload.key}>
              <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-bold">{upload.name}</span><span className={upload.error ? "text-[var(--red)]" : "text-[var(--muted)]"}>{upload.error || `${upload.progress}%`}</span></div>
              {!upload.error ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${upload.progress}%` }} /></div> : null}
              {upload.error ? <button className="mt-1 text-xs font-bold text-[var(--red)] hover:underline" type="button" onClick={() => setUploads((current) => current.filter((item) => item.key !== upload.key))}>{t("common.delete")}</button> : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">{t("mods.comments.editor.dropHint")}</p>
    </div>
  );
}

function ToolbarButton({ children, disabled, label, onClick }: { children: ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="focus-ring grid h-9 min-w-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-sm hover:border-[var(--accent)] disabled:opacity-50" disabled={disabled} title={label} type="button" onClick={onClick}>{children}</button>;
}

export function isAutomaticLogAttachment(fileName: string) {
  const normalized = fileName.normalize("NFC");
  const lower = normalized.toLocaleLowerCase();
  return lower.endsWith(".log") || lower.endsWith(".zip") && normalized.includes("错误报告");
}
