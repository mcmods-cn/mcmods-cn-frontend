"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import {
  Empty,
  Notice,
  PanelHeader,
  RecordTable,
  Toggle,
  errorMessage,
} from "./admin-governance-shared";

type SeedConfig = {
  enabled: boolean;
  projectTypes: string[];
  batchSize: number;
  dailyLimit: number;
  minimumDownloads: number;
  intervalSeconds: number;
  maxConcurrency: number;
  aiDailyTokenBudget: number;
  autoSubmitReview: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
};
type SeedCrawlerPage<T> = {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};
type SeedCrawlerRunSummary = Record<string, unknown> & { id: string };
type SeedCrawlerCandidateSummary = Record<string, unknown> & {
  externalProjectId: string;
  firstSeenRunId: string;
  lastSeenRunId: string;
};
type SeedCrawlerCandidateDetail = SeedCrawlerCandidateSummary & {
  payload: Record<string, unknown>;
};

const numericSeedFields = [
  { key: "batchSize", min: 1, max: 50 },
  { key: "dailyLimit", min: 1, max: 1000 },
  { key: "minimumDownloads", min: 0, max: undefined },
  { key: "intervalSeconds", min: 60, max: undefined },
  { key: "maxConcurrency", min: 1, max: 16 },
  { key: "aiDailyTokenBudget", min: 0, max: undefined },
] as const;

const emptySeedCrawlerPage = <T,>(): SeedCrawlerPage<T> => ({
  items: [],
  limit: 30,
  hasMore: false,
  nextCursor: "",
});

export function SeedCrawlerAdminPanel({ token, canWrite, canRun }: { token: string; canWrite: boolean; canRun: boolean }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<SeedConfig>();
  const [runs, setRuns] =
    useState<SeedCrawlerPage<SeedCrawlerRunSummary>>(emptySeedCrawlerPage);
  const [candidates, setCandidates] =
    useState<SeedCrawlerPage<SeedCrawlerCandidateSummary>>(
      emptySeedCrawlerPage,
    );
  const [candidateDetail, setCandidateDetail] =
    useState<SeedCrawlerCandidateDetail>();
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);
  const [loadingMoreCandidates, setLoadingMoreCandidates] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
  const load = useCallback(async () => {
    try {
      const [cfg, runData, candidateData] = await Promise.all([
        apiRequest<{ config: SeedConfig }>(
          "/api/v1/admin/seed-crawler",
          {},
          token,
        ),
        apiRequest<SeedCrawlerPage<SeedCrawlerRunSummary>>(
          "/api/v1/admin/seed-crawler/runs",
          {},
          token,
        ),
        apiRequest<SeedCrawlerPage<SeedCrawlerCandidateSummary>>(
          "/api/v1/admin/seed-crawler/candidates",
          {},
          token,
        ),
      ]);
      setConfig(cfg.config);
      setRuns(runData);
      setCandidates(candidateData);
      setCandidateDetail(undefined);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [token]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function save() {
    if (!canWrite || !config || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    try {
      const result = await apiRequest<{ config: SeedConfig }>(
        "/api/v1/admin/seed-crawler",
        { method: "PUT", body: JSON.stringify(config) },
        token,
      );
      setConfig(result.config);
      setMessage(t("admin.governance.saved"));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  async function run(dryRun: boolean) {
    if (!canRun || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    try {
      await apiRequest(
        "/api/v1/admin/seed-crawler/runs",
        { method: "POST", body: JSON.stringify({ dryRun }) },
        token,
      );
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  async function loadMoreSeedRuns() {
    if (!runs.hasMore || !runs.nextCursor || loadingMoreRuns) return;
    setLoadingMoreRuns(true);
    try {
      const page = await apiRequest<SeedCrawlerPage<SeedCrawlerRunSummary>>(
        `/api/v1/admin/seed-crawler/runs?limit=${runs.limit}&cursor=${encodeURIComponent(runs.nextCursor)}`,
        {},
        token,
      );
      setRuns((current) =>
        appendSeedCrawlerPage(current, page, (item) => item.id),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingMoreRuns(false);
    }
  }
  async function loadMoreSeedCandidates() {
    if (!candidates.hasMore || !candidates.nextCursor || loadingMoreCandidates)
      return;
    setLoadingMoreCandidates(true);
    try {
      const page = await apiRequest<
        SeedCrawlerPage<SeedCrawlerCandidateSummary>
      >(
        `/api/v1/admin/seed-crawler/candidates?limit=${candidates.limit}&cursor=${encodeURIComponent(candidates.nextCursor)}`,
        {},
        token,
      );
      setCandidates((current) =>
        appendSeedCrawlerPage(current, page, (item) => item.externalProjectId),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingMoreCandidates(false);
    }
  }
  async function selectSeedCandidate(item: Record<string, unknown>) {
    const externalProjectId = String(item.externalProjectId || "");
    if (!externalProjectId) return;
    try {
      setCandidateDetail(
        await apiRequest<SeedCrawlerCandidateDetail>(
          `/api/v1/admin/seed-crawler/candidates/${encodeURIComponent(externalProjectId)}`,
          {},
          token,
        ),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  if (!config) return <Empty text={message || t("common.loading")} />;
  return (
    <section>
      <PanelHeader
        title={t("admin.automation.seedCrawler")}
        description={t("admin.automation.seedCrawlerDescription")}
      />
      {message ? <Notice text={message} /> : null}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className="mt-5 grid min-w-0 gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-2 lg:grid-cols-4" disabled={!canWrite || busy}>
          <Toggle
            label={t("common.enabled")}
            checked={config.enabled}
            onChange={(value) => setConfig({ ...config, enabled: value })}
          />
          <Toggle
            label={t("admin.automation.autoSubmit")}
            checked={config.autoSubmitReview}
            onChange={(value) =>
              setConfig({ ...config, autoSubmitReview: value })
            }
          />
          {numericSeedFields.map(({ key, min, max }) => (
            <label className="grid gap-1 text-sm font-bold" key={key}>
              {t(`admin.automation.${key}`)}
              <input
                className="field"
                min={min}
                max={max}
                required
                type="number"
                value={Number.isNaN(config[key]) ? "" : config[key]}
                onChange={(event) => setConfig({ ...config, [key]: event.currentTarget.valueAsNumber })}
              />
            </label>
          ))}
          <fieldset className="grid gap-2 text-sm font-bold sm:col-span-2 lg:col-span-4">
            <legend>{t("admin.automation.projectTypes")}</legend>
            <span className="flex flex-wrap gap-3">
              {["mod", "plugin", "shader_pack", "resource_pack"].map((type) => (
                <label className="flex gap-2" key={type}>
                  <input
                    checked={config.projectTypes.includes(type)}
                    type="checkbox"
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        projectTypes: event.target.checked
                          ? [...config.projectTypes, type]
                          : config.projectTypes.filter((value) => value !== type),
                      })
                    }
                  />
                  {type}
                </label>
              ))}
            </span>
          </fieldset>
          {canWrite ? (
            <button
              className="button-primary focus-ring justify-self-start"
              type="submit"
            >
              {t("common.save")}
            </button>
          ) : null}
        </fieldset>
      </form>
      {canRun ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="button-secondary focus-ring"
            disabled={busy}
            type="button"
            onClick={() => void run(true)}
          >
            {t("admin.automation.dryRun")}
          </button>
          <button
            className="button-secondary focus-ring"
            disabled={busy}
            type="button"
            onClick={() => void run(false)}
          >
            {t("admin.automation.run")}
          </button>
        </div>
      ) : null}
      <RecordTable title={t("admin.automation.runs")} items={runs.items} />
      {runs.hasMore ? (
        <button
          className="button-secondary focus-ring mt-3"
          disabled={loadingMoreRuns}
          type="button"
          onClick={() => void loadMoreSeedRuns()}
        >
          {loadingMoreRuns
            ? t("common.loading")
            : t("admin.automation.loadMore")}
        </button>
      ) : null}
      <RecordTable
        title={t("admin.automation.candidates")}
        items={candidates.items}
        onSelect={(item) => void selectSeedCandidate(item)}
        selectLabel={t("admin.automation.details")}
      />
      {candidates.hasMore ? (
        <button
          className="button-secondary focus-ring mt-3"
          disabled={loadingMoreCandidates}
          type="button"
          onClick={() => void loadMoreSeedCandidates()}
        >
          {loadingMoreCandidates
            ? t("common.loading")
            : t("admin.automation.loadMore")}
        </button>
      ) : null}
      {candidateDetail ? (
        <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h3 className="text-lg font-black">
            {t("admin.automation.candidateDetails")} ·{" "}
            {candidateDetail.externalProjectId}
          </h3>
          <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-[var(--panel-subtle)] p-3 text-xs">
            {JSON.stringify(candidateDetail, null, 2)}
          </pre>
        </section>
      ) : null}
    </section>
  );
}

export function ProjectAutomationAdminPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<{
    runs: Array<Record<string, unknown>>;
    settings: Array<Record<string, unknown>>;
  }>({ runs: [], settings: [] });
  const [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      apiRequest<typeof data>("/api/v1/admin/project-auto-updates", {}, token)
        .then(setData)
        .catch((error) => setMessage(errorMessage(error))),
    [token],
  );
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  return (
    <section>
      <PanelHeader
        title={t("admin.automation.projectUpdates")}
        description={t("admin.automation.projectUpdatesDescription")}
      />
      {message ? <Notice text={message} /> : null}
      <button
        className="button-secondary focus-ring mt-4"
        type="button"
        onClick={() => void load()}
      >
        {t("common.refresh")}
      </button>
      <RecordTable
        title={t("admin.automation.settings")}
        items={data.settings}
      />
      <RecordTable title={t("admin.automation.runs")} items={data.runs} />
    </section>
  );
}

function appendSeedCrawlerPage<T>(
  current: SeedCrawlerPage<T>,
  next: SeedCrawlerPage<T>,
  key: (item: T) => string,
): SeedCrawlerPage<T> {
  const existing = new Set(current.items.map(key));
  return {
    ...next,
    items: [
      ...current.items,
      ...next.items.filter((item) => !existing.has(key(item))),
    ],
  };
}
