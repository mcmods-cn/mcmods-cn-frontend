"use client";

import { useEffect } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { isBackendUnavailable } from "../_lib/backend-status";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig, MarkdownRendererConfig } from "../_lib/markdown-config";
import { defaultAdminYggdrasilConfig, type AdminYggdrasilConfig } from "./admin-yggdrasil-panel";
import { type AdminDashboardData } from "./admin-dashboard-panel";

type User = {
  id: string;
  username: string;
  email: string;
  status: string;
  roleCodes: string[];
  createdAt?: string;
  lastLoginAt?: string;
};

type AdminUserDetails = {
  user: User & { emailVerified: boolean };
  country: string;
  timezone: string;
  primaryLanguage: string;
  secondaryLanguage: string;
  registrationIp: string;
  registrationCountryCode: string;
  registrationCity: string;
  oauthProviders: string[];
  lastLogin?: {
    at: string;
    ip: string;
    countryCode: string;
    city: string;
    userAgent: string;
  };
  rootPermissions: Array<{
    code: string;
    allow: boolean;
    priority: number;
    source: string;
  }>;
};

type AdminUserBalance = {
  publicId: string;
  code: string;
  name: string;
  icon: string;
  balance: number;
  status: string;
};

type MailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  from: string;
  useTLS: boolean;
  hasPassword: boolean;
};

type AdminConfig = {
  general: { siteName: string; logoUrl: string };
  yggdrasil: AdminYggdrasilConfig;
  auth: Record<string, string | number | boolean | string[]>;
  oauth: OAuthConfig;
  mail: MailConfig;
  markdown: MarkdownRendererConfig;
  profile: { signatureMaxBytes: number };
  oss?: OSSConfig;
  ai?: AIConfig;
  permissions: Record<string, string | number | boolean>;
  database: Record<string, string>;
  features: Record<string, boolean>;
};

type AIConfig = {
  providers: AIProviderConfig[];
  models: AIModelConfig[];
  taskModels: AITaskModelConfig[];
  quotas: AIQuotaConfig[];
  translation: AITranslationConfig;
};

type ModImportProviderConfig = {
  enabled: boolean;
  baseUrl: string;
  token?: string;
  apiKey?: string;
  hasToken?: boolean;
  hasApiKey?: boolean;
  clearToken?: boolean;
  clearApiKey?: boolean;
};

type ModImportConfig = {
  userAgent: string;
  requestTimeoutSeconds: number;
  modrinth: ModImportProviderConfig;
  curseforge: ModImportProviderConfig;
  github: ModImportProviderConfig;
};

type AIProviderConfig = {
  code: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  hasApiKey?: boolean;
  protocol: AIProviderProtocol;
  notes: string;
};

type AIProviderProtocol = "openai-compatible" | "anthropic";

const aiProviderProtocols: Array<{ value: AIProviderProtocol; label: string }> = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "anthropic", label: "Anthropic" },
];

type AIModelConfig = {
  provider: string;
  model: string;
  displayName: string;
  enabled: boolean;
  contextTokens: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

type AITaskModelConfig = {
  taskType: string;
  modelKey: string;
  timeoutSeconds: number;
  prompt: string;
};

type AITaskStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: AITranslationResult;
  error?: string;
};

type AITranslationResult = {
  items?: Array<{
    key: string;
    text?: string;
    name?: string;
    description?: string;
  }>;
};

const aiTranslationTaskTypes = {
  permission: "permission_translation_completion",
  i18n: "i18n_translation_completion",
  notification: "notification_translation_completion",
} as const;

type AIQuotaConfig = {
  scope: string;
  subject: string;
  period: string;
  requestLimit: number;
  tokenLimit: number;
  costLimitCny: number;
};

type AITranslationConfig = {
  enabled: boolean;
  sourceLocale: string;
  targetLocales: string[];
  taskType: string;
  autoSubmit: boolean;
  glossary: string;
};

type OSSConfig = {
  enabled: boolean;
  region: string;
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
  accessKeyId: string;
  hasAccessKeySecret: boolean;
  hasSecurityToken: boolean;
  useCName: boolean;
  prefix: string;
  downloadUrlTtlMinutes: number;
  downloadUrlMode: string;
  allowedExtensions: string[];
  bucketAccessPolicy?: string;
  temporaryDownloadPolicy?: string;
};

type OSSFile = {
  id: string;
  bucket: string;
  objectKey: string;
  category: string;
  source: string;
  originalName: string;
  sourceOriginalName?: string;
  contentType: string;
  sizeBytes: number;
  sourceSizeBytes?: number;
  converted?: boolean;
  sha256: string;
  scanStatus: string;
  status: string;
  createdAt: string;
};

type LogRow = Record<string, string | number | boolean | null | Record<string, unknown>>;

type LogPage = {
  items: LogRow[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

type RuntimeLogEntry = {
  id: number;
  createdAt: string;
  level: "info" | "warn" | "error";
  line: string;
};

type RuntimeLogResponse = {
  items: RuntimeLogEntry[];
  lastId: number;
  oldestId: number;
  resetNeeded: boolean;
};

type LogRetentionConfig = {
  enabled: boolean;
  defaultDays: number;
  categoryDays: Record<string, number>;
};

type OAuthConfig = {
  providers: Record<string, OAuthProviderConfig>;
};

type OAuthProviderConfig = {
  enabled: boolean;
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
};

type LocalizedText = {
  name?: string;
  description?: string;
};

type LocalizedTexts = Partial<Record<Locale, LocalizedText>> & Record<string, LocalizedText | undefined>;

type Role = {
  code: string;
  name: string;
  description: string;
  translations: LocalizedTexts;
  weight: number;
  parents: string[];
  permissions: string[];
  permissionEntries: RolePermissionEntry[];
};

type RolePermissionEntry = {
  code: string;
  allow: boolean;
  expiresAt?: string;
};

type Permission = {
  code: string;
  module: string;
  name: string;
  description: string;
  translations: LocalizedTexts;
};

type PermissionCatalog = {
  roles: Role[];
  permissions: Permission[];
};

type UserPermissionEntry = {
  code: string;
  allow: boolean;
  expiresAt?: string;
  source?: string;
  sourceKey?: string;
  editable?: boolean;
};

type UserPermissionDetails = {
  roles: string[];
  groupPermissions: string[];
  roleBindings: UserPermissionEntry[];
  directPermissions: UserPermissionEntry[];
  effectivePermissionRules: Array<{ code: string; allow: boolean; priority: number; source?: string }>;
};

const emptyDashboard: AdminDashboardData = {
  cards: [],
  overview: {
    onlineUsers: 0, monthlyActiveUsers: 0, totalUsers: 0, totalProjects: 0,
    approvedProjects: 0, pendingReviews: 0, viewsToday: 0, actionsToday: 0,
    oss: { activeFiles: 0, storedBytes: 0, sourceBytes: 0, pendingScans: 0, quarantinedFiles: 0, uploadsToday: 0 },
    trend: [], updatedAt: "",
  },
};

const emptyConfig: AdminConfig = {
  general: { siteName: "Mcmods-cn", logoUrl: "" },
  yggdrasil: defaultAdminYggdrasilConfig,
  auth: {
    allowRegistration: true,
    emailPasswordLogin: true,
    usernamePasswordLogin: true,
    userIDPasswordLogin: true,
    emailCodeLogin: true,
    requireEmailVerification: false,
    passwordMinLength: 8,
    tokenTTLHours: 24,
  },
  oauth: {
    providers: {
      wechat: { enabled: false, clientId: "", redirectUri: "", hasClientSecret: false },
      qq: { enabled: false, clientId: "", redirectUri: "", hasClientSecret: false },
      google: { enabled: false, clientId: "", redirectUri: "", hasClientSecret: false },
      github: { enabled: false, clientId: "", redirectUri: "", hasClientSecret: false },
    },
  },
  mail: {
    enabled: false,
    host: "",
    port: 587,
    username: "",
    from: "no-reply@mcmods.cn",
    useTLS: true,
    hasPassword: false,
  },
  markdown: defaultMarkdownConfig,
  profile: { signatureMaxBytes: 256 },
  oss: {
    enabled: false,
    region: "cn-beijing",
    endpoint: "https://oss-cn-beijing.aliyuncs.com",
    publicEndpoint: "https://oss.mcmods.cn",
    bucket: "",
    accessKeyId: "",
    hasAccessKeySecret: false,
    hasSecurityToken: false,
    useCName: false,
    prefix: "mcmods",
    downloadUrlTtlMinutes: 10,
    downloadUrlMode: "oss_presigned",
    allowedExtensions: [
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
      ".mp4", ".webm", ".mov", ".avi",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".md",
      ".txt", ".log", ".json", ".nbt", ".schem", ".schematic",
      ".zip", ".rar", ".7z", ".jar", ".gz", ".tar",
    ],
    bucketAccessPolicy: "private-read-write",
    temporaryDownloadPolicy: "presigned-url",
  },
  ai: {
    providers: [
      { code: "openai", name: "OpenAI", enabled: false, baseUrl: "https://api.openai.com/v1", apiKey: "", hasApiKey: false, protocol: "openai-compatible", notes: "" },
      { code: "aliyun", name: "阿里云百炼", enabled: false, baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "", hasApiKey: false, protocol: "openai-compatible", notes: "" },
    ],
    models: [
      { provider: "openai", model: "gpt-4.1-mini", displayName: "GPT-4.1 mini", enabled: false, contextTokens: 1047576, maxOutputTokens: 32768, inputPricePerMillion: 0, outputPricePerMillion: 0 },
    ],
    taskModels: [
      { taskType: aiTranslationTaskTypes.permission, modelKey: "", timeoutSeconds: 120, prompt: "" },
      { taskType: aiTranslationTaskTypes.i18n, modelKey: "", timeoutSeconds: 120, prompt: "" },
      { taskType: aiTranslationTaskTypes.notification, modelKey: "", timeoutSeconds: 90, prompt: "" },
    ],
    quotas: [
      { scope: "site", subject: "default", period: "day", requestLimit: 1000, tokenLimit: 1000000, costLimitCny: 10000 },
    ],
    translation: {
      enabled: false,
      sourceLocale: "zh-CN",
      targetLocales: ["en-US"],
      taskType: "translation",
      autoSubmit: false,
      glossary: "",
    },
  },
  permissions: {
    mode: "RBAC + wildcard",
    temporaryGrant: true,
    auditLog: true,
    defaultUserRole: "member",
    firstUserRole: "super_admin",
  },
  database: {
    driver: "PostgreSQL",
    host: "",
    port: "",
    name: "",
    user: "",
    sslMode: "disable",
  },
  features: {
    emailSystem: true,
    permissionRBAC: true,
    contentReview: true,
    oss: true,
    logSystem: true,
    ai: true,
  },
};

type PermissionDefaults = {
  registeredRole: string;
  bannedRole: string;
};

const emptyCatalog: PermissionCatalog = { roles: [], permissions: [] };

type AdminNotice = {
  title: string;
  message: string;
  tone?: "info" | "danger";
};

function LocalizedTextPairEditor({
  value,
  sourceLocale,
  targetLocale,
  description,
  onChange,
  onSourceLocaleChange,
  onTargetLocaleChange,
}: {
  value: { name: string; description: string; translations?: LocalizedTexts };
  sourceLocale: Locale;
  targetLocale: Locale;
  description?: string;
  onChange: (translations: LocalizedTexts) => void;
  onSourceLocaleChange: (locale: Locale) => void;
  onTargetLocaleChange: (locale: Locale) => void;
}) {
  const { t } = useI18n();
  const source = editableLocalizedText(value, sourceLocale);
  const target = editableLocalizedText(value, targetLocale);

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto py-2" value={sourceLocale} onChange={(event) => onSourceLocaleChange(event.target.value as Locale)}>
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {t("admin.sourceLanguage")}: {item.label}
            </option>
          ))}
        </select>
        <select className="field w-auto py-2" value={targetLocale} onChange={(event) => onTargetLocaleChange(event.target.value as Locale)}>
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {t("admin.targetLanguage")}: {item.label}
            </option>
          ))}
        </select>
      </div>
      {description ? <p className="text-sm font-normal text-[var(--muted)]">{description}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2 rounded-md bg-[var(--panel-subtle)] p-3">
          <div className="text-xs font-bold uppercase text-[var(--muted)]">{sourceLocale} {t("admin.reference")}</div>
          <div className="font-bold">{source.name || t("admin.emptyTranslation")}</div>
          <div className="text-sm font-normal text-[var(--muted)]">{source.description || t("admin.emptyTranslation")}</div>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1">
            {targetLocale} {t("admin.displayName")}
            <input
              key={`${targetLocale}:name`}
              className="field"
              value={target.name}
              onChange={(event) => onChange(setLocalizedText(value.translations, targetLocale, { name: event.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            {targetLocale} {t("admin.description")}
            <textarea
              key={`${targetLocale}:description`}
              className="field min-h-20"
              value={target.description}
              onChange={(event) => onChange(setLocalizedText(value.translations, targetLocale, { description: event.target.value }))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-lg p-4">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ConfigBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-lg p-4">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ConfigLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--muted)]">{value}</span>
    </div>
  );
}

function InlineMessage({ text }: { text: string }) {
  useEffect(() => {
    notifyAdminNotice(text);
  }, [text]);
  return null;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-sm text-[var(--muted)]">{text}</div>;
}

function AdminGateMessage({ text }: { text: string }) {
  const { t } = useI18n();

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="surface w-full max-w-md rounded-lg p-6 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-[var(--accent)] font-bold text-[var(--on-accent)]">
          M
        </div>
        <h1 className="text-xl font-bold">{t("admin.title")}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{text}</p>
      </div>
    </main>
  );
}

function AdminNoticeDialog({ notice, onClose }: { notice: AdminNotice | null; onClose: () => void }) {
  const { t } = useI18n();

  if (!notice?.message) return null;
  const danger = notice.tone === "danger";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4" role="alertdialog" aria-modal="true">
      <div className="surface w-full max-w-md rounded-lg p-6 text-center shadow-2xl">
        <div className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full text-2xl font-black ${
          danger ? "bg-red-100 text-red-700" : "bg-[var(--accent-soft)] text-[var(--accent)]"
        }`}>
          !
        </div>
        <h2 className="text-xl font-bold">{notice.title || t("admin.noticeTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{notice.message}</p>
        <button className="button-primary focus-ring mt-5 min-w-32" type="button" onClick={onClose} autoFocus>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

function valueText(value: unknown) {
  return value ? "true" : "false";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayCell(value: unknown) {
  if (value === null || typeof value === "undefined") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDateTime(text);
  return text;
}

function logCategoryTitle(category: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const titles: Record<string, string> = {
    system: t("admin.panels.logsSystem"),
    user_interaction: t("admin.logCleanup.categories.userInteraction"),
    admin_operation: t("admin.panels.logsAdmin"),
    permission_change: t("admin.panels.logsPermission"),
    login_security: t("admin.panels.logsLogin"),
    api_access: t("admin.panels.logsApi"),
    file_upload: t("admin.panels.logsFileUpload"),
    file_scan: t("admin.logCleanup.categories.fileScan"),
    download: t("admin.logCleanup.categories.download"),
    ai_call: t("admin.panels.logsAi"),
  };
  return titles[category] ?? category;
}

function cloneAIConfig(config: AIConfig): AIConfig {
  return JSON.parse(JSON.stringify(config)) as AIConfig;
}

function normalizeAIProtocols(config: AIConfig): AIConfig {
  const draft = cloneAIConfig(config);
  draft.providers = draft.providers.map((provider) => ({
    ...provider,
    protocol: provider.protocol === "anthropic" ? "anthropic" : "openai-compatible",
  }));
  return draft;
}

function normalizeAIModelProviders(config: AIConfig): AIConfig {
  const draft = normalizeAIProtocols(config);
  const providerCodes = new Set(draft.providers.map((provider) => provider.code.trim()).filter(Boolean));
  draft.models = draft.models.map((model) => ({
    ...model,
    provider: providerCodes.has(model.provider) ? model.provider : "",
  }));
  return draft;
}

async function saveAIConfig(
  draft: AIConfig,
  token: string,
  setDraft: (config: AIConfig) => void,
  setSaving: (saving: boolean) => void,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  setSaving(true);
  try {
    const payload = normalizeAIProtocols(draft);
    const saved = await apiRequest<AIConfig>("/api/v1/admin/ai/config", { method: "PUT", body: JSON.stringify(payload) }, token);
    setDraft(normalizeAIProtocols(saved));
    notifyAdminNotice(t("admin.ai.configSaved"));
  } catch (error) {
    notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
  } finally {
    setSaving(false);
  }
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

function aiTaskTypeLabel(taskType: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const labels: Record<string, string> = {
    [aiTranslationTaskTypes.permission]: t("admin.ai.permissionTranslationTask"),
    [aiTranslationTaskTypes.i18n]: t("admin.ai.i18nTranslationTask"),
    [aiTranslationTaskTypes.notification]: t("admin.ai.notificationTranslationTask"),
  };
  return labels[taskType] ?? taskType;
}

async function runAITranslationTask(token: string, taskType: string, payload: Record<string, unknown>) {
  const created = await apiRequest<{ id: string; taskUid: string; status: string }>(
    "/api/v1/admin/ai/tasks",
    { method: "POST", body: JSON.stringify({ taskType, payload }) },
    token,
  );
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const task = await apiRequest<AITaskStatus>(`/api/v1/admin/ai/tasks/${created.id}`, {}, token);
    if (task.status === "completed") return task.result ?? { items: [] };
    if (task.status === "failed") throw new Error(task.error || "AI translation task failed");
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error("AI translation task timed out");
}

function normalizePermissionCatalog(catalog: PermissionCatalog): PermissionCatalog {
  const grouped = new Map<string, Permission>();
  for (const permission of catalog.permissions) {
    const code = permissionTemplateCode(permission.code);
    const existing = grouped.get(code);
    const normalized: Permission = {
      ...permission,
      code,
      module: permission.module || permissionModule(code),
      name: permission.name || code,
      description: permission.description || "New permission",
      translations: normalizeEntityTranslations(permission),
    };
    if (!existing || permission.code === code || isTemplatePermissionCode(permission.code)) {
      grouped.set(code, normalized);
    }
  }
  return {
    ...catalog,
    roles: catalog.roles.map((role) => ({ ...role, translations: normalizeEntityTranslations(role) })),
    permissions: Array.from(grouped.values()).sort((left, right) =>
      left.module === right.module ? left.code.localeCompare(right.code) : left.module.localeCompare(right.module),
    ),
  };
}

function permissionInfoForCode(catalog: PermissionCatalog, code: string) {
  const exact = catalog.permissions.find((permission) => permission.code === code);
  return exact ?? catalog.permissions.find((permission) => permission.code === permissionTemplateCode(code));
}

function permissionTemplateCode(code: string) {
  const parts = code.split(".");
  if (parts.length < 2) return code;
  const oldProjectTemplate = code.match(/^project\.(\[(?:projectID|projectid|project_id|project_uuid)\]|<projectID>|<projectid>|<project_id>|<project_uuid>)\.(.+)$/);
  if (oldProjectTemplate) {
    return `project.${oldProjectTemplate[2]}.<projectID>`;
  }
  const oldProjectConcrete = code.match(/^project\.([0-9a-f-]{4,})\.(edit|review|delete|no_review)$/);
  if (oldProjectConcrete) {
    return `project.${oldProjectConcrete[2]}.<projectID>`;
  }
  const projectActionTemplate = code.match(/^project\.(edit|review|delete|no_review)\.(.+)$/);
  if (projectActionTemplate && projectActionTemplate[2] !== "<projectID>") {
    return `project.${projectActionTemplate[1]}.<projectID>`;
  }
  const last = parts[parts.length - 1];
  if (/^-?\d+$/.test(last) || (last === "*" && parts.some((part) => part.includes("limit")))) {
    return `${parts.slice(0, -1).join(".")}.<num>`;
  }
  return code.replace(/\[(projectID|projectid|project_id|project_uuid)\]$/i, "<projectID>");
}

function isTemplatePermissionCode(code: string) {
  return /(?:<[^>]+>|\[[^\]]+\])/.test(code);
}

function localizedText(value: { name: string; description: string; translations?: LocalizedTexts }, locale: Locale) {
  const translations = normalizeEntityTranslations(value);
  const localized = translations[locale];
  return {
    name: localized?.name?.trim() || value.name || "",
    description: localized?.description?.trim() || value.description || "",
  };
}

function editableLocalizedText(
  value: { name?: string; description?: string; translations?: LocalizedTexts },
  locale: Locale,
) {
  const localized = normalizeLocalizedTexts(value.translations)[locale];
  if (localized) {
    return {
      name: localized.name ?? "",
      description: localized.description ?? "",
    };
  }
  const name = value.name?.trim() ?? "";
  const description = value.description?.trim() ?? "";
  if (!name && !description) return { name: "", description: "" };
  const baseLocale = detectTextLocale(`${name} ${description}`.trim(), "en-US");
  return baseLocale === locale ? { name, description } : { name: "", description: "" };
}

function setLocalizedText(translations: LocalizedTexts | undefined, locale: Locale, patch: LocalizedText): LocalizedTexts {
  return normalizeLocalizedTexts({
    ...(translations ?? {}),
    [locale]: {
      ...(translations?.[locale] ?? {}),
      ...patch,
    },
  });
}

function normalizeLocalizedTexts(translations: LocalizedTexts | undefined): LocalizedTexts {
  const result: LocalizedTexts = {};
  for (const [locale, text] of Object.entries(translations ?? {})) {
    const name = text?.name?.trim() ?? "";
    const description = text?.description?.trim() ?? "";
    if (!locale || (!name && !description)) continue;
    result[locale] = { name, description };
  }
  return result;
}

function normalizeEntityTranslations(value: { name: string; description: string; translations?: LocalizedTexts }): LocalizedTexts {
  const result = normalizeLocalizedTexts(value.translations);
  const baseName = value.name.trim();
  const baseDescription = value.description.trim();
  if (!baseName && !baseDescription) return result;

  const baseLocale = detectTextLocale(`${baseName} ${baseDescription}`.trim(), preferredTranslationLocale(result));
  result[baseLocale] = {
    name: result[baseLocale]?.name?.trim() || baseName,
    description: result[baseLocale]?.description?.trim() || baseDescription,
  };
  return normalizeLocalizedTexts(result);
}

function preferredTranslationLocale(translations: LocalizedTexts): Locale {
  if (translations["zh-CN"]) return "zh-CN";
  if (translations["en-US"]) return "en-US";
  const first = Object.keys(translations).find((key): key is Locale =>
    supportedLocales.some((locale) => locale.code === key),
  );
  return first ?? "en-US";
}

function withFallbackLocalizedText<T extends { name: string; description: string; translations?: LocalizedTexts }>(value: T): T {
  const translations = normalizeEntityTranslations(value);
  const fallback = translations["zh-CN"] ?? translations["en-US"] ?? Object.values(translations)[0];
  return {
    ...value,
    name: value.name.trim() || fallback?.name || "Unnamed",
    description: value.description.trim() || fallback?.description || "",
    translations,
  };
}

function buildNewPermissionPayload(code: string, nameInput: string, descriptionInput: string, preferredLocale: Locale) {
  const name = nameInput.trim() || code;
  const description = descriptionInput.trim() || "New permission";
  const detectedLocale = detectTextLocale(`${nameInput} ${descriptionInput}`.trim(), preferredLocale);
  return {
    code,
    module: permissionModule(code),
    name,
    description,
    translations: setLocalizedText(undefined, detectedLocale, { name, description }),
  };
}

function detectTextLocale(text: string, preferredLocale: Locale): Locale {
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP";
  if (/[\u3400-\u9fff]/.test(text)) return "zh-CN";
  return preferredLocale || "en-US";
}

function cloneRole(role: Role): Role {
  const permissionEntries =
    role.permissionEntries?.length > 0
      ? role.permissionEntries.map((permission) => ({ ...permission }))
      : role.permissions.map((code) => ({ code, allow: true }));
  return {
    ...role,
    translations: normalizeEntityTranslations(role),
    parents: [...role.parents],
    permissionEntries,
    permissions: permissionEntries.map((permission) => permission.code),
  };
}

function splitCodes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parsePermissionInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;，；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function permissionModule(code: string) {
  const index = code.indexOf(".");
  return index > 0 ? code.slice(0, index) : code;
}

function permissionSuggestions(permissions: Permission[], input: string, selectedCodes: string[], locale: Locale) {
  const assigned = new Set(selectedCodes);
  const keyword = input.split(/[\s,;，；]+/).at(-1)?.trim().toLowerCase() ?? "";
  return permissions
    .filter((permission) => {
      if (assigned.has(permission.code)) return false;
      if (!keyword) return true;
      const text = localizedText(permission, locale);
      return `${permission.code} ${text.name} ${text.description}`.toLowerCase().includes(keyword);
    })
    .slice(0, 24);
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (isPermissionError(error, message)) {
    notifyPermissionDenied(message);
    return "";
  }
  if (message === "Failed to fetch") {
    return "后端不可用或请求失败";
  }
  return message;
}

function cleanOSSError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (isPermissionError(error, message)) {
    notifyPermissionDenied(message);
    return "";
  }
  if (message === "Failed to fetch") {
    return "OSS 直传请求失败。请检查阿里云 OSS Bucket 的 CORS 是否允许当前前端域名、PUT 方法以及 Content-Type / x-oss-forbid-overwrite 请求头。";
  }
  return message;
}

function isPermissionError(error: unknown, message: string) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return true;
  return /(没有权限|权限不足|未授权|unauthorized|forbidden|permission denied|no permission)/i.test(message);
}

function notifyPermissionDenied(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mcmods-permission-denied", { detail: { message } }));
}

function notifyAdminNotice(message: string, title?: string, tone: "info" | "danger" = "info") {
  if (typeof window === "undefined" || !message.trim() || (tone === "danger" && isBackendUnavailable())) return;
  window.dispatchEvent(new CustomEvent("mcmods-admin-notice", { detail: { message, title, tone } }));
}

export type { AIConfig, AIModelConfig, AIProviderConfig, AIProviderProtocol, AIQuotaConfig, AITaskModelConfig, AITaskStatus, AITranslationConfig, AITranslationResult, AdminConfig, AdminNotice, AdminUserBalance, AdminUserDetails, LocalizedText, LocalizedTexts, LogPage, LogRetentionConfig, LogRow, MailConfig, ModImportConfig, ModImportProviderConfig, OAuthConfig, OAuthProviderConfig, OSSConfig, OSSFile, Permission, PermissionCatalog, PermissionDefaults, Role, RolePermissionEntry, RuntimeLogEntry, RuntimeLogResponse, User, UserPermissionDetails, UserPermissionEntry };
export { AdminGateMessage, AdminNoticeDialog, ConfigBlock, ConfigLine, EmptyState, InlineMessage, LocalizedTextPairEditor, PanelShell, aiProviderProtocols, aiTaskTypeLabel, aiTranslationTaskTypes, buildNewPermissionPayload, cleanError, cleanOSSError, cloneAIConfig, cloneRole, detectTextLocale, displayCell, editableLocalizedText, emptyCatalog, emptyConfig, emptyDashboard, formatDateTime, isPermissionError, isTemplatePermissionCode, localizedText, logCategoryTitle, normalizeAIModelProviders, normalizeAIProtocols, normalizeEntityTranslations, normalizeLocalizedTexts, normalizePermissionCatalog, notifyAdminNotice, notifyPermissionDenied, parsePermissionInput, permissionInfoForCode, permissionModule, permissionSuggestions, permissionTemplateCode, preferredTranslationLocale, runAITranslationTask, saveAIConfig, setAIModel, setAIProvider, setAITaskModel, setLocalizedText, splitCodes, valueText, withFallbackLocalizedText };
