"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, ReactNode, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import type { LevelConfig, RoleTrack } from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import { buildNATSUpdatePayload, bytesPerMiB, streamCapacityBytes, type NATSConfig, type NATSTaskConfig } from "../_lib/nats-config.mts";
import { OAuthSettingsPanel } from "./admin-oauth-config-panel";
import { AdminConfig, ConfigBlock, ConfigLine, EmptyState, InlineMessage, MailConfig, ModImportConfig, ModImportProviderConfig, PanelShell, PermissionCatalog, PermissionDefaults, Role, User, cleanError, notifyAdminNotice, valueText } from "./admin-console-shared";

function NATSConfigPanel({ initialConfig, token, canWrite }: { initialConfig: NATSConfig; token: string; canWrite: boolean }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<NATSConfig>({ ...initialConfig, password: "", token: "", clearPassword: false, clearToken: false });
  const [saving, setSaving] = useState(false);
  const [capacityEdit, setCapacityEdit] = useState<string | null>(null);
  const configuredBytes = draft.jetStream.newStreamMaxBytes;
  const editableCapacity = typeof configuredBytes === "number" && Number.isSafeInteger(configuredBytes) && configuredBytes > 0;
  const newStreamMaxBytes = capacityEdit === null ? undefined : streamCapacityBytes(capacityEdit);
  const invalidCapacity = capacityEdit !== null && newStreamMaxBytes === undefined;

  async function save() {
    if (saving || !canWrite || invalidCapacity) return;
    setSaving(true);
    try {
      const saved = await apiRequest<NATSConfig>(
        "/api/v1/admin/config/nats",
        {
          method: "PUT",
          body: JSON.stringify(buildNATSUpdatePayload(draft, newStreamMaxBytes)),
        },
        token,
      );
      setDraft({ ...saved, password: "", token: "", clearPassword: false, clearToken: false });
      setCapacityEdit(null);
      notifyAdminNotice(t("admin.nats.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  function updateTask(index: number, patch: Partial<NATSTaskConfig>) {
    setDraft({ ...draft, tasks: draft.tasks.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task) });
  }

  const connected = draft.status.connected;
  const statusText = !draft.enabled
    ? t("admin.nats.disabledStatus")
    : connected
      ? t("admin.nats.connectedStatus")
      : t("admin.nats.disconnectedStatus");

  return (
    <div className="grid gap-4">
      <fieldset disabled={!canWrite || saving} className="grid min-w-0 gap-4">
      <section className="surface rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("admin.nats.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.nats.description")}</p>
            <p className={`mt-2 text-sm font-bold ${connected ? "text-[var(--accent)]" : "text-[var(--warning)]"}`}>
              {statusText}{draft.status.lastError ? ` / ${draft.status.lastError}` : ""}
            </p>
          </div>
          <button className="button-primary focus-ring" disabled={saving || invalidCapacity} type="button" onClick={() => void save()}>
            {saving ? t("admin.saving") : t("admin.nats.save")}
          </button>
        </div>
      </section>

      <section className="surface rounded-lg p-4">
        <h3 className="mb-4 font-bold">{t("admin.nats.connection")}</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] p-3 text-sm font-semibold">
            <input
              checked={draft.enabled}
              type="checkbox"
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked, jetStream: event.target.checked ? draft.jetStream : { ...draft.jetStream, enabled: false } })}
            />
            {t("admin.nats.enabled")}
          </label>
          <label className="text-sm font-semibold xl:col-span-2">
            {t("admin.nats.url")}
            <input className="field mt-2" value={draft.url} placeholder="nats://127.0.0.1:4222" onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.nats.subjectPrefix")}
            <input className="field mt-2" value={draft.subjectPrefix} placeholder="mcmods" onChange={(event) => setDraft({ ...draft, subjectPrefix: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.nats.username")}
            <input className="field mt-2" value={draft.username} autoComplete="off" onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
          </label>
          <div className="text-sm font-semibold">
            {t("admin.nats.password")}
            <input
              className="field mt-2"
              value={draft.password ?? ""}
              autoComplete="new-password"
              disabled={draft.clearPassword}
              placeholder={draft.clearPassword ? t("admin.nats.secretWillClear") : draft.hasPassword ? t("admin.nats.secretSaved") : ""}
              type="password"
              onChange={(event) => setDraft({ ...draft, password: event.target.value, clearPassword: false })}
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-normal text-[var(--muted)]">
              <input checked={draft.clearPassword ?? false} type="checkbox" onChange={(event) => setDraft({ ...draft, password: "", clearPassword: event.target.checked })} />
              {t("admin.nats.clearPassword")}
            </label>
          </div>
          <div className="text-sm font-semibold">
            {t("admin.nats.token")}
            <input
              className="field mt-2"
              value={draft.token ?? ""}
              autoComplete="off"
              disabled={draft.clearToken}
              placeholder={draft.clearToken ? t("admin.nats.secretWillClear") : draft.hasToken ? t("admin.nats.secretSaved") : t("admin.nats.tokenHint")}
              type="password"
              onChange={(event) => setDraft({ ...draft, token: event.target.value, clearToken: false })}
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-normal text-[var(--muted)]">
              <input checked={draft.clearToken ?? false} type="checkbox" onChange={(event) => setDraft({ ...draft, token: "", clearToken: event.target.checked })} />
              {t("admin.nats.clearToken")}
            </label>
          </div>
        </div>
      </section>

      <section className="surface rounded-lg p-4">
        <h3 className="font-bold">{t("admin.nats.reliability")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.nats.reliabilityDescription")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] p-3 text-sm font-semibold">
            <input checked={draft.realtime} type="checkbox" onChange={(event) => setDraft({ ...draft, realtime: event.target.checked })} />
            {t("admin.nats.realtime")}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] p-3 text-sm font-semibold">
            <input
              checked={draft.jetStream.enabled}
              type="checkbox"
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked ? true : draft.enabled, jetStream: { ...draft.jetStream, enabled: event.target.checked } })}
            />
            {t("admin.nats.jetStreamEnabled")}
          </label>
          <label className="text-sm font-semibold">
            {t("admin.nats.jetStreamName")}
            <input className="field mt-2" value={draft.jetStream.stream} onChange={(event) => setDraft({ ...draft, jetStream: { ...draft.jetStream, stream: event.target.value } })} />
          </label>
          {editableCapacity ? <label className="text-sm font-semibold">
            {t("admin.nats.newStreamCapacity")}
            <input className="field mt-2" type="number" min={1 / bytesPerMiB} step="any" required aria-invalid={invalidCapacity}
              value={capacityEdit ?? configuredBytes / bytesPerMiB} onChange={event => setCapacityEdit(event.target.value)} />
          </label> : null}
          <label className="text-sm font-semibold">
            {t("admin.nats.maxDeliver")}
            <input className="field mt-2" min={2} max={100} type="number" value={draft.jetStream.maxDeliver} onChange={(event) => setDraft({ ...draft, jetStream: { ...draft.jetStream, maxDeliver: Number(event.target.value) } })} />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.nats.ackWait")}
            <input className="field mt-2" min={1} max={86400} type="number" value={draft.jetStream.ackWaitSeconds} onChange={(event) => setDraft({ ...draft, jetStream: { ...draft.jetStream, ackWaitSeconds: Number(event.target.value) } })} />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.nats.publishTimeout")}
            <input className="field mt-2" min={1} max={300} type="number" value={draft.jetStream.publishTimeoutSeconds} onChange={(event) => setDraft({ ...draft, jetStream: { ...draft.jetStream, publishTimeoutSeconds: Number(event.target.value) } })} />
          </label>
        </div>
      </section>

      <section className="surface rounded-lg p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">{t("admin.nats.tasks")}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.nats.tasksDescription")}</p>
          </div>
          <button
            className="button-secondary focus-ring"
            type="button"
            onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, { code: "", enabled: true, subject: "", queueGroup: "", maxConcurrent: 1, timeoutSeconds: 300 }] })}
          >
            {t("admin.nats.addTask")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[90px_1fr_1.2fr_1.4fr_130px_130px_80px] gap-3 border-b border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--muted)]">
              <span>{t("common.enabled")}</span>
              <span>{t("admin.nats.taskCode")}</span>
              <span>Subject</span>
              <span>{t("admin.nats.queueGroup")}</span>
              <span>{t("admin.nats.maxConcurrent")}</span>
              <span>{t("admin.nats.timeout")}</span>
              <span>{t("admin.operation")}</span>
            </div>
            <div className="grid gap-2 pt-2">
              {draft.tasks.map((task, index) => (
                <div key={`nats-task-${index}`} className="grid grid-cols-[90px_1fr_1.2fr_1.4fr_130px_130px_80px] items-center gap-3 rounded-lg border border-[var(--line)] p-3">
                  <input aria-label={t("common.enabled")} checked={task.enabled} type="checkbox" onChange={(event) => updateTask(index, { enabled: event.target.checked })} />
                  <input className="field" value={task.code} placeholder="ai" onChange={(event) => updateTask(index, { code: event.target.value })} />
                  <input className="field" value={task.subject} placeholder="ai.tasks" onChange={(event) => updateTask(index, { subject: event.target.value })} />
                  <input className="field" value={task.queueGroup} placeholder="mcmods-ai-workers" onChange={(event) => updateTask(index, { queueGroup: event.target.value })} />
                  <input className="field" min={1} max={1000} type="number" value={task.maxConcurrent} onChange={(event) => updateTask(index, { maxConcurrent: Number(event.target.value) })} />
                  <input className="field" min={1} max={86400} type="number" value={task.timeoutSeconds} onChange={(event) => updateTask(index, { timeoutSeconds: Number(event.target.value) })} />
                  <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, taskIndex) => taskIndex !== index) })}>
                    {t("common.delete")}
                  </button>
                </div>
              ))}
            </div>
            {draft.tasks.length === 0 ? <EmptyState text={t("admin.nats.noTasks")} /> : null}
          </div>
        </div>
      </section>
      </fieldset>
    </div>
  );
}

const importProviders = ["modrinth", "curseforge", "github"] as const;
const importConfigPath = "/api/v1/admin/config/mod-imports";
const validImportRevision = (revision?: string) => typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision);

function readImportConfig(value: ModImportConfig, invalidMessage: string): ModImportConfig {
  if (!value || typeof value.userAgent !== "string" || !Number.isSafeInteger(value.requestTimeoutSeconds) ||
    importProviders.some(key => !value[key] || typeof value[key].enabled !== "boolean" || typeof value[key].baseUrl !== "string")) {
    throw new Error(invalidMessage);
  }
  const clean = (provider: ModImportProviderConfig) => ({
    enabled: provider.enabled, baseUrl: provider.baseUrl, hasToken: provider.hasToken === true, hasApiKey: provider.hasApiKey === true,
  });
  return {
    revision: value.revision, userAgent: value.userAgent, requestTimeoutSeconds: value.requestTimeoutSeconds,
    modrinth: clean(value.modrinth), curseforge: clean(value.curseforge), github: clean(value.github),
  };
}

function providerUpdate(provider: ModImportProviderConfig, key: typeof importProviders[number]) {
  const { enabled, baseUrl, token, apiKey, clearToken, clearApiKey } = provider;
  return {
    enabled, baseUrl,
    ...(key === "curseforge" ? (clearApiKey ? { clearApiKey: true } : apiKey ? { apiKey } : {}) :
      (clearToken ? { clearToken: true } : token ? { token } : {})),
  };
}

function ModImportConfigPanel({ token, canWrite }: { token: string; canWrite: boolean }) {
  const { t } = useI18n();
  const [base, setBase] = useState<ModImportConfig>();
  const [draft, setDraft] = useState<ModImportConfig>();
  const [latest, setLatest] = useState<ModImportConfig>();
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const readFailure = useEffectEvent(() => t("common.loadFailed"));

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<ModImportConfig>(importConfigPath, { signal: controller.signal, cache: "no-store" }, token)
      .then(value => {
        if (controller.signal.aborted) return;
        const config = readImportConfig(value, readFailure());
        setBase(config); setDraft(config); setMessage("");
      }).catch(error => { if (!controller.signal.aborted) setMessage(cleanError(error) || readFailure()); });
    return () => controller.abort();
  }, [attempt, token]);

  function updateProvider(provider: typeof importProviders[number], patch: Partial<ModImportProviderConfig>) {
    if (draft) setDraft({ ...draft, [provider]: { ...draft[provider], ...patch } });
  }

  async function compare() {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setLatest(undefined); setMessage("");
    try {
      const config = readImportConfig(await apiRequest<ModImportConfig>(importConfigPath, { cache: "no-store" }, token), t("common.loadFailed"));
      if (!validImportRevision(config.revision)) { setMessage(t("admin.ai.noRevision")); return; }
      setLatest(config);
    } catch (error) { setMessage(cleanError(error) || t("common.loadFailed")); }
    finally { inFlight.current = false; setSaving(false); }
  }

  function acceptLatest(keepChanges: boolean) {
    if (!latest || !base || !draft) return;
    const merged = { ...latest };
    let targetChanged = false;
    if (keepChanges) {
      if (draft.userAgent !== base.userAgent) merged.userAgent = draft.userAgent;
      if (draft.requestTimeoutSeconds !== base.requestTimeoutSeconds) merged.requestTimeoutSeconds = draft.requestTimeoutSeconds;
      for (const key of importProviders) {
        const edited = draft[key], previous = base[key], current = latest[key];
        const baseUrl = edited.baseUrl === previous.baseUrl ? current.baseUrl : edited.baseUrl;
        const enabled = edited.enabled === previous.enabled ? current.enabled : edited.enabled;
        const next = { ...current, baseUrl, enabled };
        // Explicit credential changes belong to the endpoint the administrator saw.
        if (baseUrl === edited.baseUrl) Object.assign(next, providerUpdate({ ...edited, baseUrl, enabled }, key));
        else if (edited.token || edited.apiKey || edited.clearToken || edited.clearApiKey) targetChanged = true;
        merged[key] = next;
      }
    }
    setBase(latest); setDraft(merged); setLatest(undefined); setConflict(false);
    setMessage(targetChanged ? t("admin.modImport.reviewCredential") : "");
  }

  const writable = canWrite && validImportRevision(base?.revision) && !conflict;
  async function save() {
    if (!base || !draft || !writable || inFlight.current) return;
    inFlight.current = true; setSaving(true); setMessage("");
    function consumeWrite(committed: ModImportConfig) {
      const cleared = readImportConfig({ ...committed, revision: undefined }, t("common.loadFailed"));
      setBase(cleared); setDraft(cleared); setLatest(undefined);
      notifyAdminNotice(t("admin.modImport.saved"));
    }
    try {
      const saved = await apiRequest<ModImportConfig>(importConfigPath, {
        method: "PUT",
        body: JSON.stringify({
          revision: base.revision, userAgent: draft.userAgent, requestTimeoutSeconds: draft.requestTimeoutSeconds,
          modrinth: providerUpdate(draft.modrinth, "modrinth"), curseforge: providerUpdate(draft.curseforge, "curseforge"), github: providerUpdate(draft.github, "github"),
        }),
      }, token);
      // A successful write consumes the credential changes even if its receipt is incomplete.
      consumeWrite(draft);
      const snapshot = readImportConfig(saved, t("common.loadFailed"));
      setBase(snapshot); setDraft(snapshot);
    } catch (error) {
      if (error instanceof ApiError && ((error.status === 409 && error.code === "MOD_IMPORT_CONFIG_CONFLICT") ||
          (error.status === 428 && error.code === "MOD_IMPORT_CONFIG_REVISION_REQUIRED"))) {
        setConflict(true); setLatest(undefined);
      } else if (error instanceof ApiError && error.status >= 200 && error.status < 300 && error.code === "API_RESPONSE_EMPTY") {
        consumeWrite(draft);
        setMessage(t("admin.ai.noRevision"));
      } else { setMessage(cleanError(error) || t("common.loadFailed")); }
    } finally { inFlight.current = false; setSaving(false); }
  }

  if (!draft) return <div><EmptyState text={message || t("common.loading")} />{message ? <button className="button-secondary focus-ring" type="button" onClick={() => { setMessage(""); setAttempt(value => value + 1); }}>{t("common.retry")}</button> : null}</div>;

  return (
    <div className="grid gap-4">
      {!canWrite && <p className="surface p-4" role="status">{t("admin.ai.readOnly")}</p>}
      {message && <p className="surface p-4" role="status">{message}</p>}
      {canWrite && !validImportRevision(base?.revision) && <section className="surface p-4">
        <p>{t("admin.ai.noRevision")}</p><button className="button-secondary focus-ring mt-2" type="button" disabled={saving} onClick={() => setAttempt(value => value + 1)}>{t("common.retry")}</button>
      </section>}
      {conflict && <section className="surface grid gap-3 p-5" role="alert">
        <strong>{t("admin.ai.configConflict")}</strong>
        <button className="button-secondary focus-ring w-fit" type="button" disabled={saving} onClick={() => void compare()}>{t("admin.ai.compareLatest")}</button>
        {latest && <><h3 className="font-bold">{t("admin.ai.serverVersion")}</h3>
          <dl className="grid gap-3"><div><dt>{t("admin.modImport.userAgent")}</dt><dd>{latest.userAgent}</dd></div>
            <div><dt>{t("admin.modImport.timeout")}</dt><dd>{latest.requestTimeoutSeconds}</dd></div>
            {importProviders.map(key => <div key={key}><dt>{t(`admin.modImport.providers.${key}`)}</dt>
              <dd>{latest[key].baseUrl} · {t(latest[key].enabled ? "common.enabled" : "common.disabled")} · {t("admin.modImport." + (latest[key].hasToken || latest[key].hasApiKey ? "credentialPresent" : "credentialAbsent"))}</dd></div>)}
          </dl><div className="flex flex-wrap gap-2">
            <button className="button-primary focus-ring" type="button" disabled={saving} onClick={() => acceptLatest(true)}>{t("admin.ai.applyEdits")}</button>
            <button className="button-secondary focus-ring" type="button" disabled={saving} onClick={() => acceptLatest(false)}>{t("admin.ai.discardEdits")}</button>
          </div></>}
      </section>}
      <fieldset className="grid min-w-0 gap-4" aria-label={t("admin.modImport.title")} disabled={!writable || saving}>
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("admin.modImport.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.modImport.description")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={!writable || saving} type="button" onClick={() => void save()}>
            {saving ? t("admin.saving") : t("admin.modImport.save")}
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
          <label className="text-sm font-semibold">
            {t("admin.modImport.userAgent")}
            <input className="field mt-2" value={draft.userAgent} onChange={(event) => setDraft({ ...draft, userAgent: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.modImport.timeout")}
            <input className="field mt-2" min={5} max={120} type="number" value={draft.requestTimeoutSeconds} onChange={(event) => setDraft({ ...draft, requestTimeoutSeconds: Number(event.target.value) })} />
          </label>
        </div>
      </section>
      <section className="surface overflow-hidden">
        {importProviders.map((provider) => {
          const config = draft[provider];
          const secretKind = provider === "curseforge" ? "apiKey" : "token";
          const hasSecret = provider === "curseforge" ? config.hasApiKey : config.hasToken;
          return (
            <div key={provider} className="grid gap-4 border-b border-[var(--line)] p-5 last:border-b-0 lg:grid-cols-[180px_1fr]">
              <div>
                <label className="flex items-center gap-2 font-bold">
                  <input checked={config.enabled} type="checkbox" onChange={(event) => updateProvider(provider, { enabled: event.target.checked })} />
                  {t(`admin.modImport.providers.${provider}`)}
                </label>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t(`admin.modImport.providerDescriptions.${provider}`)}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold md:col-span-2">
                  {t("admin.modImport.baseUrl")}
                  <input className="field mt-2" value={config.baseUrl} onChange={(event) => updateProvider(provider, { baseUrl: event.target.value })} />
                </label>
                <label className="text-sm font-semibold">
                  {t(`admin.modImport.${secretKind}`)}
                  <input
                    className="field mt-2"
                    autoComplete="new-password"
                    type="password"
                    value={secretKind === "apiKey" ? config.apiKey ?? "" : config.token ?? ""}
                    placeholder={hasSecret ? t("admin.modImport.secretSaved") : t(`admin.modImport.secretHints.${provider}`)}
                    onChange={(event) => updateProvider(provider, secretKind === "apiKey" ? { apiKey: event.target.value, clearApiKey: false } : { token: event.target.value, clearToken: false })}
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--line)] px-3 py-3 text-sm font-semibold">
                  <input checked={secretKind === "apiKey" ? config.clearApiKey ?? false : config.clearToken ?? false} type="checkbox" onChange={(event) => updateProvider(provider, secretKind === "apiKey" ? { clearApiKey: event.target.checked, apiKey: "" } : { clearToken: event.target.checked, token: "" })} />
                  {t("admin.modImport.clearSecret")}
                </label>
                {provider === "github" ? <p className="text-sm leading-6 text-[var(--muted)] md:col-span-2">{t("admin.modImport.githubPermissions")}</p> : null}
              </div>
            </div>
          );
        })}
      </section>
      </fieldset>
    </div>
  );
}

function AuthPanelV2({ config, token }: { config: Pick<AdminConfig, "auth" | "oauth">; token: string }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigBlock title={t("admin.authMethods")}>
        <ConfigLine label={t("admin.emailPassword")} value={valueText(config.auth.emailPasswordLogin)} />
        <ConfigLine label={t("admin.usernamePassword")} value={valueText(config.auth.usernamePasswordLogin)} />
        <ConfigLine label={t("admin.userIdPassword")} value={valueText(config.auth.userIDPasswordLogin)} />
        <ConfigLine label={t("admin.emailCode")} value={valueText(config.auth.emailCodeLogin)} />
        <ConfigLine label={t("admin.allowRegistration")} value={valueText(config.auth.allowRegistration)} />
      </ConfigBlock>
      <ConfigBlock title={t("admin.accountSecurity")}>
        <ConfigLine label={t("admin.passwordMinLength")} value={`${config.auth.passwordMinLength ?? 8}`} />
        <ConfigLine label={t("admin.tokenTtl")} value={`${config.auth.tokenTTLHours ?? 24} h`} />
        <ConfigLine label={t("admin.emailVerification")} value={valueText(config.auth.requireEmailVerification)} />
        <ConfigLine label={t("admin.passwordStorage")} value="PBKDF2-SHA256 + salt" />
      </ConfigBlock>
      <OAuthSettingsPanel config={config.oauth} token={token} />
    </div>
  );
}

function PermissionSettingsPanel({ catalog, token, canWrite, canReadLevels, canWriteLevels }: { catalog: PermissionCatalog; token: string; canWrite: boolean; canReadLevels: boolean; canWriteLevels: boolean }) {
  const { t } = useI18n();
  const [defaults, setDefaults] = useState<PermissionDefaults>({ registeredRole: "", bannedRole: "" });
  const [levelConfig, setLevelConfig] = useState<LevelConfig | null>(null);
  const [roleTracks, setRoleTracks] = useState<RoleTrack[]>([]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [levelSaved, setLevelSaved] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const reportLoadError = useEffectEvent((error: unknown) => notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"));
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    Promise.all([
      apiRequest<PermissionDefaults>("/api/v1/admin/permission-defaults", { signal: controller.signal }, token),
      canReadLevels ? apiRequest<LevelConfig>("/api/v1/admin/levels/config", { signal: controller.signal }, token) : null,
      apiRequest<RoleTrack[]>("/api/v1/admin/role-tracks", { signal: controller.signal }, token),
    ])
      .then(([nextDefaults, nextLevelConfig, nextRoleTracks]) => {
        if (cancelled) return;
        setReady(true);
        setDefaults(nextDefaults);
        setLevelConfig(nextLevelConfig);
        setRoleTracks(nextRoleTracks);
        setLoadError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(cleanError(error));
        reportLoadError(error);
        controller.abort();
      });
    return () => { cancelled = true; controller.abort(); };
  }, [canReadLevels, token, loadAttempt]);

  function selectLevelRoleTrack(code: string) {
    setLevelSaved(false);
    const track = roleTracks.find((item) => item.code === code);
    if (!track) {
      setLevelConfig({ roleTrackCode: "", levelThresholds: [] });
      return;
    }
    const previous = levelConfig?.levelThresholds ?? [];
    let lastThreshold = -1;
    const levelThresholds = track.roles.map((_, index) => {
      let threshold = previous[index] ?? index * 100;
      if (threshold <= lastThreshold) threshold = lastThreshold + 100;
      lastThreshold = threshold;
      return threshold;
    });
    setLevelConfig({ roleTrackCode: code, levelThresholds });
  }

  async function save() {
    if (!ready || saving || (!canWrite && !(canWriteLevels && levelConfig))) return;
    setSaving(true);
    try {
      if (canWriteLevels && levelConfig && !levelSaved) {
        const saved = await apiRequest<LevelConfig>("/api/v1/admin/levels/config", { method: "PUT", body: JSON.stringify(levelConfig) }, token);
        setLevelConfig(saved);
        setLevelSaved(true);
      }
      if (canWrite) {
        const saved = await apiRequest<PermissionDefaults>("/api/v1/admin/permission-defaults", { method: "PUT", body: JSON.stringify(defaults) }, token);
        setDefaults(saved);
      }
      notifyAdminNotice(t("admin.permissionSettings.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  const roleOptions = (roles: Role[]) => <>{roles.map((role) => <option key={role.code} value={role.code}>{role.name || role.code} ({role.code})</option>)}</>;
  return (
    <PanelShell title={t("admin.permissionSettings.title")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-5">
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.permissionSettings.description")}</p>
        <button className="button-primary focus-ring" disabled={!ready || saving || (!canWrite && !(canWriteLevels && levelConfig))} type="button" onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>

      {!ready ? (
        <div className="pt-5">
          {loadError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--danger)]">
              <span>{loadError}</span>
              <button className="button-secondary focus-ring" type="button" onClick={() => { setLoadError(""); setLoadAttempt((current) => current + 1); }}>{t("common.retry")}</button>
            </div>
          ) : <p role="status" className="text-sm text-[var(--muted)]">{t("common.loading")}</p>}
        </div>
      ) : null}

      <section className="grid gap-4 border-b border-[var(--line)] py-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <h3 className="font-black">{t("admin.permissionSettings.accountDefaults")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.permissionSettings.accountDefaultsDescription")}</p>
        </div>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.registeredRole")}
          value={defaults.registeredRole}
          disabled={!ready || !canWrite || saving}
          onChange={(registeredRole) => setDefaults((current) => ({ ...current, registeredRole }))}
        >
          {roleOptions(catalog.roles)}
        </PermissionRoleSelect>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.bannedRole")}
          value={defaults.bannedRole}
          disabled={!ready || !canWrite || saving}
          onChange={(bannedRole) => setDefaults((current) => ({ ...current, bannedRole }))}
        >
          {roleOptions(catalog.roles)}
        </PermissionRoleSelect>
      </section>

      {canReadLevels && <section className="grid gap-4 pt-5">
        <div>
          <h3 className="font-black">{t("admin.permissionSettings.levelRoleTrack")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.permissionSettings.levelRoleTrackDescription")}</p>
        </div>
        <label className="max-w-xl text-sm font-semibold">
          {t("admin.community.roleTrack")}
          <select
            className="field mt-2"
            disabled={!levelConfig || !canWriteLevels || saving}
            value={levelConfig?.roleTrackCode ?? ""}
            onChange={(event) => selectLevelRoleTrack(event.target.value)}
          >
            <option value="">{t("admin.community.noRoleTrack")}</option>
            {roleTracks.map((track) => (
              <option key={track.code} value={track.code}>
                {track.name} ({track.code})
              </option>
            ))}
          </select>
        </label>
        {levelConfig && roleTracks.length === 0 ? (
          <p className="text-sm font-bold text-[var(--warning)]">{t("admin.permissionSettings.noRoleTracks")}</p>
        ) : null}
      </section>}
    </PanelShell>
  );
}

function PermissionRoleSelect({ label, value, disabled, onChange, children }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; children: ReactNode }) {
  const { t } = useI18n();
  return <label className="text-sm font-semibold">{label}<select className="field mt-2" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">{t("admin.permissionSettings.noAutomaticRole")}</option>{children}</select></label>;
}

function RoleTracksPanel({
  canWrite,
  catalog,
  token,
  users,
  refreshUsers,
}: {
  canWrite: boolean;
  catalog: PermissionCatalog;
  token: string;
  users: User[];
  refreshUsers: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [tracks, setTracks] = useState<RoleTrack[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [draft, setDraft] = useState<RoleTrack>({ code: "", name: "", description: "", roles: [] });
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const nextTracks = await apiRequest<RoleTrack[]>("/api/v1/admin/role-tracks", {}, token);
    setTracks(nextTracks);
  }, [token]);

  const reportLoadError = useEffectEvent((error: unknown) => notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(reportLoadError);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function selectTrack(code: string) {
    setSelectedCode(code);
    const track = tracks.find((item) => item.code === code);
    if (track) setDraft({ ...track, roles: [...track.roles] });
  }

  function newTrack() {
    setSelectedCode("");
    setDraft({ code: "", name: "", description: "", roles: [] });
  }

  async function saveTrack() {
    if (!canWrite) return;
    setSaving(true);
    try {
      const endpoint = selectedCode ? `/api/v1/admin/role-tracks/${encodeURIComponent(selectedCode)}` : "/api/v1/admin/role-tracks";
      const result = await apiRequest<RoleTrack>(endpoint, { method: selectedCode ? "PUT" : "POST", body: JSON.stringify(draft) }, token);
      setSelectedCode(result.code);
      setDraft({ ...result, roles: [...result.roles] });
      await load();
      notifyAdminNotice(t("admin.roleTracks.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrack() {
    if (!canWrite || !selectedCode || !window.confirm(t("admin.roleTracks.deleteConfirm", { code: selectedCode }))) return;
    setSaving(true);
    try {
      await apiRequest(`/api/v1/admin/role-tracks/${encodeURIComponent(selectedCode)}`, { method: "DELETE" }, token);
      newTrack();
      await load();
      notifyAdminNotice(t("admin.roleTracks.deleted"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function moveUser(direction: "upgrade" | "downgrade") {
    if (!canWrite || !selectedUser || !selectedTrack) return;
    setSaving(true);
    try {
      const result = await apiRequest<{ changed: boolean; roles: string[] }>(
        `/api/v1/admin/users/${selectedUser}/role-tracks/${encodeURIComponent(selectedTrack)}/${direction}`,
        { method: "POST" },
        token,
      );
      await refreshUsers();
      notifyAdminNotice(result.changed ? t("admin.roleTracks.userAdjusted") : t("admin.roleTracks.userUnaffected"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  function updateRoleAt(index: number, role: string) {
    setDraft((current) => ({ ...current, roles: current.roles.map((item, itemIndex) => itemIndex === index ? role : item) }));
  }

  function moveRole(index: number, offset: number) {
    setDraft((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.roles.length) return current;
      const roles = [...current.roles];
      [roles[index], roles[target]] = [roles[target], roles[index]];
      return { ...current, roles };
    });
  }

  return (
    <PanelShell title={t("admin.roleTracks.title")}>
      <section className="grid min-h-[520px] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--line)] pr-4">
          <button className="button-primary focus-ring mb-3 w-full" disabled={!canWrite || saving} type="button" onClick={newTrack}>{t("admin.roleTracks.newTrack")}</button>
          <div className="grid gap-1">
            {tracks.map((track) => (
              <button disabled={saving} key={track.code} className={`focus-ring rounded-md px-3 py-2 text-left ${selectedCode === track.code ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => selectTrack(track.code)}>
                <span className="block font-semibold">{track.name}</span><span className="block font-mono text-xs opacity-75">{track.code}</span>
              </button>
            ))}
            {tracks.length === 0 ? <p className="py-4 text-sm text-[var(--muted)]">{t("admin.roleTracks.noTracks")}</p> : null}
          </div>
        </aside>
        <fieldset className="min-w-0" disabled={!canWrite || saving}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-lg font-bold">{selectedCode ? t("admin.roleTracks.editTrack") : t("admin.roleTracks.newTrack")}</h3><p className="text-sm text-[var(--muted)]">{t("admin.roleTracks.orderHint")}</p></div>
            <div className="flex gap-2">
              {selectedCode ? <button className="button-secondary focus-ring border-red-600 text-red-600" disabled={saving} type="button" onClick={() => void deleteTrack()}>{t("common.delete")}</button> : null}
              <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void saveTrack()}>{t("common.save")}</button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">{t("admin.roleTracks.code")}<input className="field mt-2 font-mono" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} /></label>
            <label className="text-sm font-semibold">{t("admin.roleTracks.name")}<input className="field mt-2" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="text-sm font-semibold md:col-span-2">{t("admin.description")}<textarea className="field mt-2 min-h-20 resize-y" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3"><h4 className="font-bold">{t("admin.roleTracks.orderedRoles")}</h4><button className="button-secondary focus-ring" type="button" onClick={() => setDraft((current) => ({ ...current, roles: [...current.roles, ""] }))}>{t("admin.roleTracks.addRole")}</button></div>
            <div className="mt-3 grid gap-2">
              {draft.roles.map((role, index) => (
                <div key={`${index}-${role}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--line)] py-2">
                  <span className="text-center font-mono text-sm text-[var(--muted)]">{index + 1}</span>
                  <select className="field" value={role} onChange={(event) => updateRoleAt(index, event.target.value)}><option value="">{t("admin.roleTracks.selectRole")}</option>{catalog.roles.map((item) => <option key={item.code} value={item.code}>{item.name || item.code} ({item.code})</option>)}</select>
                  <div className="flex gap-1"><button className="button-secondary focus-ring px-3" disabled={index === 0} title={t("admin.roleTracks.moveUp")} type="button" onClick={() => moveRole(index, -1)}>↑</button><button className="button-secondary focus-ring px-3" disabled={index === draft.roles.length - 1} title={t("admin.roleTracks.moveDown")} type="button" onClick={() => moveRole(index, 1)}>↓</button><button className="button-secondary focus-ring px-3" title={t("common.delete")} type="button" onClick={() => setDraft((current) => ({ ...current, roles: current.roles.filter((_, itemIndex) => itemIndex !== index) }))}>×</button></div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <h4 className="font-bold">{t("admin.roleTracks.quickAdjust")}</h4>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.roleTracks.quickAdjustDescription")}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
              <select className="field" value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="">{t("admin.roleTracks.selectUser")}</option>{users.map((item) => <option key={item.id} value={item.id}>{item.username} (UID {item.id})</option>)}</select>
              <select className="field" value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)}><option value="">{t("admin.roleTracks.selectTrack")}</option>{tracks.map((track) => <option key={track.code} value={track.code}>{track.name}</option>)}</select>
              <button className="button-primary focus-ring" disabled={saving || !selectedUser || !selectedTrack} type="button" onClick={() => void moveUser("upgrade")}>{t("admin.roleTracks.upgrade")}</button>
              <button className="button-secondary focus-ring" disabled={saving || !selectedUser || !selectedTrack} type="button" onClick={() => void moveUser("downgrade")}>{t("admin.roleTracks.downgrade")}</button>
            </div>
          </div>
        </fieldset>
      </section>
    </PanelShell>
  );
}

function GeneralSettingsPanel({ initialConfig, token }: { initialConfig: { siteName: string; logoUrl: string }; token: string }) {
  const { t } = useI18n();
  const [siteName, setSiteName] = useState(initialConfig.siteName || "Mcmods-cn");
	const [logoUrl, setLogoUrl] = useState(initialConfig.logoUrl || "");
	const [logoPreviewUrl, setLogoPreviewUrl] = useState(initialConfig.logoUrl || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage(t("admin.generalSettings.imageOnly"));
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const delegation = await apiRequest<{ authorization: string }>("/api/v1/admin/config/general/logo-upload-authorization", { method: "POST" }, token);
      if (!/^SiteLogo [A-Za-z0-9_-]+$/.test(delegation.authorization)) throw new Error(t("tools.playground.uploadMissingUrl"));
      const response = await fetch("/api/site-logo", {
        method: "POST",
        headers: { Authorization: delegation.authorization },
        body: form,
      });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || t("tools.playground.uploadMissingUrl"));
		setLogoUrl(result.url);
		setLogoPreviewUrl(result.url);
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!siteName.trim() || saving || uploading) return;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest("/api/v1/admin/config/general", {
        method: "PUT",
        body: JSON.stringify({ siteName: siteName.trim(), logoUrl }),
      }, token);
      window.dispatchEvent(new Event("mcmods-site-brand-change"));
      setMessage(t("admin.generalSettings.saved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

	return <PanelShell title={t("admin.generalSettings.title")}><div className="grid gap-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><label className="text-sm font-semibold">{t("admin.generalSettings.siteName")}<input className="field mt-2" maxLength={80} value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label><section><h3 className="text-sm font-semibold">{t("admin.generalSettings.siteLogo")}</h3><div className="mt-3 flex flex-wrap items-center gap-4">{logoUrl ? <img alt="" className="h-20 w-20 rounded-lg border border-[var(--line)] object-contain" src={logoPreviewUrl || logoUrl} /> : <span className="grid h-20 w-20 place-items-center rounded-lg bg-[var(--accent)] text-2xl font-black text-[var(--on-accent)]">M</span>}<div className="flex flex-wrap gap-2"><label className="button-secondary focus-ring cursor-pointer"><span>{uploading ? t("tools.playground.uploading") : t("admin.generalSettings.uploadLogo")}</span><input className="hidden" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadLogo(file); }} /></label>{logoUrl ? <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => { setLogoUrl(""); setLogoPreviewUrl(""); }}>{t("admin.generalSettings.removeLogo")}</button> : null}</div></div></section>{message ? <p className="text-sm font-bold text-[var(--muted)]">{message}</p> : null}<div className="flex justify-end"><button className="button-primary focus-ring" disabled={!siteName.trim() || saving || uploading} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button></div></div></PanelShell>;
}

function ProfileSettingsPanel({ initialConfig, token }: { initialConfig: { signatureMaxBytes: number }; token: string }) {
  const { t } = useI18n();
  const [signatureMaxBytes, setSignatureMaxBytes] = useState(initialConfig.signatureMaxBytes || 256);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await apiRequest<{ signatureMaxBytes: number }>(
        "/api/v1/admin/config/profile",
        { method: "PUT", body: JSON.stringify({ signatureMaxBytes }) },
        token,
      );
      setSignatureMaxBytes(result.signatureMaxBytes);
      notifyAdminNotice(t("admin.profileSettings.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelShell title={t("admin.profileSettings.title")}>
      <div className="grid max-w-3xl gap-5 md:grid-cols-[240px_1fr]">
        <div><h3 className="font-bold">{t("admin.profileSettings.signature")}</h3><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.profileSettings.description")}</p></div>
        <div>
          <label className="text-sm font-semibold">{t("admin.profileSettings.signatureMaxBytes")}<input className="field mt-2" min={1} max={4096} type="number" value={signatureMaxBytes} onChange={(event) => setSignatureMaxBytes(Number(event.target.value))} /></label>
          <p className="mt-2 text-xs text-[var(--muted)]">{t("admin.profileSettings.signatureMaxBytesHint")}</p>
          <button className="button-primary focus-ring mt-4" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button>
        </div>
      </div>
    </PanelShell>
  );
}

function MarkdownConfigPanel({ initialConfig, token }: { initialConfig: MarkdownRendererConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => normalizeMarkdownConfig(initialConfig));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const toggles: Array<keyof MarkdownRendererConfig> = [
    "core",
    "abbreviations",
    "emoji",
    "footnotes",
    "subscript",
    "superscript",
    "taskLists",
    "katex",
    "expandTabs",
    "imageSize",
    "plantUML",
    "codeHighlight",
    "enhancedTables",
    "collapsibleBlocks",
    "alertBlocks",
    "toc",
  ];

  async function saveMarkdownConfig() {
    setSaving(true);
    setMessage("");
    try {
      const saved = await apiRequest<MarkdownRendererConfig>(
        "/api/v1/admin/config/markdown",
        { method: "PUT", body: JSON.stringify(normalizeMarkdownConfig(draft)) },
        token,
      );
      setDraft(normalizeMarkdownConfig(saved));
      setMessage(t("admin.markdown.configSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="surface rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("admin.markdown.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.markdown.description")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={saveMarkdownConfig}>
            {saving ? t("admin.saving") : t("admin.markdown.save")}
          </button>
        </div>
        {message ? <InlineMessage text={message} /> : null}
      </section>

      <section className="surface rounded-lg p-4">
        <h3 className="mb-3 font-bold">{t("admin.markdown.parserSwitches")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {toggles.map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3 text-sm font-semibold">
              <span>{t(`admin.markdown.parsers.${key}`)}</span>
              <input
                checked={Boolean(draft[key])}
                type="checkbox"
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="surface rounded-lg p-4">
        <h3 className="mb-3 font-bold">{t("admin.markdown.options")}</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold">
            {t("admin.markdown.tabSize")}
            <input className="field mt-2" min={1} max={8} type="number" value={draft.tabSize} onChange={(event) => setDraft((current) => ({ ...current, tabSize: Number(event.target.value) }))} />
          </label>
          <label className="text-sm font-semibold xl:col-span-2">
            {t("admin.markdown.plantUMLServer")}
            <input className="field mt-2" readOnly value="/plantuml" />
            <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">{t("admin.markdown.plantUMLServerHint")}</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {t("admin.markdown.tocMinDepth")}
              <input className="field mt-2" min={1} max={6} type="number" value={draft.tocMinDepth} onChange={(event) => setDraft((current) => ({ ...current, tocMinDepth: Number(event.target.value) }))} />
            </label>
            <label className="text-sm font-semibold">
              {t("admin.markdown.tocMaxDepth")}
              <input className="field mt-2" min={1} max={6} type="number" value={draft.tocMaxDepth} onChange={(event) => setDraft((current) => ({ ...current, tocMaxDepth: Number(event.target.value) }))} />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}

function sameMailDestination(left: { host: string; port: string | number; username: string }, right: { host: string; port: string | number; username: string }) {
  const host = (value: string) => value.trim().replace(/[A-Z]/g, letter => letter.toLowerCase());
  return host(left.host) === host(right.host) && Number(left.port) === Number(right.port) && left.username === right.username;
}

function MailPanelV2({ config: initialConfig, token }: { config: MailConfig; token: string }) {
  const [config, setConfig] = useState(initialConfig);
  const { t } = useI18n();
  const [destination, setDestination] = useState({ host: initialConfig.host, port: String(initialConfig.port), username: initialConfig.username });
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [serverDecision, setServerDecision] = useState(false);
  const saveInFlight = useRef(false);
  const needsDecision = serverDecision || config.hasPassword && !sameMailDestination(destination, config);
  const missingDecision = needsDecision && !password.trim() && !clearPassword;

  function changeDestination(field: keyof typeof destination, value: string) {
    const next = { ...destination, [field]: value };
    if (!sameMailDestination(next, destination)) {
      setPassword("");
      setClearPassword(false);
    }
    setDestination(next);
  }

  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveInFlight.current || missingDecision) return;
    saveInFlight.current = true;
    setSaving(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      enabled: form.get("enabled") === "on",
      host: destination.host.trim(),
      port: Number(destination.port),
      username: destination.username,
      ...(clearPassword ? { clearPassword: true } : password.trim() ? { password } : {}),
      from: String(form.get("from") ?? ""),
      useTLS: form.get("useTLS") === "on",
    };
    try {
      const saved = await apiRequest<MailConfig>("/api/v1/admin/config/mail", { method: "PUT", body: JSON.stringify(payload) }, token);
      setConfig(saved);
      setDestination({ host: saved.host, port: String(saved.port), username: saved.username });
      setPassword("");
      setClearPassword(false);
      setServerDecision(false);
      setMessage(t("admin.saveSuccess"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "MAIL_PASSWORD_DECISION_REQUIRED") {
        setServerDecision(true);
        setMessage(t("admin.mailPasswordDecision"));
      } else setMessage(cleanError(error));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function testMail() {
    setTesting(true);
    setMessage("");
    try {
      await apiRequest<{ sent: boolean }>("/api/v1/admin/mail/test", { method: "POST", body: JSON.stringify({ to: testTo }) }, token);
      setMessage(t("admin.saveSuccess"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigBlock title={t("admin.smtpConfig")}>
        <form onSubmit={saveMail}>
          <fieldset className="grid min-w-0 gap-3" disabled={saving}>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input defaultChecked={config.enabled} name="enabled" type="checkbox" />
            {t("common.enabled")}
          </label>
          <label className="text-sm font-semibold">
            {t("admin.server")}
            <input className="field mt-2" value={destination.host} onChange={event => changeDestination("host", event.target.value)} name="host" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {t("admin.port")}
              <input className="field mt-2" value={destination.port} onChange={event => changeDestination("port", event.target.value)} min={1} max={65535} required name="port" type="number" />
            </label>
            <label className="text-sm font-semibold">
              {t("admin.sender")}
              <input className="field mt-2" defaultValue={config.from} name="from" />
            </label>
          </div>
          <label className="text-sm font-semibold">
            {t("admin.username")}
            <input className="field mt-2" value={destination.username} onChange={event => changeDestination("username", event.target.value)} name="username" />
          </label>
          <label className="text-sm font-semibold">
            {t("login.password")}
            <input className="field mt-2" autoComplete="new-password" name="password" disabled={clearPassword} value={password} onChange={event => setPassword(event.target.value)} placeholder={!needsDecision && config.hasPassword && !clearPassword ? t("admin.clientSecretSaved") : ""} type="password" />
          </label>
          {(config.hasPassword || serverDecision) && <label className="flex items-center gap-2 text-sm font-semibold">
            <input name="clearPassword" type="checkbox" checked={clearPassword} onChange={event => { setClearPassword(event.target.checked); if (event.target.checked) setPassword(""); }} />
            {t("admin.nats.clearPassword")}
          </label>}
          {needsDecision && <p role="status" className="text-sm">{t("admin.mailPasswordDecision")}</p>}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input defaultChecked={config.useTLS} name="useTLS" type="checkbox" />
            TLS / STARTTLS
          </label>
          <button className="button-primary focus-ring" disabled={saving || missingDecision} type="submit">
            {saving ? t("admin.saving") : t("admin.saveMail")}
          </button>
          </fieldset>
        </form>
      </ConfigBlock>
      <ConfigBlock title={t("admin.testSend")}>
        <ConfigLine label={t("admin.status")} value={config.enabled ? t("common.enabled") : t("common.disabled")} />
        <ConfigLine label={t("admin.server")} value={config.host || t("admin.notConfigured")} />
        <ConfigLine label={t("admin.sender")} value={config.from || t("admin.notConfigured")} />
        <div className="grid gap-2 pt-2">
          <input className="field" onChange={(event) => setTestTo(event.target.value)} placeholder="test@example.com" type="email" value={testTo} />
          <button className="button-secondary focus-ring" disabled={testing || saving || !config.enabled || !testTo.trim()} type="button" onClick={testMail}>
            {testing ? t("admin.sending") : t("admin.sendTestMail")}
          </button>
          {message ? <InlineMessage text={message} /> : null}
        </div>
      </ConfigBlock>
    </div>
  );
}

export { NATSConfigPanel, ModImportConfigPanel, AuthPanelV2, PermissionSettingsPanel, RoleTracksPanel, GeneralSettingsPanel, ProfileSettingsPanel, MarkdownConfigPanel, MailPanelV2 };
