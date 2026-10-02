"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
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

export function ProjectAutoUpdateSettings({
  projectType,
  projectId,
  token,
}: {
  projectType: string;
  projectId: string;
  token: string;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<AutomationData>();
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const base = `/api/v1/projects/${encodeURIComponent(projectType)}/${encodeURIComponent(projectId)}/automation`;

  const load = useCallback(async () => {
    try {
      const [value, history] = await Promise.all([
        apiRequest<AutomationData>(base, {}, token),
        apiRequest<{ items: AutomationRun[] }>(`${base}/runs`, {}, token),
      ]);
      setData({ ...value, settings: normalizeSettings(value.settings, value.sources) });
      setRuns(history.items);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [base, token]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function bind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(base + "/sources", {
        method: "POST",
        body: JSON.stringify({ sourceType: form.get("sourceType"), url: form.get("url") }),
      }, token);
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function save() {
    if (!data) return;
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
      await load();
      setMessage(t("projectAutomation.saved"));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function run(kind: UpdateKind) {
    try {
      await apiRequest(`${base}/runs`, { method: "POST", body: JSON.stringify({ kind }) }, token);
      await load();
      setMessage(t("projectAutomation.queued"));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function update(kind: UpdateKind, values: Partial<Setting>) {
    if (!data) return;
    setData({
      ...data,
      settings: data.settings.map((item) => item.updateKind === kind ? { ...item, ...values } : item),
    });
  }

  if (!data) {
    return <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h2 className="text-xl font-black">{t("projectAutomation.title")}</h2>
      <p className={`mt-3 text-sm ${message ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
        {message || t("common.loading")}
      </p>
    </section>;
  }

  return <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t("projectAutomation.title")}</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">{t("projectAutomation.description")}</p>
    {message ? <p className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm font-bold">{message}</p> : null}

    <form className="mt-5 flex flex-wrap gap-2" onSubmit={bind}>
      <select className="field w-auto" name="sourceType">
        <option value="modrinth">Modrinth</option>
        <option value="curseforge">CurseForge</option>
        <option value="github">GitHub</option>
      </select>
      <input className="field min-w-64 flex-1" name="url" required type="url" placeholder={t("projectAutomation.sourceUrl")} />
      <button className="button-secondary focus-ring" type="submit">{t("projectAutomation.verifySource")}</button>
    </form>

    <div className="mt-3 flex flex-wrap gap-2">
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
          <button className="button-secondary focus-ring" disabled={!item.sourceType} type="button" onClick={() => void run(item.updateKind)}>
            {t("projectAutomation.runNow")}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-bold">
            {t("projectAutomation.source")}
            <select className="field" value={item.sourceType} onChange={(event) => update(item.updateKind, { sourceType: event.target.value })}>
              <option value="">—</option>
              {data.sources
                .filter((source) => item.updateKind !== "minecraft_versions" || source.sourceType !== "github")
                .map((source) => <option key={source.sourceType} value={source.sourceType}>{source.sourceType}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {t("projectAutomation.interval")}
            <select className="field" value={item.interval} onChange={(event) => update(item.updateKind, { interval: event.target.value as UpdateInterval })}>
              {updateIntervals.map((value) => <option key={value} value={value}>{t(`projectAutomation.intervals.${value}`)}</option>)}
            </select>
          </label>
          <label className="mt-7 flex gap-2 font-bold">
            <input checked={item.enabled} type="checkbox" onChange={(event) => update(item.updateKind, { enabled: event.target.checked })} />
            {t("common.enabled")}
          </label>
        </div>
        {item.updateKind === "site_downloads" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 font-bold">
            <input checked={item.licenseOverride} type="checkbox" onChange={(event) => update(item.updateKind, { licenseOverride: event.target.checked })} />
            {t("projectAutomation.licenseOverride")}
          </label>
          {item.licenseOverride ? <>
            <input className="field" value={item.licenseOverrideReason} onChange={(event) => update(item.updateKind, { licenseOverrideReason: event.target.value })} placeholder={t("projectAutomation.overrideReason")} />
            <input className="field sm:col-span-2" value={item.licenseOverrideSource} onChange={(event) => update(item.updateKind, { licenseOverrideSource: event.target.value })} placeholder={t("projectAutomation.overrideSource")} />
          </> : null}
        </div> : null}
      </article>)}
    </div>

    <button className="button-primary focus-ring mt-5" disabled={saving} type="button" onClick={() => void save()}>
      {saving ? t("common.saving") : t("common.save")}
    </button>
    <details className="mt-6">
      <summary className="cursor-pointer font-black">{t("projectAutomation.runHistory")}</summary>
      <div className="mt-3 grid gap-2">
        {runs.map((run) => <pre className="overflow-auto rounded-lg bg-[var(--panel-subtle)] p-3 text-xs" key={run.id}>
          {JSON.stringify(run, null, 2)}
        </pre>)}
      </div>
    </details>
  </section>;
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
      sourceType: current?.sourceType || sources[0]?.sourceType || "",
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
