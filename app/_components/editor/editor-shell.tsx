"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "../../_lib/i18n-provider";

export type EditorShellLabels = Partial<{
  back: string;
  cancel: string;
  create: string;
  save: string;
  saving: string;
  delete: string;
  deleting: string;
}>;

export function EditorShell({
  mode,
  title,
  description,
  backHref,
  cancelHref = backHref,
  languageSwitcher,
  reviewPanel,
  statusMessage,
  aside,
  children,
  labels = {},
  busy = false,
  deleting = false,
  canSubmit = true,
  canDelete = false,
  onSubmit,
  onDelete,
}: {
  mode: "create" | "edit";
  title: string;
  description?: string;
  backHref: string;
  cancelHref?: string;
  languageSwitcher?: ReactNode;
  reviewPanel?: ReactNode;
  statusMessage?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  labels?: EditorShellLabels;
  busy?: boolean;
  deleting?: boolean;
  canSubmit?: boolean;
  canDelete?: boolean;
  onSubmit: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const submitText = busy
    ? labels.saving ?? t("common.saving")
    : mode === "create"
      ? labels.create ?? t("common.create")
      : labels.save ?? t("common.save");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && !deleting && canSubmit) void onSubmit();
  }

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <form aria-busy={busy || deleting} onSubmit={submit}>
      <fieldset disabled={busy || deleting} className="min-w-0">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-6">
          {busy || deleting
            ? <span aria-disabled="true" className="text-sm font-bold text-[var(--muted)] opacity-60">{labels.back ?? t("common.previous")}</span>
            : <Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={backHref}>{labels.back ?? t("common.previous")}</Link>}
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-black">{title}</h1>
              {description ? <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
            </div>
            <EditorActions
              busy={busy}
              canDelete={canDelete}
              canSubmit={canSubmit}
              cancelHref={cancelHref}
              deleting={deleting}
              labels={labels}
              submitText={submitText}
              onDelete={onDelete}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6">
        <div className="min-w-0 space-y-5">
          {languageSwitcher}
          {reviewPanel}
          {statusMessage ? <div role="status">{statusMessage}</div> : null}
          {children}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-5">
            <EditorActions
              busy={busy}
              canDelete={canDelete}
              canSubmit={canSubmit}
              cancelHref={cancelHref}
              deleting={deleting}
              labels={labels}
              submitText={submitText}
              onDelete={onDelete}
            />
          </div>
        </div>
        {aside ? <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">{aside}</aside> : null}
      </div>
      </fieldset>
    </form>
  </main>;
}

function EditorActions({
  busy,
  canDelete,
  canSubmit,
  cancelHref,
  deleting,
  labels,
  submitText,
  onDelete,
}: {
  busy: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  cancelHref: string;
  deleting: boolean;
  labels: EditorShellLabels;
  submitText: string;
  onDelete?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {canDelete && onDelete ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={busy || deleting} type="button" onClick={() => void onDelete()}>{deleting ? labels.deleting ?? t("common.loading") : labels.delete ?? t("common.delete")}</button> : null}
    {busy || deleting
      ? <span aria-disabled="true" className="button-secondary pointer-events-none opacity-60">{labels.cancel ?? t("common.cancel")}</span>
      : <Link className="button-secondary focus-ring" href={cancelHref}>{labels.cancel ?? t("common.cancel")}</Link>}
    <button className="button-primary focus-ring" disabled={busy || deleting || !canSubmit} type="submit">{submitText}</button>
  </div>;
}
