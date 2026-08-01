"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes } from "../_lib/oss-upload";
import { ServerCatalogSettings, ServerLink, ServerMod } from "../_lib/server-api";

type ServerReviewItem = {
  id: string;
  name: string;
  address: string;
  shortDescription: string;
  bodyMarkdown: string;
  minecraftVersions: string[];
  dedicatedClient: boolean;
  languages: string[];
  primaryTag: string;
  hasWhitelist: boolean;
  onlineMode: boolean;
  modded: boolean;
  loader: string;
  proofText: string;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewNote: string;
  submitterId: string;
  submitterUsername: string;
  submitterName: string;
  proofFiles: Array<{ id: string; originalName: string; sizeBytes: number }>;
  links: ServerLink[];
  mods: ServerMod[];
  createdAt: string;
  reviewedAt?: string;
};

export function ServerReviewQueuePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<ServerReviewItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyID, setBusyID] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ items: ServerReviewItem[] }>(`/api/v1/admin/server-reviews?status=${status}`, {}, token);
      setItems(response.items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.serverReviews.loadFailed"));
    }
  }, [status, t, token]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function review(item: ServerReviewItem, nextStatus: "approved" | "rejected") {
    setBusyID(item.id);
    setMessage("");
    try {
      await apiRequest(`/api/v1/admin/server-reviews/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, note: notes[item.id] ?? "" }),
      }, token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.serverReviews.reviewFailed"));
    } finally {
      setBusyID("");
    }
  }

  async function openProof(serverID: string, fileID: string) {
    try {
      const response = await apiRequest<{ url: string }>(`/api/v1/admin/server-reviews/${serverID}/attachments/${fileID}/presign`, { method: "POST" }, token);
      window.open(response.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.serverReviews.attachmentFailed"));
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-[var(--muted)]">{t("admin.serverReviews.description")}</p>
        <select className="field min-w-40" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="pending">{t("admin.serverReviews.pending")}</option>
          <option value="approved">{t("admin.serverReviews.approved")}</option>
          <option value="rejected">{t("admin.serverReviews.rejected")}</option>
        </select>
      </div>
      {message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">{item.name}</h3>
                <p className="mt-1 font-mono text-sm">{item.address}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {item.submitterName || item.submitterUsername} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                </p>
              </div>
              <Link className="button-secondary focus-ring" href={`/servers/${item.id}`} target="_blank">{t("admin.serverReviews.viewPage")} ↗</Link>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{item.shortDescription || t("servers.noSummary")}</p>
            <dl className="mt-4 grid gap-2 rounded-lg bg-[var(--panel-subtle)] p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Fact label={t("servers.version")} value={item.minecraftVersions.join(" · ")} />
              <Fact label={t("servers.detail.language")} value={item.languages.join(" · ")} />
              <Fact label={t("servers.detail.category")} value={t(`servers.tags.${item.primaryTag}`)} />
              <Fact label={t("servers.modded")} value={t(item.modded ? "common.yes" : "common.no")} />
              <Fact label={t("servers.whitelist")} value={t(item.hasWhitelist ? "common.yes" : "common.no")} />
              <Fact label={t("servers.onlineMode")} value={t(item.onlineMode ? "common.yes" : "common.no")} />
            </dl>
            <section className="mt-4 rounded-lg border border-[var(--line)] p-4">
              <h4 className="text-sm font-black">{t("admin.serverReviews.proof")}</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.proofText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.proofFiles.map((file) => <button key={file.id} className="button-secondary focus-ring" type="button" onClick={() => void openProof(item.id, file.id)}>{file.originalName} · {formatBytes(file.sizeBytes)}</button>)}
              </div>
            </section>
            <p className="mt-4 text-sm text-[var(--muted)]">{t("admin.serverReviews.modCount", { count: item.mods.length })} · {t("admin.serverReviews.linkCount", { count: item.links.length })}</p>
            {status === "pending" ? (
              <>
                <textarea className="field mt-4 min-h-20 w-full resize-y" placeholder={t("admin.serverReviews.notePlaceholder")} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                <div className="mt-3 flex justify-end gap-2">
                  <button className="button-secondary focus-ring text-[var(--danger)]" disabled={busyID === item.id} type="button" onClick={() => void review(item, "rejected")}>{t("admin.serverReviews.reject")}</button>
                  <button className="button-primary focus-ring" disabled={busyID === item.id} type="button" onClick={() => void review(item, "approved")}>{t("admin.serverReviews.approve")}</button>
                </div>
              </>
            ) : item.reviewNote ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">{item.reviewNote}</p> : null}
          </article>
        ))}
        {!items.length ? <div className="surface grid min-h-52 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("admin.serverReviews.empty")}</div> : null}
      </div>
    </section>
  );
}

export function ServerSettingsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ServerCatalogSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<ServerCatalogSettings>("/api/v1/admin/server-settings", {}, token)
      .then((result) => { if (!cancelled) setSettings(result); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("admin.serverSettings.loadFailed")); });
    return () => { cancelled = true; };
  }, [t, token]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await apiRequest<ServerCatalogSettings>("/api/v1/admin/server-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      }, token);
      setSettings(saved);
      setMessage(t("admin.serverSettings.saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.serverSettings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <section className="surface min-h-52 p-5">{message || t("common.loading")}</section>;
  return (
    <section className="surface max-w-3xl p-5">
      <p className="text-sm leading-6 text-[var(--muted)]">{t("admin.serverSettings.description")}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumberField label={t("admin.serverSettings.maxFiles")} max={20} min={1} value={settings.maxProofFiles} onChange={(maxProofFiles) => setSettings({ ...settings, maxProofFiles })} />
        <NumberField label={t("admin.serverSettings.maxMegabytes")} max={100} min={1} value={settings.maxProofTotalBytes / 1024 / 1024} onChange={(value) => setSettings({ ...settings, maxProofTotalBytes: Math.round(value * 1024 * 1024) })} />
        <NumberField label={t("admin.serverSettings.nameLength")} max={160} min={20} value={settings.nameMaxLength} onChange={(nameMaxLength) => setSettings({ ...settings, nameMaxLength })} />
        <NumberField label={t("admin.serverSettings.summaryLength")} max={1000} min={80} value={settings.summaryMaxLength} onChange={(summaryMaxLength) => setSettings({ ...settings, summaryMaxLength })} />
        <NumberField label={t("admin.serverSettings.historyDays")} max={90} min={7} value={settings.historyDays} onChange={(historyDays) => setSettings({ ...settings, historyDays })} />
      </div>
      {message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 flex justify-end"><button className="button-primary focus-ring" disabled={busy} type="button" onClick={() => void save()}>{busy ? t("common.saving") : t("common.save")}</button></div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold text-[var(--muted)]">{label}</dt><dd className="mt-1 font-bold">{value || "—"}</dd></div>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label><span className="mb-2 block text-sm font-black">{label}</span><input className="field w-full" max={max} min={min} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
