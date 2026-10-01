"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type Source = { source_type: string; external_project_id: string; external_project_url: string; verified_at: string };
type Setting = {
  update_kind: "minecraft_versions" | "changelog" | "site_downloads";
  source_type: string;
  interval_code: "week" | "month" | "quarter" | "half_year" | "year" | "never";
  enabled: boolean;
  next_run_at?: string;
  last_run_at?: string;
  last_status: string;
  last_error_code: string;
  last_error: string;
  license_override: boolean;
  license_override_reason: string;
  license_override_source: string;
};
type AutomationData = { project: { id: string; type: string; url: string }; sources: Source[]; settings: Setting[] };

export function ProjectAutoUpdateSettings({ projectType, projectId, token }: { projectType: string; projectId: string; token: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<AutomationData>();
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const base = `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/automation`;
  const load = useCallback(async () => {
    try {
      const [value, history] = await Promise.all([apiRequest<AutomationData>(base, {}, token), apiRequest<{ items: Array<Record<string, unknown>> }>(`${base}/runs`, {}, token)]);
      setData({ ...value, settings: normalizeSettings(value.settings, value.sources) }); setRuns(history.items); setMessage("");
    } catch (error) { setMessage(errorMessage(error)); }
  }, [base, token]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  async function bind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    try { await apiRequest(`${base}/sources`, { method: "POST", body: JSON.stringify({ sourceType: form.get("sourceType"), url: form.get("url") }) }, token); element.reset(); await load(); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  async function save() {
    if (!data) return; setSaving(true);
    try { await apiRequest(base, { method: "PUT", body: JSON.stringify({ items: data.settings.map((item) => ({ kind: item.update_kind, sourceType: item.source_type, interval: item.interval_code, enabled: item.enabled, licenseOverride: item.license_override, licenseOverrideReason: item.license_override_reason, licenseOverrideSource: item.license_override_source })) }) }, token); await load(); setMessage(t("projectAutomation.saved")); }
    catch (error) { setMessage(errorMessage(error)); } finally { setSaving(false); }
  }
  async function run(kind: Setting["update_kind"]) { try { await apiRequest(`${base}/runs`, { method: "POST", body: JSON.stringify({ kind }) }, token); await load(); setMessage(t("projectAutomation.queued")); } catch (error) { setMessage(errorMessage(error)); } }
  function update(kind: string, values: Partial<Setting>) { if (!data) return; setData({ ...data, settings: data.settings.map((item) => item.update_kind === kind ? { ...item, ...values } : item) }); }
  if (!data) return <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("projectAutomation.title")}</h2><p className={`mt-3 text-sm ${message ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>{message || t("common.loading")}</p></section>;
  return <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{t("projectAutomation.title")}</h2><p className="mt-2 text-sm text-[var(--muted)]">{t("projectAutomation.description")}</p>{message ? <p className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}
    <form className="mt-5 flex flex-wrap gap-2" onSubmit={bind}><select className="field w-auto" name="sourceType"><option value="modrinth">Modrinth</option><option value="curseforge">CurseForge</option><option value="github">GitHub</option></select><input className="field min-w-64 flex-1" name="url" required type="url" placeholder={t("projectAutomation.sourceUrl")} /><button className="button-secondary focus-ring" type="submit">{t("projectAutomation.verifySource")}</button></form>
    <div className="mt-3 flex flex-wrap gap-2">{data.sources.map((source) => <a className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold text-[var(--accent)]" href={source.external_project_url} key={source.source_type} rel="noreferrer" target="_blank">{source.source_type} · {source.external_project_id} ↗</a>)}</div>
    <div className="mt-5 grid gap-4">{data.settings.map((item) => <article className="rounded-xl border border-[var(--line)] p-4" key={item.update_kind}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{t(`projectAutomation.kinds.${item.update_kind}`)}</h3><p className="mt-1 text-xs text-[var(--muted)]">{item.last_status}{item.last_error ? ` · ${item.last_error}` : ""}</p></div><button className="button-secondary focus-ring" disabled={!item.source_type} type="button" onClick={() => void run(item.update_kind)}>{t("projectAutomation.runNow")}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-bold">{t("projectAutomation.source")}<select className="field" value={item.source_type} onChange={(event) => update(item.update_kind, { source_type: event.target.value })}><option value="">—</option>{data.sources.filter((source) => item.update_kind !== "minecraft_versions" || source.source_type !== "github").map((source) => <option key={source.source_type} value={source.source_type}>{source.source_type}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">{t("projectAutomation.interval")}<select className="field" value={item.interval_code} onChange={(event) => update(item.update_kind, { interval_code: event.target.value as Setting["interval_code"] })}>{["week", "month", "quarter", "half_year", "year", "never"].map((value) => <option key={value} value={value}>{t(`projectAutomation.intervals.${value}`)}</option>)}</select></label><label className="mt-7 flex gap-2 font-bold"><input checked={item.enabled} type="checkbox" onChange={(event) => update(item.update_kind, { enabled: event.target.checked })} />{t("common.enabled")}</label></div>{item.update_kind === "site_downloads" ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="flex gap-2 font-bold"><input checked={item.license_override} type="checkbox" onChange={(event) => update(item.update_kind, { license_override: event.target.checked })} />{t("projectAutomation.licenseOverride")}</label>{item.license_override ? <><input className="field" value={item.license_override_reason} onChange={(event) => update(item.update_kind, { license_override_reason: event.target.value })} placeholder={t("projectAutomation.overrideReason")} /><input className="field sm:col-span-2" value={item.license_override_source} onChange={(event) => update(item.update_kind, { license_override_source: event.target.value })} placeholder={t("projectAutomation.overrideSource")} /></> : null}</div> : null}</article>)}</div>
    <button className="button-primary focus-ring mt-5" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("common.saving") : t("common.save")}</button>
    <details className="mt-6"><summary className="cursor-pointer font-black">{t("projectAutomation.runHistory")}</summary><div className="mt-3 grid gap-2">{runs.map((run, index) => <pre className="overflow-auto rounded-lg bg-[var(--panel-subtle)] p-3 text-xs" key={String(run.public_id || index)}>{JSON.stringify(run, null, 2)}</pre>)}</div></details>
  </section>;
}

function normalizeSettings(settings: Setting[], sources: Source[]) {
  const defaults: Setting[] = [
    defaultSetting("minecraft_versions", "quarter"), defaultSetting("changelog", "never"), defaultSetting("site_downloads", "never"),
  ];
  return defaults.map((fallback) => ({ ...fallback, ...(settings.find((item) => item.update_kind === fallback.update_kind) || {}), source_type: settings.find((item) => item.update_kind === fallback.update_kind)?.source_type || sources[0]?.source_type || "" }));
}
function defaultSetting(kind: Setting["update_kind"], interval: Setting["interval_code"]): Setting { return { update_kind: kind, source_type: "", interval_code: interval, enabled: false, last_status: "never", last_error_code: "", last_error: "", license_override: false, license_override_reason: "", license_override_source: "" }; }
function errorMessage(value: unknown) { return value instanceof Error ? value.message : String(value); }
