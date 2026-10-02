"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { parseActivityCleanupObjects } from "../_lib/activity-cleanup-filter.mts";
import { useI18n } from "../_lib/i18n-provider";

type Policy = { enabled: boolean; allowDelete: boolean; retentionDays: number; batchSize: number };
type RetentionConfig = { enabled: boolean; runIntervalMinutes: number; default: Policy; actions: Record<string, Policy> };
type RetentionResponse = { config: RetentionConfig; actions: string[]; objectTypes: string[] };
type AdminUserOption = { id: string; username: string };
type CleanupExecution = { deletedCount: number; status: "completed" | "audit_pending" };
type CleanupPreview = {
  previewId: string;
  confirmationToken: string;
  confirmationText: string;
  dangerous: boolean;
  matchedCount: number;
  byAction: Record<string, number>;
  byObjectType: Record<string, number>;
  byUser: Record<string, number>;
  samples: Array<Record<string, unknown>>;
  snapshotBefore: string;
  expiresInSeconds: number;
};

const emptyPolicy: Policy = { enabled: false, allowDelete: false, retentionDays: 365, batchSize: 1000 };

export function AdminActivityRetentionPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<RetentionResponse | null>(null);
  const [config, setConfig] = useState<RetentionConfig | null>(null);
  const [selectedActions, setSelectedActions] = useState<string[]>(["view"]);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<AdminUserOption[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUserOption[]>([]);
  const [objectsText, setObjectsText] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const filterKey = JSON.stringify([selectedUsers.map((item) => item.id), objectsText, selectedObjectTypes, selectedActions, from, to]);
  const currentPreview = previewKey === filterKey ? preview : null;

  useEffect(() => {
    let cancelled = false;
    apiRequest<RetentionResponse>("/api/v1/admin/activity-logs/retention", {}, token)
      .then((value) => { if (!cancelled) { setData(value); setConfig(value.config); } })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : translation.current("admin.activityRetention.loadFailed")); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    const query = userQuery.trim();
    if (query.length < 2) {
      const timer = window.setTimeout(() => setUserResults([]), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiRequest<Array<{ id: string; username: string }>>(`/api/v1/admin/users?q=${encodeURIComponent(query)}`, {}, token)
        .then((items) => { if (!cancelled) setUserResults(items.map((item) => ({ id: item.id, username: item.username }))); })
        .catch(() => { if (!cancelled) setUserResults([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [token, userQuery]);

  const parsedObjects = useMemo(() => parseActivityCleanupObjects(objectsText), [objectsText]);

  function policyFor(action: string) {
    return config?.actions[action] ?? config?.default ?? emptyPolicy;
  }

  function updatePolicy(action: string, patch: Partial<Policy>) {
    setConfig((current) => current ? { ...current, actions: { ...current.actions, [action]: { ...policyFor(action), ...patch } } } : current);
  }

  async function saveConfig() {
    if (!config) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await apiRequest<RetentionConfig>("/api/v1/admin/activity-logs/retention", { method: "PUT", body: JSON.stringify(config) }, token);
      setConfig(saved);
      setMessage(t("admin.activityRetention.saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.activityRetention.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function createPreview() {
    if (!selectedActions.length) return;
    if (parsedObjects.invalidEntries.length) {
      setMessage(t("admin.activityRetention.invalidObjects", { count: parsedObjects.invalidEntries.length }));
      return;
    }
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const result = await apiRequest<CleanupPreview>("/api/v1/admin/activity-logs/cleanup/preview", {
        method: "POST",
        body: JSON.stringify({
          users: selectedUsers.map((item) => item.id), objects: parsedObjects.objects, objectTypes: selectedObjectTypes,
          actions: selectedActions, from: localDateTimeToRFC3339(from), to: localDateTimeToRFC3339(to),
        }),
      }, token);
      setPreview(result);
      setPreviewKey(filterKey);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.activityRetention.previewFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function executeCleanup() {
    if (!currentPreview || confirmation !== currentPreview.confirmationText) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<CleanupExecution>("/api/v1/admin/activity-logs/cleanup/execute", {
        method: "POST",
        body: JSON.stringify({ previewId: currentPreview.previewId, confirmationToken: currentPreview.confirmationToken, confirmation }),
      }, token);
      setMessage(result.status === "audit_pending"
        ? t("admin.activityRetention.auditPending", { count: result.deletedCount })
        : t("admin.activityRetention.deleted", { count: result.deletedCount }));
      setPreview(null);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.activityRetention.executeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) return <section className="surface mt-4 p-5 text-sm text-[var(--muted)]">{message || t("common.loading")}</section>;
  return (
    <section className="surface mt-4 grid gap-6 p-5">
      <div><h2 className="text-xl font-black">{t("admin.activityRetention.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.activityRetention.description")}</p></div>
      {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">{message}</p> : null}

      <div className="rounded-lg border border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">{t("admin.activityRetention.automatic")}</h3><p className="text-sm text-[var(--muted)]">{t("admin.activityRetention.automaticDescription")}</p></div><button className="button-primary focus-ring" disabled={busy} type="button" onClick={() => void saveConfig()}>{t("common.save")}</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold"><input checked={config.enabled} type="checkbox" onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />{t("admin.activityRetention.enableAutomatic")}</label>
          <label className="text-sm font-semibold">{t("admin.activityRetention.interval")}<input className="field mt-1" min={10} max={1440} type="number" value={config.runIntervalMinutes} onChange={(event) => setConfig({ ...config, runIntervalMinutes: Number(event.target.value) })} /></label>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="text-[var(--muted)]"><th className="border-b p-2">{t("admin.activityRetention.action")}</th><th>{t("admin.activityRetention.enabled")}</th><th>{t("admin.activityRetention.allowDelete")}</th><th>{t("admin.activityRetention.days")}</th><th>{t("admin.activityRetention.batch")}</th></tr></thead><tbody><PolicyRow action={t("admin.activityRetention.defaultPolicy")} policy={config.default} onChange={(patch) => setConfig({ ...config, default: { ...config.default, ...patch } })} />{data.actions.map((action) => <PolicyRow action={action} key={action} policy={policyFor(action)} onChange={(patch) => updatePolicy(action, patch)} />)}</tbody></table></div>
      </div>

      <div className="rounded-lg border border-[var(--line)] p-4">
        <h3 className="font-black">{t("admin.activityRetention.manual")}</h3><p className="text-sm text-[var(--muted)]">{t("admin.activityRetention.manualDescription")}</p>
        <fieldset className="mt-4"><legend className="text-sm font-black">{t("admin.activityRetention.actions")}</legend><div className="mt-2 flex flex-wrap gap-2">{data.actions.map((action) => <label className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${policyFor(action).allowDelete ? "border-[var(--line)]" : "border-[var(--line)] opacity-45"}`} key={action}><input className="mr-1.5" checked={selectedActions.includes(action)} disabled={!policyFor(action).allowDelete} type="checkbox" onChange={() => setSelectedActions((current) => toggleValue(current, action))} />{action}</label>)}</div></fieldset>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div><label className="text-sm font-black">{t("admin.activityRetention.users")}<input className="field mt-1" value={userQuery} placeholder={t("admin.activityRetention.userSearch")} onChange={(event) => setUserQuery(event.target.value)} /></label>{userResults.length ? <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--line)]">{userResults.map((item) => <button className="focus-ring flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-[var(--panel-subtle)]" key={item.id} type="button" onClick={() => { setSelectedUsers((current) => current.some((value) => value.id === item.id) ? current : [...current, item]); setUserQuery(""); setUserResults([]); }}><span>{item.username}</span><code>{item.id}</code></button>)}</div> : null}<div className="mt-2 flex flex-wrap gap-2">{selectedUsers.map((item) => <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" key={item.id} type="button" onClick={() => setSelectedUsers((current) => current.filter((value) => value.id !== item.id))}>{item.username} · {item.id} ×</button>)}</div></div>
          <label className="text-sm font-black">{t("admin.activityRetention.objects")}<textarea className="field mt-1 min-h-28 font-mono text-xs" value={objectsText} placeholder={t("admin.activityRetention.objectsPlaceholder")} onChange={(event) => setObjectsText(event.target.value)} /><span className="mt-1 block font-normal text-[var(--muted)]">{t("admin.activityRetention.objectsParsed", { count: parsedObjects.objects.length })}</span></label>
        </div>
        <fieldset className="mt-4"><legend className="text-sm font-black">{t("admin.activityRetention.objectTypes")}</legend><div className="mt-2 flex flex-wrap gap-2">{data.objectTypes.map((value) => <label className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs" key={value}><input className="mr-1.5" checked={selectedObjectTypes.includes(value)} type="checkbox" onChange={() => setSelectedObjectTypes((current) => toggleValue(current, value))} />{value}</label>)}</div></fieldset>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-black">{t("admin.activityRetention.from")}<input className="field mt-1" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-sm font-black">{t("admin.activityRetention.to")}<input className="field mt-1" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
        <button className="button-secondary focus-ring mt-4" disabled={busy || !selectedActions.length} type="button" onClick={() => void createPreview()}>{t("admin.activityRetention.preview")}</button>
      </div>

      {currentPreview ? <div className={`rounded-lg border p-4 ${currentPreview.dangerous ? "border-red-500" : "border-[var(--line)]"}`}><h3 className="font-black">{t("admin.activityRetention.previewResult")}</h3><p className="mt-2 text-3xl font-black">{currentPreview.matchedCount.toLocaleString()}</p><p className="text-sm text-[var(--muted)]">{t("admin.activityRetention.matched")}</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><CountGroup title={t("admin.activityRetention.byAction")} values={currentPreview.byAction} /><CountGroup title={t("admin.activityRetention.byObjectType")} values={currentPreview.byObjectType} /><CountGroup title={t("admin.activityRetention.byUser")} values={currentPreview.byUser} /></div>{currentPreview.samples.length ? <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-[var(--panel-subtle)] p-3 text-xs">{JSON.stringify(currentPreview.samples, null, 2)}</pre> : null}<label className="mt-4 block text-sm font-black">{t("admin.activityRetention.confirm", { text: currentPreview.confirmationText })}<input className="field mt-1" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="button-primary focus-ring mt-3 border-red-600 bg-red-600" disabled={busy || confirmation !== currentPreview.confirmationText} type="button" onClick={() => void executeCleanup()}>{t("admin.activityRetention.execute")}</button></div> : null}
    </section>
  );
}

function CountGroup({ title, values }: { title: string; values: Record<string, number> }) {
  return <div className="rounded-lg bg-[var(--panel-subtle)] p-3"><strong className="text-sm">{title}</strong>{Object.entries(values).map(([key, value]) => <div className="mt-1 flex justify-between gap-2 text-xs" key={key}><code className="truncate">{key}</code><span>{value}</span></div>)}</div>;
}

function PolicyRow({ action, policy, onChange }: { action: string; policy: Policy; onChange: (patch: Partial<Policy>) => void }) {
  return <tr><th className="border-b border-[var(--line)] p-2 font-mono">{action}</th><td><input checked={policy.enabled} type="checkbox" onChange={(event) => onChange({ enabled: event.target.checked })} /></td><td><input checked={policy.allowDelete} type="checkbox" onChange={(event) => onChange({ allowDelete: event.target.checked })} /></td><td><input className="field w-28" min={1} max={3650} type="number" value={policy.retentionDays} onChange={(event) => onChange({ retentionDays: Number(event.target.value) })} /></td><td><input className="field w-28" min={100} max={5000} type="number" value={policy.batchSize} onChange={(event) => onChange({ batchSize: Number(event.target.value) })} /></td></tr>;
}

function toggleValue(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function localDateTimeToRFC3339(value: string) { return value ? new Date(value).toISOString() : ""; }
