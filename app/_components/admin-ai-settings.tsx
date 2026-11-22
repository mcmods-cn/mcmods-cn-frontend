"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { ApiError, apiErrorMessage } from "../_lib/api-error.mts";
import { aiProviderProtocols, type AIConfig, type AIProviderProtocol, type AIProviderConfig, type AIModelConfig, type AITaskModelConfig, type AISection, aiConfigSnapshot, aiConfigWrite, changedCredentialDestination, mergeAIDraft } from "../_lib/admin-ai-config.mts";
import { aiTaskTypeLabel } from "../_lib/admin-ai-tasks";
import { useI18n } from "../_lib/i18n-provider";
import { notifyAdminNotice } from "./admin-console-shared";

type FormProps = { draft: AIConfig; setDraft: (config: AIConfig) => void };
function AIProvidersForm({ draft, setDraft }: FormProps) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4">
      <div className="surface min-w-0 rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold">{t("admin.ai.providerList")}</h3>
          <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...draft, providers: [...draft.providers, { code: "", name: "", enabled: false, baseUrl: "", apiKey: "", protocol: "openai-compatible", notes: "" }] })}>
            {t("admin.ai.addProvider")}
          </button>
        </div>
        <div className="grid gap-3">
          {draft.providers.map((provider, index) => (
            <div key={`ai-provider-${index}`} className="grid min-w-0 gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm">{t("admin.name")}
                <input className="field" value={provider.name} placeholder={t("admin.name")} onChange={event => setAIProvider(draft, setDraft, index, { name: event.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">{t("admin.ai.providerCode")}
                <input className="field" value={provider.code} placeholder={t("admin.ai.providerCode")} onChange={event => setAIProvider(draft, setDraft, index, { code: event.target.value, clearApiKey: false })} />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">Base URL
                <input className="field" value={provider.baseUrl} placeholder="Base URL" onChange={event => setAIProvider(draft, setDraft, index, { baseUrl: event.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">{t("admin.ai.protocol")}
                <select className="field" value={provider.protocol || "openai-compatible"} onChange={event => setAIProvider(draft, setDraft, index, { protocol: event.target.value as AIProviderProtocol })}>
                  {provider.protocol && !aiProviderProtocols.some(entry => entry.value === provider.protocol) && <option value={provider.protocol}>{provider.protocol}</option>}
                  {aiProviderProtocols.map(protocol => <option key={protocol.value} value={protocol.value}>{protocol.label}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">API Key
                <input className="field" value={provider.apiKey ?? ""} placeholder={provider.hasApiKey ? t("admin.clientSecretSaved") : "API Key"} type="password" autoComplete="new-password" disabled={provider.clearApiKey} onChange={event => setAIProvider(draft, setDraft, index, { apiKey: event.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">{t("admin.description")}
                <input className="field" value={provider.notes} placeholder={t("admin.description")} onChange={event => setAIProvider(draft, setDraft, index, { notes: event.target.value })} />
              </label>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm"><input checked={provider.enabled} type="checkbox" onChange={event => setAIProvider(draft, setDraft, index, { enabled: event.target.checked })} />{t("common.enabled")}</label>
                {provider.hasApiKey && <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!provider.clearApiKey} onChange={event => setAIProvider(draft, setDraft, index, { clearApiKey: event.target.checked, apiKey: "" })} />{t("admin.ai.clearKey")}
                </label>}
                <button className="button-secondary focus-ring sm:ml-auto" type="button" onClick={() => setDraft({ ...draft, providers: draft.providers.filter((_, row) => row !== index) })}>{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIModelsForm({ draft, setDraft }: FormProps) {
  const { t } = useI18n();
  const availableProviders = draft.providers.filter((provider) => provider.code.trim());

  return (
    <div className="grid gap-4">
      <div className="surface min-w-0 rounded-lg p-4">
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
                {model.provider && !availableProviders.some(provider => provider.code === model.provider) && <option value={model.provider}>{model.provider}</option>}
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
      </div>
    </div>
  );
}

function AITaskModelsForm({ draft, setDraft }: FormProps) {
  const { t } = useI18n();
  const enabledProviderCodes = new Set(draft.providers.filter((provider) => provider.enabled).map((provider) => provider.code));
  const availableModels = draft.models.filter((model) => model.enabled && enabledProviderCodes.has(model.provider));

  return (
    <div className="grid gap-4">
      <div className="surface min-w-0 rounded-lg p-4">
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
                {item.modelKey && !availableModels.some(model => `${model.provider}/${model.model}` === item.modelKey) && <option value={item.modelKey}>{item.modelKey}</option>}
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
      </div>
    </div>
  );
}


function setAIProvider(draft: AIConfig, setDraft: (config: AIConfig) => void, index: number, patch: Partial<AIProviderConfig>) {
  setDraft({ ...draft, providers: draft.providers.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function setAIModel(draft: AIConfig, setDraft: (config: AIConfig) => void, index: number, patch: Partial<AIModelConfig>) {
  setDraft({ ...draft, models: draft.models.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function setAITaskModel(draft: AIConfig, setDraft: (config: AIConfig) => void, index: number, patch: Partial<AITaskModelConfig>) {
  setDraft({ ...draft, taskModels: draft.taskModels.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

const forms = { providers: AIProvidersForm, models: AIModelsForm, taskModels: AITaskModelsForm };

export function AISettingsPanel({ section, token, canWrite }: { section: AISection; token: string; canWrite: boolean }) {
  const { t } = useI18n();
  const [base, setBase] = useState<AIConfig>();
  const [draft, setDraft] = useState<AIConfig>();
  const [latest, setLatest] = useState<AIConfig>();
  const [conflict, setConflict] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const pending = useRef<AbortController | null>(null);
  const Form = forms[section];
  const canEdit = canWrite && !!base?.revision && !denied && !busy && !conflict;

  function accept(snapshot: AIConfig, nextDraft = snapshot) {
    setBase(snapshot); setDraft(nextDraft); setConflict(false); setLatest(undefined); setLoadError(null);
  }
  function forbid() {
    setDenied(true); setDraft(undefined); setBase(undefined); setLatest(undefined); setConflict(false);
  }

  const read = useCallback(async (compare: boolean) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const snapshot = aiConfigSnapshot(await apiRequest<AIConfig>("/api/v1/admin/ai/config", { cache: "no-store", signal: controller.signal }, token));
      if (controller.signal.aborted) return;
      if (compare) setLatest(snapshot);
      else accept(snapshot);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) forbid();
      setLoadError(error);
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  }, [token]);

  function requestRead(compare: boolean) {
    setBusy("load"); setLoadError(null);
    void read(compare);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void read(false); }, 0);
    return () => { window.clearTimeout(timer); pending.current?.abort(); pending.current = null; };
  }, [read]);

  async function save() {
    if (!canEdit || !draft || pending.current) return;
    const controller = new AbortController();
    pending.current = controller; setBusy("save");
    try {
      const snapshot = aiConfigSnapshot(await apiRequest<AIConfig>("/api/v1/admin/ai/config", {
        method: "PUT", body: JSON.stringify(aiConfigWrite(draft)), signal: controller.signal,
      }, token));
      if (controller.signal.aborted) return;
      if (!snapshot.revision) { setConflict(true); setLatest(snapshot); return; }
      accept(snapshot);
      notifyAdminNotice(t("admin.ai.configSaved"));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 409 && error.code === "AI_CONFIG_CONFLICT"
        || error.status === 428 && error.code === "AI_CONFIG_REVISION_REQUIRED")) {
        setConflict(true); setLatest(undefined); setLoadError(null);
      } else {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          forbid();
          notifyAdminNotice(t("admin.permissionDeniedBody"), t("admin.permissionDeniedTitle"), "danger");
          return;
        }
        let message = apiErrorMessage(error, t, t("admin.ai.configSaveFailed"));
        if (error instanceof ApiError && error.code === "AI_PROVIDER_KEY_ACTION_REQUIRED") {
          const details = error.details;
          const provider = details && typeof details === "object" && "provider" in details && typeof details.provider === "string" ? details.provider : "";
          message = t("admin.ai.keyActionRequired", { provider });
        }
        notifyAdminNotice(message, t("admin.noticeTitle"), "danger");
      }
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  }

  const merged = base && draft && latest ? mergeAIDraft(section, base, draft, latest) : undefined;
  const movedKey = merged && draft ? changedCredentialDestination(draft, merged) : undefined;
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)]">{t(`admin.ai.${section}Desc`)}</p>
      <button className="button-primary focus-ring disabled:cursor-not-allowed disabled:opacity-50" disabled={!canEdit} onClick={save} type="button">{busy === "save" ? t("admin.saving") : t("admin.ai.saveConfig")}</button>
    </div>
    {busy === "load" && <p role="status" className="text-sm text-[var(--muted)]">{t("common.loading")}</p>}
    {loadError !== null && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--danger)]">
      {apiErrorMessage(loadError, t, t("common.loadFailed"))}
      {!denied && <button className="button-secondary focus-ring" type="button" onClick={() => requestRead(conflict)}>{t("common.retry")}</button>}
    </div>}
    {denied && <p role="status">{t("admin.permissionDeniedBody")}</p>}
    {base && (!canWrite || !base.revision) && <p role="status" className="text-sm">{t(base.revision ? "admin.ai.readOnly" : "admin.ai.noRevision")}</p>}
    {conflict && <section role="alert" className="surface grid min-w-0 gap-3 rounded-lg border border-[var(--line)] p-4">
      <strong>{t(latest && !latest.revision ? "admin.ai.noRevision" : "admin.ai.configConflict")}</strong>
      {!latest ? <button className="button-secondary focus-ring justify-self-start" type="button" disabled={!!busy} onClick={() => requestRead(true)}>{t("admin.ai.compareLatest")}</button> :
        <>
          <details open className="min-w-0"><summary className="focus-ring cursor-pointer font-semibold">{t("admin.ai.serverVersion")}</summary>
            <fieldset disabled className="mt-2 min-w-0"><Form draft={latest} setDraft={() => {}} /></fieldset>
          </details>
          {draft?.providers.some(provider => provider.apiKey || provider.clearApiKey) && <p className="text-sm">{t("admin.ai.reviewHiddenKey")}</p>}
          {movedKey && <p className="text-sm">{t("admin.ai.reviewKeyDestination", movedKey)}</p>}
          {!merged && <p className="text-sm">{t(latest.revision ? "admin.ai.structuralConflict" : "admin.ai.noRevision")}</p>}
          <div className="flex flex-wrap gap-2">
            {merged && !movedKey && <button type="button" className="button-secondary focus-ring" onClick={() => accept(latest, merged)}>{t("admin.ai.applyEdits")}</button>}
            <button type="button" className="button-secondary focus-ring" onClick={() => accept(latest)}>{t("admin.ai.discardEdits")}</button>
          </div>
        </>}
    </section>}
    <fieldset className="grid min-w-0 gap-3" disabled={!canEdit}>
      {conflict && <legend className="mb-2 font-semibold">{t("admin.ai.localDraft")}</legend>}
      {draft && <Form draft={draft} setDraft={value => { if (canEdit) setDraft(value); }} />}
    </fieldset>
  </div>;
}
