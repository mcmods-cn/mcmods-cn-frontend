"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { formatMinecraftLanguages } from "../_lib/minecraft-languages";
import { formatBytes } from "../_lib/oss-upload";
import { ServerCatalogSettings, ServerLink, ServerMod } from "../_lib/server-api";
import { mergeServerReviewPage, serverReviewPagePath } from "../_lib/server-review-pagination.mts";
import { MarkdownRenderer } from "./markdown-renderer";

type ServerReviewSummary = {
  id: string;
  name: string;
  address: string;
  shortDescription: string;
  minecraftVersions: string[];
  dedicatedClient: boolean;
  languages: string[];
  primaryTag: string;
  hasWhitelist: boolean;
  onlineMode: boolean;
  modded: boolean;
  loader: string;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewNote: string;
  submitterId: string;
  submitterUsername: string;
  proofFileCount: number;
  linkCount: number;
  modCount: number;
  createdAt: string;
  reviewedAt?: string;
};

type ServerReviewDetail = ServerReviewSummary & {
  bodyMarkdown: string;
  proofText: string;
  proofFiles: Array<{ id: string; originalName: string; sizeBytes: number }>;
  links: ServerLink[];
  mods: ServerMod[];
};

const serverReviewPageSize = 50;

export function ServerReviewQueuePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<ServerReviewSummary[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyID, setBusyID] = useState("");
  const [message, setMessage] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedID, setExpandedID] = useState("");
  const [details, setDetails] = useState<Record<string, ServerReviewDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailLoadingID, setDetailLoadingID] = useState("");
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const detailControllers = useRef(new Map<string, AbortController>());

  const load = useCallback(async (cursor = "") => {
    const append = Boolean(cursor);
    const generation = ++requestGeneration.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setItems([]);
      setNextCursor("");
      setExpandedID("");
      setDetails({});
      setDetailErrors({});
      setDetailLoadingID("");
      for (const detailController of detailControllers.current.values()) detailController.abort();
      detailControllers.current.clear();
    }
    try {
      const response = await apiRequest<{ items: ServerReviewSummary[]; hasMore: boolean; nextCursor: string }>(
        serverReviewPagePath(status, serverReviewPageSize, cursor),
        { signal: controller.signal },
        token,
      );
      if (generation !== requestGeneration.current) return;
      setItems((current) => append ? mergeServerReviewPage(current, response.items) : response.items);
      setNextCursor(response.hasMore ? response.nextCursor : "");
      setMessage("");
    } catch (error) {
      if (generation !== requestGeneration.current || (error as { name?: string }).name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : t("admin.serverReviews.loadFailed"));
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [status, t, token]);

  useEffect(() => {
    const controllers = detailControllers.current;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestGeneration.current += 1;
      requestController.current?.abort();
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, [load]);

  async function loadDetail(item: ServerReviewSummary) {
    detailControllers.current.get(item.id)?.abort();
    const controller = new AbortController();
    detailControllers.current.set(item.id, controller);
    setDetailLoadingID(item.id);
    setDetailErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      const detail = await apiRequest<ServerReviewDetail>(`/api/v1/admin/server-reviews/${item.id}`, { signal: controller.signal }, token);
      if (detailControllers.current.get(item.id) !== controller) return;
      if (detail.id !== item.id) throw new Error("Server review detail identity mismatch");
      setDetails((current) => ({ ...current, [item.id]: detail }));
    } catch (error) {
      if (detailControllers.current.get(item.id) !== controller || (error as { name?: string }).name === "AbortError") return;
      setDetailErrors((current) => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : t("admin.serverReviews.detailLoadFailed"),
      }));
    } finally {
      if (detailControllers.current.get(item.id) === controller) {
        detailControllers.current.delete(item.id);
        setDetailLoadingID((current) => current === item.id ? "" : current);
      }
    }
  }

  function toggleDetails(item: ServerReviewSummary) {
    if (expandedID === item.id) {
      detailControllers.current.get(item.id)?.abort();
      detailControllers.current.delete(item.id);
      setExpandedID("");
      return;
    }
    setExpandedID(item.id);
    if (!details[item.id]) void loadDetail(item);
  }

  async function review(item: ServerReviewSummary, nextStatus: "approved" | "rejected") {
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
        {items.map((item) => {
          const detail = details[item.id];
          const expanded = expandedID === item.id;
          return <article key={item.id} className="surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">{item.name}</h3>
                <p className="mt-1 font-mono text-sm">{item.address}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {item.submitterUsername} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                </p>
              </div>
              <Link className="button-secondary focus-ring" href={`/servers/${item.id}`} prefetch={false} target="_blank">{t("admin.serverReviews.viewPage")} ↗</Link>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{item.shortDescription || t("servers.noSummary")}</p>
            <dl className="mt-4 grid gap-2 rounded-lg bg-[var(--panel-subtle)] p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Fact label={t("servers.version")} value={item.minecraftVersions.join(" · ")} />
              <Fact label={t("servers.detail.language")} value={formatMinecraftLanguages(item.languages)} />
              <Fact label={t("servers.detail.category")} value={t(`servers.tags.${item.primaryTag}`)} />
              <Fact label={t("servers.modded")} value={t(item.modded ? "common.yes" : "common.no")} />
              <Fact label={t("servers.whitelist")} value={t(item.hasWhitelist ? "common.yes" : "common.no")} />
              <Fact label={t("servers.onlineMode")} value={t(item.onlineMode ? "common.yes" : "common.no")} />
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted)]">
                {t("admin.serverReviews.proofFileCount", { count: item.proofFileCount })} · {t("admin.serverReviews.modCount", { count: item.modCount })} · {t("admin.serverReviews.linkCount", { count: item.linkCount })}
              </p>
              <button aria-expanded={expanded} className="button-secondary focus-ring" type="button" onClick={() => toggleDetails(item)}>
                {t(expanded ? "admin.serverReviews.hideDetails" : "admin.serverReviews.showDetails")}
              </button>
            </div>
            {expanded ? <section className="mt-4 rounded-lg border border-[var(--line)] p-4">
              {detailLoadingID === item.id ? <p className="text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
              {detailErrors[item.id] ? <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
                <p className="text-sm font-bold text-[var(--danger)]">{detailErrors[item.id]}</p>
                <button className="button-secondary focus-ring" type="button" onClick={() => void loadDetail(item)}>{t("common.retry")}</button>
              </div> : null}
              {detail ? <div className="grid gap-5">
                <section>
                  <h4 className="text-sm font-black">{t("admin.serverReviews.body")}</h4>
                  <div className="markdown-preview mt-3"><MarkdownRenderer emptyText="" markdown={detail.bodyMarkdown} /></div>
                </section>
                <section>
                  <h4 className="text-sm font-black">{t("admin.serverReviews.proof")}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.proofText}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.proofFiles.map((file) => <button key={file.id} className="button-secondary focus-ring" type="button" onClick={() => void openProof(item.id, file.id)}>{file.originalName} · {formatBytes(file.sizeBytes)}</button>)}
                  </div>
                </section>
                <section>
                  <h4 className="text-sm font-black">{t("admin.serverReviews.linksTitle")}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detail.links.map((link) => <a className="button-secondary focus-ring" href={link.url} key={`${link.kind}:${link.url}`} rel="noreferrer" target="_blank">{link.label || link.kind} ↗</a>)}
                  </div>
                </section>
                <section>
                  <h4 className="text-sm font-black">{t("admin.serverReviews.modsTitle")}</h4>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {detail.mods.map((mod) => <span className="rounded-lg bg-[var(--panel-subtle)] px-3 py-2" key={`${mod.id}:${mod.version ?? ""}`}>{mod.modName || mod.modId || mod.id}{mod.version ? ` · ${mod.version}` : ""}</span>)}
                  </div>
                </section>
              </div> : null}
            </section> : null}
            {status === "pending" ? (
              <>
                <textarea className="field mt-4 min-h-20 w-full resize-y" placeholder={t("admin.serverReviews.notePlaceholder")} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                <div className="mt-3 flex justify-end gap-2">
                  <button className="button-secondary focus-ring text-[var(--danger)]" disabled={busyID === item.id} type="button" onClick={() => void review(item, "rejected")}>{t("admin.serverReviews.reject")}</button>
                  <button className="button-primary focus-ring" disabled={busyID === item.id} type="button" onClick={() => void review(item, "approved")}>{t("admin.serverReviews.approve")}</button>
                </div>
              </>
            ) : item.reviewNote ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">{item.reviewNote}</p> : null}
          </article>;
        })}
        {loading ? <div className="surface grid min-h-52 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("common.loading")}</div> : null}
        {!loading && !items.length ? <div className="surface grid min-h-52 place-items-center p-6 text-center font-bold text-[var(--muted)]">{t("admin.serverReviews.empty")}</div> : null}
      </div>
      {nextCursor ? <button className="button-secondary focus-ring mt-5 w-full" disabled={loadingMore} type="button" onClick={() => void load(nextCursor)}>{loadingMore ? t("common.loading") : t("admin.serverReviews.loadMore")}</button> : null}
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
