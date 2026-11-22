export type AIConfig = {
  revision?: string;
  providers: AIProviderConfig[];
  models: AIModelConfig[];
  taskModels: AITaskModelConfig[];
  quotas: AIQuotaConfig[];
  translation: AITranslationConfig;
};

export type AIProviderConfig = {
  code: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  hasApiKey?: boolean;
  protocol: AIProviderProtocol;
  notes: string;
};

export type AIProviderProtocol = "openai-compatible" | "anthropic";

export const aiProviderProtocols: Array<{ value: AIProviderProtocol; label: string }> = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "anthropic", label: "Anthropic" },
];

export type AIModelConfig = {
  provider: string;
  model: string;
  displayName: string;
  enabled: boolean;
  contextTokens: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

export type AITaskModelConfig = {
  taskType: string;
  modelKey: string;
  timeoutSeconds: number;
  prompt: string;
};

export type AIQuotaConfig = {
  scope: string;
  subject: string;
  period: string;
  requestLimit: number;
  tokenLimit: number;
  costLimitCny: number;
};

export type AITranslationConfig = {
  enabled: boolean;
  sourceLocale: string;
  targetLocales: string[];
  taskType: string;
  autoSubmit: boolean;
  glossary: string;
};

export type AISection = "providers" | "models" | "taskModels";
const revisionPattern = /^[a-f0-9]{64}$/;

// A complete settings snapshot is sent back on save, including sections not
// displayed in the current panel. Reject incomplete rows or lossy Go int64s.
function fields(value: unknown, strings: string[], flags: string[], integers: string[], decimals: string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return strings.every(key => typeof row[key] === "string") && flags.every(key => typeof row[key] === "boolean")
    && integers.every(key => Number.isSafeInteger(row[key])) && decimals.every(key => Number.isFinite(row[key]));
}

export function aiConfigSnapshot(config: AIConfig): AIConfig {
  if (!config || !fields(config.translation, ["sourceLocale", "taskType", "glossary"], ["enabled", "autoSubmit"], [])) throw new Error("Invalid AI configuration");
  const locales = config.translation.targetLocales;
  if (locales !== null && !(Array.isArray(locales) && locales.every(value => typeof value === "string"))) throw new Error("Invalid translation locales");
  const complete = (rows: unknown, check: (row: unknown) => boolean) => rows === null || Array.isArray(rows) && rows.every(check);
  if (!complete(config.providers, row => fields(row, ["code", "name", "baseUrl", "protocol", "notes"], ["enabled"], []))
    || !complete(config.models, row => fields(row, ["provider", "model", "displayName"], ["enabled"], ["contextTokens", "maxOutputTokens"], ["inputPricePerMillion", "outputPricePerMillion"]))
    || !complete(config.taskModels, row => fields(row, ["taskType", "modelKey", "prompt"], [], ["timeoutSeconds"]))
    || !complete(config.quotas, row => fields(row, ["scope", "subject", "period"], [], ["requestLimit", "tokenLimit", "costLimitCny"])))
    throw new Error("Incomplete AI configuration");
  return {
    translation: { ...config.translation, targetLocales: locales ?? [] },
    revision: typeof config.revision === "string" && revisionPattern.test(config.revision) ? config.revision : undefined,
    providers: (config.providers ?? []).map(provider => {
      const result = { ...provider };
      delete result.apiKey;
      delete result.clearApiKey;
      return result;
    }),
    models: config.models ?? [], taskModels: config.taskModels ?? [], quotas: config.quotas ?? [],
  };
}

export function aiConfigWrite(draft: AIConfig) {
  if (!draft.revision || !revisionPattern.test(draft.revision)) throw new Error("Missing AI configuration revision");
  const clearApiKeys: string[] = [];
  const providers = draft.providers.map(provider => {
    const output = { ...provider };
    delete output.clearApiKey;
    if (!provider.apiKey?.trim()) delete output.apiKey;
    if (provider.clearApiKey) {
      if (output.apiKey) throw new Error("Choose either replacing or clearing the API key");
      clearApiKeys.push(provider.code);
    }
    return output;
  });
  return { ...draft, providers, ...(clearApiKeys.length ? { clearApiKeys } : {}) };
}

type Row = AIProviderConfig | AIModelConfig | AITaskModelConfig;
function identity(row: Row) {
  if ("code" in row) return row.code;
  if ("provider" in row) return JSON.stringify([row.provider, row.model]);
  return row.taskType;
}

// Return a reviewable draft on top of the latest server snapshot. A row rename,
// addition or deletion can change identity; when both sides changed the list
// structure we require a fresh edit instead of choosing a row by array index.
function mergeRows<R extends Row>(base: R[], draft: R[], latest: R[]): R[] | undefined {
  if (JSON.stringify(base) === JSON.stringify(latest)) return draft;
  const byId = (rows: R[]) => new Map(rows.map(row => [identity(row), row]));
  const before = byId(base), edited = byId(draft), current = byId(latest);
  if (before.size !== base.length || edited.size !== draft.length || current.size !== latest.length
    || before.size !== edited.size || draft.some(row => !before.has(identity(row)))) return;
  for (const [id, row] of edited) {
    if (!current.has(id) && JSON.stringify(row) !== JSON.stringify(before.get(id))) return;
  }
  return latest.map(row => {
    const id = identity(row), old = before.get(id), local = edited.get(id);
    if (!old || !local) return row;
    const result = { ...row };
    for (const key of Object.keys(local) as (keyof R)[]) {
      if (!Object.is(local[key], old[key])) result[key] = local[key];
    }
    return result;
  });
}

export function mergeAIDraft(section: AISection, base: AIConfig, draft: AIConfig, latest: AIConfig): AIConfig | undefined {
  if (!latest.revision) return;
  switch (section) {
    case "providers": {
      const providers = mergeRows(base.providers, draft.providers, latest.providers);
      return providers && { ...latest, providers };
    }
    case "models": {
      const models = mergeRows(base.models, draft.models, latest.models);
      return models && { ...latest, models };
    }
    case "taskModels": {
      const taskModels = mergeRows(base.taskModels, draft.taskModels, latest.taskModels);
      return taskModels && { ...latest, taskModels };
    }
  }
}


// A replacement was entered for the destination visible in the local draft.
// Reapplying unrelated updates must not send it to another administrator's new host.
export function changedCredentialDestination(draft: AIConfig, proposed: AIConfig) {
  const rows = new Map(proposed.providers.map(provider => [provider.code, provider]));
  const origin = (value: string) => {
    try { return new URL(value).origin; } catch { return undefined; }
  };
  for (const provider of draft.providers) {
    if (!provider.apiKey?.trim()) continue;
    const recipient = rows.get(provider.code);
    if (!recipient || provider.baseUrl === recipient.baseUrl) continue;
    const previous = origin(provider.baseUrl), next = origin(recipient.baseUrl);
    if (!previous || previous === "null" || previous !== next) return { provider: provider.code, origin: next ?? "" };
  }
}
