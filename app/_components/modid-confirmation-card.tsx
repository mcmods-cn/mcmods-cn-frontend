"use client";

import type { ModExportJob } from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";

type MODIDConfirmationCardProps = {
  job: ModExportJob;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MODIDConfirmationCard({ job, busy, onCancel, onConfirm }: MODIDConfirmationCardProps) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="modid-confirm-title"
      className="mt-4 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4"
      role="alertdialog"
    >
      <h3 className="font-black" id="modid-confirm-title">{t("mods.exportImport.modidConfirmation.title")}</h3>
      <p className="mt-2 text-sm leading-6">
        {t("mods.exportImport.modidConfirmation.description", { mod: job.modSiteId })}
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.modidConfirmation.configured")}</dt>
          <dd className="mt-1 font-mono">{job.configuredModids?.join(" / ") || t("mods.exportImport.modidConfirmation.none")}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--muted)]">{t("mods.exportImport.modidConfirmation.detected")}</dt>
          <dd className="mt-1 font-mono">{job.primaryDetectedModid || t("mods.exportImport.modidConfirmation.unknown")}</dd>
        </div>
      </dl>
      {job.detectedModids?.length ? (
        <ul className="mt-4 grid gap-1 rounded-md bg-[var(--panel)] p-3 text-xs">
          {job.detectedModids.map((candidate) => (
            <li className="flex justify-between gap-3" key={candidate.id}>
              <code>{candidate.id}</code>
              <span>{candidate.count} · {Math.round(candidate.ratio * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>
          {t("mods.exportImport.modidConfirmation.cancel")}
        </button>
        <button
          className="focus-ring rounded-lg bg-[var(--red)] px-4 py-2 font-black text-white disabled:opacity-50"
          disabled={busy || !job.modidAnalysisHash}
          type="button"
          onClick={onConfirm}
        >
          {t("mods.exportImport.modidConfirmation.continue")}
        </button>
      </div>
    </section>
  );
}
