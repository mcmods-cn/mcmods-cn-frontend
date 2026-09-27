"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import type { LevelConfig, RoleTrack } from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import { buildNATSUpdatePayload, type NATSConfig, type NATSTaskConfig } from "../_lib/nats-config.mts";
import { AdminDeadLetterPanel } from "./admin-dead-letter-panel";
import { AIConfig, AIProviderProtocol, AdminConfig, ConfigBlock, ConfigLine, EmptyState, InlineMessage, LogRow, MailConfig, ModImportConfig, ModImportProviderConfig, OAuthConfig, PanelShell, PermissionCatalog, PermissionDefaults, Role, User, aiProviderProtocols, aiTaskTypeLabel, aiTranslationTaskTypes, cleanError, displayCell, normalizeAIModelProviders, normalizeAIProtocols, notifyAdminNotice, saveAIConfig, setAIModel, setAIProvider, setAITaskModel, valueText } from "./admin-console-shared";

function NATSConfigPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<NATSConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<NATSConfig>("/api/v1/admin/config/nats", {}, token)
      .then((config) => {
        if (!cancelled) setDraft({ ...config, password: "", token: "", clearPassword: false, clearToken: false });
      })
      .catch((error) => {
        if (!cancelled) setMessage(cleanError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await apiRequest<NATSConfig>(
        "/api/v1/admin/config/nats",
        {
          method: "PUT",
          body: JSON.stringify(buildNATSUpdatePayload(draft)),
        },
        token,
      );
      setDraft({ ...saved, password: "", token: "", clearPassword: false, clearToken: false });
      notifyAdminNotice(t("admin.nats.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  function updateTask(index: number, patch: Partial<NATSTaskConfig>) {
    if (!draft) return;
    setDraft({ ...draft, tasks: draft.tasks.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task) });
  }

  if (!draft) {
    return <EmptyState text={message || t("common.loading")} />;
  }

  const connected = draft.status.connected;
  const statusText = !draft.enabled
    ? t("admin.nats.disabledStatus")
    : connected
      ? t("admin.nats.connectedStatus")
      : t("admin.nats.disconnectedStatus");

  return (
    <div className="grid gap-4">
      <section className="surface rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("admin.nats.title")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.nats.description")}</p>
            <p className={`mt-2 text-sm font-bold ${connected ? "text-[var(--accent)]" : "text-[var(--warning)]"}`}>
              {statusText}{draft.status.lastError ? ` / ${draft.status.lastError}` : ""}
            </p>
          </div>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>
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
            <input checked={draft.outboxEnabled} type="checkbox" onChange={(event) => setDraft({ ...draft, outboxEnabled: event.target.checked })} />
            {t("admin.nats.outboxEnabled")}
          </label>
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
      <AdminDeadLetterPanel token={token} />
    </div>
  );
}

function ModImportConfigPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ModImportConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<ModImportConfig>("/api/v1/admin/config/mod-imports", {}, token)
      .then((config) => { if (!cancelled) setDraft(config); })
      .catch((error) => { if (!cancelled) setMessage(cleanError(error)); });
    return () => { cancelled = true; };
  }, [token]);

  function updateProvider(provider: "modrinth" | "curseforge" | "github", patch: Partial<ModImportProviderConfig>) {
    if (!draft) return;
    setDraft({ ...draft, [provider]: { ...draft[provider], ...patch } });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await apiRequest<ModImportConfig>("/api/v1/admin/config/mod-imports", {
        method: "PUT",
        body: JSON.stringify(draft),
      }, token);
      setDraft(saved);
      notifyAdminNotice(t("admin.modImport.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <EmptyState text={message || t("common.loading")} />;

  return (
    <div className="grid gap-4">
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("admin.modImport.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.modImport.description")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>
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
        {(["modrinth", "curseforge", "github"] as const).map((provider) => {
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
    </div>
  );
}

function AIProvidersPanel({ initialConfig, token }: { initialConfig: AIConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => normalizeAIProtocols(initialConfig));
  const [saving, setSaving] = useState(false);

  async function save() {
    await saveAIConfig(draft, token, setDraft, setSaving, t);
  }

  return (
    <div className="grid gap-4">
      <AISettingsHeader title={t("admin.ai.providers")} description={t("admin.ai.providersDesc")} saving={saving} onSave={save} />
      <section className="surface rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold">{t("admin.ai.providerList")}</h3>
          <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, providers: [...draft.providers, { code: "", name: "", enabled: false, baseUrl: "", apiKey: "", protocol: "openai-compatible", notes: "" }] })}>
            {t("admin.ai.addProvider")}
          </button>
        </div>
        <div className="grid gap-3">
          {draft.providers.map((provider, index) => (
            <div key={`ai-provider-${index}`} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 xl:grid-cols-[90px_1fr_1fr_1fr_1fr_80px]">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input checked={provider.enabled} type="checkbox" onChange={(event) => setAIProvider(draft, setDraft, index, { enabled: event.target.checked })} />
                {t("common.enabled")}
              </label>
              <input className="field" value={provider.code} placeholder={t("admin.ai.providerCode")} onChange={(event) => setAIProvider(draft, setDraft, index, { code: event.target.value })} />
              <input className="field" value={provider.name} placeholder={t("admin.name")} onChange={(event) => setAIProvider(draft, setDraft, index, { name: event.target.value })} />
              <input className="field" value={provider.baseUrl} placeholder="Base URL" onChange={(event) => setAIProvider(draft, setDraft, index, { baseUrl: event.target.value })} />
              <input className="field" value={provider.apiKey ?? ""} placeholder={provider.hasApiKey ? t("admin.clientSecretSaved") : "API Key"} type="password" onChange={(event) => setAIProvider(draft, setDraft, index, { apiKey: event.target.value })} />
              <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, providers: draft.providers.filter((_, itemIndex) => itemIndex !== index) })}>
                {t("common.delete")}
              </button>
              <label className="text-sm font-semibold xl:col-span-2">
                {t("admin.ai.protocol")}
                <select
                  className="field mt-2"
                  value={provider.protocol}
                  onChange={(event) => setAIProvider(draft, setDraft, index, { protocol: event.target.value as AIProviderProtocol })}
                >
                  {aiProviderProtocols.map((protocol) => (
                    <option key={protocol.value} value={protocol.value}>{protocol.label}</option>
                  ))}
                </select>
              </label>
              <input className="field xl:col-span-4" value={provider.notes} placeholder={t("admin.description")} onChange={(event) => setAIProvider(draft, setDraft, index, { notes: event.target.value })} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AIModelsPanel({ initialConfig, token }: { initialConfig: AIConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => normalizeAIModelProviders(initialConfig));
  const [saving, setSaving] = useState(false);
  const availableProviders = draft.providers.filter((provider) => provider.code.trim());

  useEffect(() => {
    let cancelled = false;
    apiRequest<AIConfig>("/api/v1/admin/ai/config", {}, token)
      .then((config) => {
        if (!cancelled) setDraft(normalizeAIModelProviders(config));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="grid gap-4">
      <AISettingsHeader title={t("admin.ai.models")} description={t("admin.ai.modelsDesc")} saving={saving} onSave={() => saveAIConfig(draft, token, setDraft, setSaving, t)} />
      <section className="surface rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold">{t("admin.ai.modelList")}</h3>
          <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, models: [...draft.models, { provider: availableProviders[0]?.code ?? "", model: "", displayName: "", enabled: false, contextTokens: 0, maxOutputTokens: 0, inputPricePerMillion: 0, outputPricePerMillion: 0 }] })}>
            {t("admin.ai.addModel")}
          </button>
        </div>
        <div className="grid gap-3">
          <div className="hidden gap-3 px-3 text-xs font-bold text-[var(--muted)] xl:grid xl:grid-cols-[90px_repeat(7,minmax(0,1fr))_80px]">
            <span>{t("common.enabled")}</span>
            <span>{t("admin.ai.provider")}</span>
            <span>{t("admin.ai.modelId")}</span>
            <span>{t("admin.displayName")}</span>
            <span>{t("admin.ai.contextTokens")}</span>
            <span>{t("admin.ai.maxOutputTokens")}</span>
            <span>{t("admin.ai.inputPrice")}</span>
            <span>{t("admin.ai.outputPrice")}</span>
            <span>{t("admin.operation")}</span>
          </div>
          {draft.models.map((model, index) => (
            <div key={`ai-model-${index}`} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 xl:grid-cols-[90px_repeat(7,minmax(0,1fr))_80px]">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input checked={model.enabled} type="checkbox" onChange={(event) => setAIModel(draft, setDraft, index, { enabled: event.target.checked })} />
                {t("common.enabled")}
              </label>
              <select className="field" value={model.provider} onChange={(event) => setAIModel(draft, setDraft, index, { provider: event.target.value })}>
                <option disabled value="">{t("admin.ai.selectProvider")}</option>
                {availableProviders.map((provider) => (
                  <option key={provider.code} value={provider.code}>{provider.name ? `${provider.name} (${provider.code})` : provider.code}</option>
                ))}
              </select>
              <input className="field" value={model.model} placeholder={t("admin.ai.modelId")} onChange={(event) => setAIModel(draft, setDraft, index, { model: event.target.value })} />
              <input className="field" value={model.displayName} placeholder={t("admin.displayName")} onChange={(event) => setAIModel(draft, setDraft, index, { displayName: event.target.value })} />
              <input className="field" type="number" value={model.contextTokens} placeholder={t("admin.ai.contextTokens")} onChange={(event) => setAIModel(draft, setDraft, index, { contextTokens: Number(event.target.value) })} />
              <input className="field" type="number" value={model.maxOutputTokens} placeholder={t("admin.ai.maxOutputTokens")} onChange={(event) => setAIModel(draft, setDraft, index, { maxOutputTokens: Number(event.target.value) })} />
              <input className="field" type="number" value={model.inputPricePerMillion} placeholder={t("admin.ai.inputPrice")} onChange={(event) => setAIModel(draft, setDraft, index, { inputPricePerMillion: Number(event.target.value) })} />
              <input className="field" type="number" value={model.outputPricePerMillion} placeholder={t("admin.ai.outputPrice")} onChange={(event) => setAIModel(draft, setDraft, index, { outputPricePerMillion: Number(event.target.value) })} />
              <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, models: draft.models.filter((_, itemIndex) => itemIndex !== index) })}>
                {t("common.delete")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AITaskModelsPanel({ initialConfig, token }: { initialConfig: AIConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => normalizeAIProtocols(initialConfig));
  const [saving, setSaving] = useState(false);
  const enabledProviderCodes = new Set(draft.providers.filter((provider) => provider.enabled).map((provider) => provider.code));
  const availableModels = draft.models.filter((model) => model.enabled && enabledProviderCodes.has(model.provider));

  useEffect(() => {
    let cancelled = false;
    apiRequest<AIConfig>("/api/v1/admin/ai/config", {}, token)
      .then((config) => {
        if (!cancelled) setDraft(normalizeAIProtocols(config));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="grid gap-4">
      <AISettingsHeader title={t("admin.ai.taskModels")} description={t("admin.ai.taskModelsDesc")} saving={saving} onSave={() => saveAIConfig(draft, token, setDraft, setSaving, t)} />
      <section className="surface rounded-lg p-4">
        <div className="grid gap-3">
          <div className="hidden gap-3 px-3 text-xs font-bold text-[var(--muted)] xl:grid xl:grid-cols-[minmax(190px,1.2fr)_minmax(240px,1.4fr)_120px_minmax(300px,2fr)]">
            <span>{t("admin.ai.taskType")}</span>
            <span>{t("admin.ai.model")}</span>
            <span>{t("admin.ai.timeoutSeconds")}</span>
            <span>{t("admin.ai.prompt")}</span>
          </div>
          {draft.taskModels.map((item, index) => (
            <div key={item.taskType} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 xl:grid-cols-[minmax(190px,1.2fr)_minmax(240px,1.4fr)_120px_minmax(300px,2fr)]">
              <div className="flex min-h-11 items-center font-semibold">{aiTaskTypeLabel(item.taskType, t)}</div>
              <select className="field" value={item.modelKey} onChange={(event) => setAITaskModel(draft, setDraft, index, { modelKey: event.target.value })}>
                <option value="">{t("admin.ai.selectModel")}</option>
                {availableModels.map((model) => {
                  const key = `${model.provider}/${model.model}`;
                  return <option key={key} value={key}>{model.displayName ? `${model.displayName} (${key})` : key}</option>;
                })}
              </select>
              <input className="field" type="number" value={item.timeoutSeconds} placeholder={t("admin.ai.timeoutSeconds")} onChange={(event) => setAITaskModel(draft, setDraft, index, { timeoutSeconds: Number(event.target.value) })} />
              <textarea
                className="field min-h-24 resize-y py-2"
                value={item.prompt ?? ""}
                placeholder={t("admin.ai.promptPlaceholder")}
                onChange={(event) => setAITaskModel(draft, setDraft, index, { prompt: event.target.value })}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AICostsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<Record<string, unknown>>("/api/v1/admin/ai/stats", {}, token)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((error) => setMessage(cleanError(error)));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const byStatus = Array.isArray(stats?.byStatus) ? stats.byStatus as LogRow[] : [];
  const byProvider = Array.isArray(stats?.byProvider) ? stats.byProvider as LogRow[] : [];

  return (
    <div className="grid gap-4">
      <section className="surface rounded-lg p-4">
        <h2 className="text-xl font-bold">{t("admin.ai.costs")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.ai.costsDesc")}</p>
        {message ? <InlineMessage text={message} /> : null}
      </section>
      <AIStatsTable title={t("admin.ai.byStatus")} rows={byStatus} />
      <AIStatsTable title={t("admin.ai.byProvider")} rows={byProvider} />
    </div>
  );
}

function AITaskLogsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    try {
      setRows(await apiRequest<LogRow[]>(`/api/v1/admin/ai/tasks?${params.toString()}`, {}, token));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }, [query, status, token]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    apiRequest<LogRow[]>(`/api/v1/admin/ai/tasks?${params.toString()}`, {}, token)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((error) => {
        if (!cancelled) setMessage(cleanError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [query, status, token]);

  async function createTestTask() {
    setMessage("");
    try {
      await apiRequest<{ id: string; taskUid: string; status: string }>(
        "/api/v1/admin/ai/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            taskType: aiTranslationTaskTypes.i18n,
            payload: { sourceLocale: "zh-CN", targetLocale: "en-US", items: [{ key: "test", text: "测试" }] },
          }),
        },
        token,
      );
      await load();
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("admin.ai.taskLogs")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.ai.taskLogsDesc")}</p>
        </div>
        <button className="button-primary focus-ring" type="button" onClick={createTestTask}>
          {t("admin.ai.createTestTask")}
        </button>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_120px]">
        <input className="field" value={query} placeholder={t("admin.logs.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t("admin.ai.allStatuses")}</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
        </select>
        <button className="button-secondary focus-ring" type="button" onClick={load}>
          {t("admin.logs.query")}
        </button>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr>
              {["ID", t("admin.ai.taskType"), t("admin.ai.provider"), t("admin.ai.model"), t("admin.status"), t("admin.ai.tokens"), t("admin.ai.cost"), t("admin.createdAt")].map((heading) => (
                <th key={heading} className="border-b border-[var(--line)] py-2">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="align-top">
                <td className="border-b border-[var(--line)] py-2 font-mono text-xs">{String(row.task_uid ?? row.id)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.task_type)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.provider)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.model)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.status)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.input_tokens)} / {displayCell(row.output_tokens)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.cost_micros)}</td>
                <td className="border-b border-[var(--line)] py-2">{displayCell(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : null}
    </section>
  );
}

function AISettingsHeader({ title, description, saving, onSave }: { title: string; description: string; saving: boolean; onSave: () => void }) {
  const { t } = useI18n();

  return (
    <section className="surface rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        <button className="button-primary focus-ring" disabled={saving} type="button" onClick={onSave}>
          {saving ? t("admin.saving") : t("admin.ai.saveConfig")}
        </button>
      </div>
    </section>
  );
}

function AIStatsTable({ title, rows }: { title: string; rows: LogRow[] }) {
  const { t } = useI18n();
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section className="surface rounded-lg p-4">
      <h3 className="mb-3 font-bold">{title}</h3>
      {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>{columns.map((column) => <th key={column} className="border-b border-[var(--line)] py-2">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => <td key={column} className="border-b border-[var(--line)] py-2">{displayCell(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuthPanelV2({ config, token }: { config: AdminConfig; token: string }) {
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
      <OAuthConfigPanelV2 config={config.oauth} token={token} />
    </div>
  );
}

function PermissionSettingsPanel({ catalog, token }: { catalog: PermissionCatalog; token: string }) {
  const { t } = useI18n();
  const [defaults, setDefaults] = useState<PermissionDefaults>({ registeredRole: "", bannedRole: "" });
  const [levelConfig, setLevelConfig] = useState<LevelConfig | null>(null);
  const [roleTracks, setRoleTracks] = useState<RoleTrack[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<PermissionDefaults>("/api/v1/admin/permission-defaults", {}, token),
      apiRequest<LevelConfig>("/api/v1/admin/levels/config", {}, token),
      apiRequest<RoleTrack[]>("/api/v1/admin/role-tracks", {}, token),
    ])
      .then(([nextDefaults, nextLevelConfig, nextRoleTracks]) => {
        if (cancelled) return;
        setDefaults(nextDefaults);
        setLevelConfig(nextLevelConfig);
        setRoleTracks(nextRoleTracks);
      })
      .catch((error) => notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"));
    return () => { cancelled = true; };
  }, [t, token]);

  function selectLevelRoleTrack(code: string) {
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
    if (!levelConfig) return;
    setSaving(true);
    try {
      const savedLevelConfig = await apiRequest<LevelConfig>(
        "/api/v1/admin/levels/config",
        { method: "PUT", body: JSON.stringify(levelConfig) },
        token,
      );
      const result = await apiRequest<PermissionDefaults>("/api/v1/admin/permission-defaults", { method: "PUT", body: JSON.stringify(defaults) }, token);
      setLevelConfig(savedLevelConfig);
      setDefaults(result);
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
        <button className="button-primary focus-ring" disabled={saving || !levelConfig} type="button" onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>

      <section className="grid gap-4 border-b border-[var(--line)] py-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <h3 className="font-black">{t("admin.permissionSettings.accountDefaults")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.permissionSettings.accountDefaultsDescription")}</p>
        </div>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.registeredRole")}
          value={defaults.registeredRole}
          onChange={(registeredRole) => setDefaults((current) => ({ ...current, registeredRole }))}
        >
          {roleOptions(catalog.roles)}
        </PermissionRoleSelect>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.bannedRole")}
          value={defaults.bannedRole}
          onChange={(bannedRole) => setDefaults((current) => ({ ...current, bannedRole }))}
        >
          {roleOptions(catalog.roles)}
        </PermissionRoleSelect>
      </section>

      <section className="grid gap-4 pt-5">
        <div>
          <h3 className="font-black">{t("admin.permissionSettings.levelRoleTrack")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.permissionSettings.levelRoleTrackDescription")}</p>
        </div>
        <label className="max-w-xl text-sm font-semibold">
          {t("admin.community.roleTrack")}
          <select
            className="field mt-2"
            disabled={!levelConfig}
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
        {roleTracks.length === 0 ? (
          <p className="text-sm font-bold text-[var(--warning)]">{t("admin.permissionSettings.noRoleTracks")}</p>
        ) : null}
      </section>
    </PanelShell>
  );
}

function PermissionRoleSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const { t } = useI18n();
  return <label className="text-sm font-semibold">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t("admin.permissionSettings.noAutomaticRole")}</option>{children}</select></label>;
}

function RoleTracksPanel({
  catalog,
  token,
  users,
  refreshUsers,
}: {
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
    if (selectedCode) {
      const selected = nextTracks.find((track) => track.code === selectedCode);
      if (selected) setDraft(selected);
    }
  }, [selectedCode, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, t]);

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
    setSaving(true);
    try {
      const endpoint = selectedCode ? `/api/v1/admin/role-tracks/${encodeURIComponent(selectedCode)}` : "/api/v1/admin/role-tracks";
      const result = await apiRequest<RoleTrack>(endpoint, { method: selectedCode ? "PUT" : "POST", body: JSON.stringify(draft) }, token);
      setSelectedCode(result.code);
      await load();
      notifyAdminNotice(t("admin.roleTracks.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrack() {
    if (!selectedCode || !window.confirm(t("admin.roleTracks.deleteConfirm", { code: selectedCode }))) return;
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
    if (!selectedUser || !selectedTrack) return;
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
          <button className="button-primary focus-ring mb-3 w-full" type="button" onClick={newTrack}>{t("admin.roleTracks.newTrack")}</button>
          <div className="grid gap-1">
            {tracks.map((track) => (
              <button key={track.code} className={`focus-ring rounded-md px-3 py-2 text-left ${selectedCode === track.code ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => selectTrack(track.code)}>
                <span className="block font-semibold">{track.name}</span><span className="block font-mono text-xs opacity-75">{track.code}</span>
              </button>
            ))}
            {tracks.length === 0 ? <p className="py-4 text-sm text-[var(--muted)]">{t("admin.roleTracks.noTracks")}</p> : null}
          </div>
        </aside>
        <div className="min-w-0">
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
        </div>
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
      const response = await fetch("/api/site-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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

	return <PanelShell title={t("admin.generalSettings.title")}><div className="grid gap-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><label className="text-sm font-semibold">{t("admin.generalSettings.siteName")}<input className="field mt-2" maxLength={80} value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label><section><h3 className="text-sm font-semibold">{t("admin.generalSettings.siteLogo")}</h3><div className="mt-3 flex flex-wrap items-center gap-4">{logoUrl ? <img alt="" className="h-20 w-20 rounded-lg border border-[var(--line)] object-contain" src={logoPreviewUrl || logoUrl} /> : <span className="grid h-20 w-20 place-items-center rounded-lg bg-[var(--accent)] text-2xl font-black text-white">M</span>}<div className="flex flex-wrap gap-2"><label className="button-secondary focus-ring cursor-pointer"><span>{uploading ? t("tools.playground.uploading") : t("admin.generalSettings.uploadLogo")}</span><input className="hidden" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadLogo(file); }} /></label>{logoUrl ? <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => { setLogoUrl(""); setLogoPreviewUrl(""); }}>{t("admin.generalSettings.removeLogo")}</button> : null}</div></div></section>{message ? <p className="text-sm font-bold text-[var(--muted)]">{message}</p> : null}<div className="flex justify-end"><button className="button-primary focus-ring" disabled={!siteName.trim() || saving || uploading} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button></div></div></PanelShell>;
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

function OAuthConfigPanelV2({ config, token }: { config: OAuthConfig; token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const providers = [
    ["wechat", "WeChat"],
    ["qq", "QQ"],
    ["google", "Google"],
    ["github", "GitHub"],
  ] as const;

  async function saveOAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: { providers: Record<string, Record<string, string | boolean>> } = { providers: {} };
    for (const [key] of providers) {
      payload.providers[key] = {
        enabled: form.get(`${key}.enabled`) === "on",
        clientId: String(form.get(`${key}.clientId`) ?? ""),
        clientSecret: String(form.get(`${key}.clientSecret`) ?? ""),
        redirectUri: String(form.get(`${key}.redirectUri`) ?? ""),
      };
    }
    try {
      await apiRequest<OAuthConfig>("/api/v1/admin/config/oauth", { method: "PUT", body: JSON.stringify(payload) }, token);
      setMessage(t("admin.saveSuccess"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4 lg:col-span-2">
      <h2 className="mb-3 text-lg font-bold">{t("admin.oauthConfig")}</h2>
      <form className="grid gap-4" onSubmit={saveOAuth}>
        {providers.map(([key, label]) => {
          const current = config.providers[key] ?? { enabled: false, clientId: "", redirectUri: "", hasClientSecret: false };
          return (
            <div key={key} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[120px_1fr_1fr_1fr]">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input defaultChecked={current.enabled} name={`${key}.enabled`} type="checkbox" />
                {label}
              </label>
              <input className="field" defaultValue={current.clientId} name={`${key}.clientId`} placeholder="AppID / Client ID" />
              <input
                className="field"
                name={`${key}.clientSecret`}
                placeholder={current.hasClientSecret ? t("admin.clientSecretSaved") : "AppSecret / Client Secret"}
                type="password"
              />
              <input className="field" defaultValue={current.redirectUri} name={`${key}.redirectUri`} placeholder={`https://mcmods.cn/api/v1/auth/oauth/${key}/callback`} />
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button className="button-primary focus-ring" type="submit">
            {t("admin.saveOauth")}
          </button>
          {message ? <InlineMessage text={message} /> : null}
        </div>
      </form>
    </section>
  );
}

function MailPanelV2({ config, token }: { config: AdminConfig; token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      enabled: true,
      host: String(form.get("host") ?? ""),
      port: Number(form.get("port") ?? 587),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      from: String(form.get("from") ?? ""),
      useTLS: form.get("useTLS") === "on",
    };
    try {
      await apiRequest<MailConfig>("/api/v1/admin/config/mail", { method: "PUT", body: JSON.stringify(payload) }, token);
      setMessage(t("admin.saveSuccess"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
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
        <form className="grid gap-3" onSubmit={saveMail}>
          <label className="text-sm font-semibold">
            {t("admin.server")}
            <input className="field mt-2" defaultValue={config.mail.host} name="host" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {t("admin.port")}
              <input className="field mt-2" defaultValue={config.mail.port} min={1} name="port" type="number" />
            </label>
            <label className="text-sm font-semibold">
              {t("admin.sender")}
              <input className="field mt-2" defaultValue={config.mail.from} name="from" />
            </label>
          </div>
          <label className="text-sm font-semibold">
            {t("admin.username")}
            <input className="field mt-2" defaultValue={config.mail.username} name="username" />
          </label>
          <label className="text-sm font-semibold">
            Password
            <input className="field mt-2" name="password" placeholder={config.mail.hasPassword ? t("admin.clientSecretSaved") : ""} type="password" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input defaultChecked={config.mail.useTLS} name="useTLS" type="checkbox" />
            TLS / STARTTLS
          </label>
          <button className="button-primary focus-ring" disabled={saving} type="submit">
            {saving ? t("admin.saving") : t("admin.saveMail")}
          </button>
        </form>
      </ConfigBlock>
      <ConfigBlock title={t("admin.testSend")}>
        <ConfigLine label={t("admin.status")} value={config.mail.enabled ? t("admin.configured") : t("admin.notConfigured")} />
        <ConfigLine label={t("admin.server")} value={config.mail.host || t("admin.notConfigured")} />
        <ConfigLine label={t("admin.sender")} value={config.mail.from || t("admin.notConfigured")} />
        <div className="grid gap-2 pt-2">
          <input className="field" onChange={(event) => setTestTo(event.target.value)} placeholder="test@example.com" type="email" value={testTo} />
          <button className="button-secondary focus-ring" disabled={testing} type="button" onClick={testMail}>
            {testing ? t("admin.sending") : t("admin.sendTestMail")}
          </button>
          {message ? <InlineMessage text={message} /> : null}
        </div>
      </ConfigBlock>
    </div>
  );
}

export { NATSConfigPanel, ModImportConfigPanel, AIProvidersPanel, AIModelsPanel, AITaskModelsPanel, AICostsPanel, AITaskLogsPanel, AuthPanelV2, PermissionSettingsPanel, RoleTracksPanel, GeneralSettingsPanel, ProfileSettingsPanel, MarkdownConfigPanel, MailPanelV2 };
