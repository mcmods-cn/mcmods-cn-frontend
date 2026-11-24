"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";

type Source = {
  sourceType: string;
  externalProjectId: string;
  externalProjectUrl: string;
  verifiedAt: string;
};

type UpdateKind = "minecraft_versions" | "changelog" | "site_downloads";
type UpdateInterval = "week" | "month" | "quarter" | "half_year" | "year" | "never";

type Setting = {
  updateKind: UpdateKind;
  sourceType: string;
  interval: UpdateInterval;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus: string;
  lastErrorCode: string;
  lastError: string;
  licenseOverride: boolean;
  licenseOverrideReason: string;
  licenseOverrideSource: string;
};

type AutomationRun = {
  id: string;
  updateKind: UpdateKind;
  status: string;
  attempts: number;
  result: unknown;
  lastErrorCode: string;
  lastError: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

type AutomationData = {
  project: { id: string; type: string; url: string };
  sources: Source[];
  settings: Setting[];
};

const updateIntervals: UpdateInterval[] = ["week", "month", "quarter", "half_year", "year", "never"];

type SettingsProps = { projectType: string; projectId: string; token: string };

export function ProjectAutoUpdateSettings(props: SettingsProps) {
  const { user } = useAuthSnapshot();
  const scoped = hasPermission(user, `project.edit.${props.projectId}`) || hasPermission(user, "admin.*");
  const allowed = (permission: string) => scoped || hasPermission(user, permission);
  const canRead = allowed("project.auto_update.view");
  const canWrite = canRead && allowed("project.auto_update.configure");
  const canBind = allowed("project.external_source.bind");
  const canRun = allowed("project.auto_update.run");
  const canReadLogs = allowed("project.auto_update.view_logs");
  const canOverride = hasPermission(user, "project.auto_update.redistribution_override");
  if (!canRead && !canReadLogs && !canBind && !canRun) return null;
  return <ProjectAutoUpdateSettingsSession key={`${user?.id || "guest"}:${props.token}:${props.projectType}:${props.projectId}:${canRead}${canReadLogs}${canOverride}${canWrite}${canBind}${canRun}`}
    {...props} canRead={canRead} canWrite={canWrite} canBind={canBind} canRun={canRun} canReadLogs={canReadLogs} canOverride={canOverride} />;
}

function ProjectAutoUpdateSettingsSession({ projectType, projectId, token, canRead, canWrite, canBind, canRun, canReadLogs, canOverride }: SettingsProps & {
  canRead: boolean; canWrite: boolean; canBind: boolean; canRun: boolean; canReadLogs: boolean; canOverride: boolean;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<AutomationData>();
  const [historyVersion, setHistoryVersion] = useState(0);
  const mutation = useRef(false);
  const pendingRead = useRef<AbortController | null>(null);
  const [readError, setReadError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const base = `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/automation`;

  const load = useCallback(async () => {
    if (!canRead) return true;
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    setLoading(true);
    try {
      const value = await apiRequest<AutomationData>(base, { signal: controller.signal }, token);
      if (controller.signal.aborted) return false;
      setData({ ...value, settings: normalizeSettings(value.settings, value.sources) });
      setReadError("");
      return true;
    } catch (error) {
      if (!controller.signal.aborted) setReadError(errorMessage(error));
      return false;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [base, canRead, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); pendingRead.current?.abort(); };
  }, [load]);

  async function bind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current || !canBind) return;
    mutation.current = true; setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      await apiRequest(base + "/sources", {
        method: "POST",
        body: JSON.stringify({ sourceType: form.get("sourceType"), url: form.get("url") }),
      }, token);
      formElement.reset();
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      mutation.current = false; setSaving(false);
    }
  }

  async function save() {
    if (!data || mutation.current || !canWrite) return;
    mutation.current = true; setMessage("");
    setSaving(true);
    try {
      await apiRequest(base, {
        method: "PUT",
        body: JSON.stringify({
          items: data.settings.map((item) => ({
            kind: item.updateKind,
            sourceType: item.sourceType,
            interval: item.interval,
            enabled: item.enabled,
            licenseOverride: item.licenseOverride,
            licenseOverrideReason: item.licenseOverrideReason,
            licenseOverrideSource: item.licenseOverrideSource,
          })),
        }),
      }, token);
      if (await load()) setMessage(t("projectAutomation.saved"));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      mutation.current = false; setSaving(false);
    }
  }

  async function run(kind: UpdateKind) {
    if (mutation.current || !canRun) return;
    mutation.current = true; setMessage("");
    setSaving(true);
    try {
      await apiRequest(`${base}/runs`, { method: "POST", body: JSON.stringify({ kind }) }, token);
      setHistoryVersion(value => value + 1);
      if (await load()) setMessage(t("projectAutomation.queued"));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      mutation.current = false; setSaving(false);
    }
  }

  function update(kind: UpdateKind, values: Partial<Setting>) {
    if (!data || saving) return;
    setData({
      ...data,
      settings: data.settings.map((item) => item.updateKind === kind ? { ...item, ...values } : item),
    });
  }

  return <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t("projectAutomation.title")}</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">{t("projectAutomation.description")}</p>
    {message ? <p role="alert" className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}

    {canRead && !data && !readError && <p role="status">{t("common.loading")}</p>}
    {readError && <div role="alert" className="mt-3 text-sm"><p>{readError}</p><button className="button-secondary focus-ring mt-2" disabled={loading || saving} type="button" onClick={() => void load()}>{t("common.retry")}</button></div>}
    {canBind && <form className="mt-5 flex flex-wrap gap-2" onSubmit={bind}>
      <select aria-label={t("projectAutomation.source")} disabled={saving} className="field w-auto" name="sourceType">
        <option value="modrinth">Modrinth</option>
        <option value="curseforge">CurseForge</option>
        <option value="github">GitHub</option>
      </select>
      <input aria-label={t("projectAutomation.sourceUrl")} disabled={saving} className="field min-w-64 flex-1" name="url" required type="url" placeholder={t("projectAutomation.sourceUrl")} />
      <button className="button-secondary focus-ring" disabled={saving} type="submit">{t("projectAutomation.verifySource")}</button>
    </form>}

    {data && <><div className="mt-3 flex flex-wrap gap-2">
      {data.sources.map((source) => <a
        className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold text-[var(--accent)]"
        href={source.externalProjectUrl}
        key={source.sourceType}
        rel="noreferrer"
        target="_blank"
      >
        {source.sourceType} · {source.externalProjectId} ↗
      </a>)}
    </div>

    <div className="mt-5 grid gap-4">
      {data.settings.map((item) => <article className="rounded-xl border border-[var(--line)] p-4" key={item.updateKind}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black">{t(`projectAutomation.kinds.${item.updateKind}`)}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {item.lastStatus}{item.lastError ? ` · ${item.lastError}` : ""}
            </p>
          </div>
          <button className="button-secondary focus-ring" disabled={saving || !canRun || !item.sourceType} type="button" onClick={() => void run(item.updateKind)}>
            {t("projectAutomation.runNow")}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-bold">
            {t("projectAutomation.source")}
            <select disabled={saving || !canWrite || (item.licenseOverride && !canOverride)} className="field" value={item.sourceType} onChange={(event) => update(item.updateKind, { sourceType: event.target.value })}>
              <option value="">—</option>
              {data.sources
                .filter((source) => item.updateKind !== "minecraft_versions" || source.sourceType !== "github")
                .map((source) => <option key={source.sourceType} value={source.sourceType}>{source.sourceType}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {t("projectAutomation.interval")}
            <select disabled={saving || !canWrite} className="field" value={item.interval} onChange={(event) => update(item.updateKind, { interval: event.target.value as UpdateInterval })}>
              {updateIntervals.map((value) => <option key={value} value={value}>{t(`projectAutomation.intervals.${value}`)}</option>)}
            </select>
          </label>
          <label className="mt-7 flex gap-2 font-bold">
            <input disabled={saving || !canWrite} checked={item.enabled} type="checkbox" onChange={(event) => update(item.updateKind, { enabled: event.target.checked })} />
            {t("common.enabled")}
          </label>
        </div>
        {item.updateKind === "site_downloads" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 font-bold">
            <input disabled={saving || !canWrite || !canOverride} checked={item.licenseOverride} type="checkbox" onChange={(event) => update(item.updateKind, { licenseOverride: event.target.checked })} />
            {t("projectAutomation.licenseOverride")}
          </label>
          {item.licenseOverride ? <>
            <input aria-label={t("projectAutomation.overrideReason")} disabled={saving || !canWrite || !canOverride} className="field" value={item.licenseOverrideReason} onChange={(event) => update(item.updateKind, { licenseOverrideReason: event.target.value })} placeholder={t("projectAutomation.overrideReason")} />
            <input aria-label={t("projectAutomation.overrideSource")} disabled={saving || !canWrite || !canOverride} className="field sm:col-span-2" value={item.licenseOverrideSource} onChange={(event) => update(item.updateKind, { licenseOverrideSource: event.target.value })} placeholder={t("projectAutomation.overrideSource")} />
          </> : null}
        </div> : null}
      </article>)}
    </div>

    <button className="button-primary focus-ring mt-5" disabled={saving || !canWrite} type="button" onClick={() => void save()}>
      {saving ? t("common.saving") : t("common.save")}
    </button>
    </>}
    {!canRead && canRun && <div className="mt-4 grid gap-2">{(["minecraft_versions", "changelog", "site_downloads"] as const).map(kind =>
      <button className="button-secondary focus-ring" key={kind} disabled={saving} type="button" onClick={() => void run(kind)}>{t("projectAutomation.runNow")} · {t(`projectAutomation.kinds.${kind}`)}</button>)}</div>}
    {canReadLogs && <AutomationHistory base={base} token={token} version={historyVersion} />}

  </section>;
}

function AutomationHistory({ base, token, version }: { base: string; token: string; version: number }) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ items: AutomationRun[] }>(`${base}/runs`, { signal: controller.signal }, token)
      .then(value => { if (!controller.signal.aborted) { setRuns(value.items); setError(""); } })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [attempt, base, token, version]);
  return <details className="mt-4 rounded-lg border border-[var(--line)] p-3">
    <summary className="cursor-pointer font-bold">{t("projectAutomation.runHistory")}</summary>
    {error && <div role="alert" className="mt-2"><p>{error}</p><button className="button-secondary focus-ring" type="button" onClick={() => setAttempt(value => value + 1)}>{t("common.retry")}</button></div>}
    <div className="mt-3 grid gap-2">{runs.map(run => <pre className="overflow-auto rounded-md bg-[var(--panel-subtle)] p-3 text-xs" key={run.id}>{JSON.stringify(run, null, 2)}</pre>)}</div>
  </details>;
}

function normalizeSettings(settings: Setting[], sources: Source[]) {
  const defaults: Setting[] = [
    defaultSetting("minecraft_versions", "quarter"),
    defaultSetting("changelog", "never"),
    defaultSetting("site_downloads", "never"),
  ];
  return defaults.map((fallback) => {
    const current = settings.find((item) => item.updateKind === fallback.updateKind);
    return {
      ...fallback,
      ...current,
      sourceType: current?.sourceType ?? sources.find((source) => fallback.updateKind !== "minecraft_versions" || source.sourceType !== "github")?.sourceType ?? "",
    };
  });
}

function defaultSetting(kind: UpdateKind, interval: UpdateInterval): Setting {
  return {
    updateKind: kind,
    sourceType: "",
    interval,
    enabled: false,
    lastStatus: "never",
    lastErrorCode: "",
    lastError: "",
    licenseOverride: false,
    licenseOverrideReason: "",
    licenseOverrideSource: "",
  };
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
