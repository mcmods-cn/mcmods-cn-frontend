"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canAccessAdmin, clearAuth, useAuthSnapshot } from "../_lib/auth";
import { ApiError, apiRequest } from "../_lib/api";
import { isBackendUnavailable } from "../_lib/backend-status";
import type { LevelConfig, RoleTrack } from "../_lib/community-api";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig, MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import {
  abortMultipartUpload,
  completeOSSUpload,
  computeFileSHA256,
  formatBytes,
  putFileToOSS,
  type OSSDirectUploadTicket,
} from "../_lib/oss-upload";
import {
  ActivityMonitorPanel,
  CreatorClaimsPanel,
  CurrencyManagementPanel,
  EconomyConfigPanel,
  LevelConfigPanel,
  ShopManagementPanel,
  TaskManagementPanel,
} from "./admin-community-panels";
import { CommentReportReviewPanel, MinecraftVersionConfigPanel, ModReviewQueuePanel } from "./admin-mod-panels";
import { ServerReviewQueuePanel, ServerSettingsPanel } from "./admin-server-panels";
import { AdminUnresolvedReferences } from "./admin-unresolved-references";
import { AdminContentAttributePanel } from "./admin-content-attribute-panel";
import { AdminYggdrasilPanel, defaultAdminYggdrasilConfig, type AdminYggdrasilConfig } from "./admin-yggdrasil-panel";
import { AdminDashboardPanel, type AdminDashboardData } from "./admin-dashboard-panel";
import { useTheme } from "./theme-provider";
import { useSiteBrand } from "./site-brand-provider";
import { AdminActivityRetentionPanel } from "./admin-activity-retention-panel";

type PanelId =
  | "overview"
  | "general-settings"
  | "yggdrasil"
  | "roles"
  | "user-roles"
  | "permission-list"
  | "role-tracks"
  | "permission-settings"
  | "creator-claims"
  | "activity-monitor"
  | "economy-config"
  | "currencies"
  | "shop-items"
  | "level-config"
  | "tasks"
  | "users"
  | "reviews-content"
  | "reviews-editor"
  | "reviews-server"
  | "reviews-comments"
  | "review-settings"
  | "server-settings"
  | "notifications"
  | "notification-templates"
  | "mail"
  | "auth"
  | "i18n"
  | "markdown"
  | "profile-settings"
  | "minecraft-versions"
  | "mod-import-settings"
  | "resource-attributes"
  | "unresolved-references"
  | "nats"
  | "oss-config"
  | "oss-files"
  | "oss-uploads"
  | "oss-scans"
  | "oss-downloads"
  | "logs-system"
  | "logs-user"
  | "logs-admin"
  | "logs-permission"
  | "logs-login"
  | "logs-api"
  | "logs-file-upload"
  | "logs-ai"
  | "ai-providers"
  | "ai-models"
  | "ai-task-models"
  | "ai-costs"
  | "ai-task-logs";

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

type NATSTaskConfig = {
  code: string;
  enabled: boolean;
  subject: string;
  queueGroup: string;
  maxConcurrent: number;
  timeoutSeconds: number;
};

type NATSStatus = {
  enabled: boolean;
  connected: boolean;
  url: string;
  subjectPrefix: string;
  tasks: NATSTaskConfig[];
  lastError?: string;
};

type NATSConfig = {
  enabled: boolean;
  url: string;
  username: string;
  password?: string;
  hasPassword: boolean;
  token?: string;
  hasToken: boolean;
  subjectPrefix: string;
  tasks: NATSTaskConfig[];
  status: NATSStatus;
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
  concurrencyLimit: number;
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
};

type UserPermissionDetails = {
  roles: string[];
  groupPermissions: string[];
  directPermissions: UserPermissionEntry[];
  effectivePermissionRules: Array<{ code: string; allow: boolean; priority: number; source?: string }>;
};

const adminNavGroups: Array<{
  id: string;
  label: string;
  items: Array<{ id: PanelId; label: string; description: string }>;
}> = [
  {
    id: "workbench",
    label: "",
    items: [{ id: "overview", label: "", description: "" }],
  },
  {
    id: "reviews",
    label: "",
    items: [
      { id: "reviews-content", label: "", description: "" },
      { id: "reviews-editor", label: "", description: "" },
      { id: "reviews-server", label: "", description: "" },
      { id: "reviews-comments", label: "", description: "" },
      { id: "creator-claims", label: "", description: "" },
      { id: "review-settings", label: "", description: "" },
      { id: "server-settings", label: "", description: "" },
    ],
  },
  {
    id: "content",
    label: "",
    items: [
      { id: "resource-attributes", label: "", description: "" },
      { id: "mod-import-settings", label: "", description: "" },
      { id: "unresolved-references", label: "", description: "" },
    ],
  },
  {
    id: "permission",
    label: "",
    items: [
      { id: "roles", label: "", description: "" },
      { id: "user-roles", label: "", description: "" },
      { id: "permission-list", label: "", description: "" },
      { id: "role-tracks", label: "", description: "" },
      { id: "permission-settings", label: "", description: "" },
    ],
  },
  {
    id: "economy",
    label: "",
    items: [
      { id: "economy-config", label: "", description: "" },
      { id: "currencies", label: "", description: "" },
      { id: "shop-items", label: "", description: "" },
    ],
  },
  {
    id: "progression",
    label: "",
    items: [
      { id: "level-config", label: "", description: "" },
      { id: "tasks", label: "", description: "" },
    ],
  },
  {
    id: "monitoring",
    label: "",
    items: [{ id: "activity-monitor", label: "", description: "" }],
  },
  {
    id: "oss",
    label: "",
    items: [
      { id: "oss-config", label: "", description: "" },
      { id: "oss-files", label: "", description: "" },
      { id: "oss-uploads", label: "", description: "" },
      { id: "oss-scans", label: "", description: "" },
      { id: "oss-downloads", label: "", description: "" },
    ],
  },
  {
    id: "logs",
    label: "",
    items: [
      { id: "logs-system", label: "", description: "" },
      { id: "logs-user", label: "", description: "" },
      { id: "logs-admin", label: "", description: "" },
      { id: "logs-permission", label: "", description: "" },
      { id: "logs-login", label: "", description: "" },
      { id: "logs-api", label: "", description: "" },
      { id: "logs-file-upload", label: "", description: "" },
      { id: "logs-ai", label: "", description: "" },
    ],
  },
  {
    id: "ai",
    label: "",
    items: [
      { id: "ai-providers", label: "", description: "" },
      { id: "ai-models", label: "", description: "" },
      { id: "ai-task-models", label: "", description: "" },
      { id: "ai-costs", label: "", description: "" },
      { id: "ai-task-logs", label: "", description: "" },
    ],
  },
  {
    id: "infrastructure",
    label: "",
    items: [{ id: "nats", label: "", description: "" }],
  },
  {
    id: "users",
    label: "",
    items: [{ id: "users", label: "", description: "" }],
  },
  {
    id: "notifications",
    label: "",
    items: [
      { id: "notifications", label: "", description: "" },
      { id: "notification-templates", label: "", description: "" },
    ],
  },
  {
    id: "system",
    label: "",
    items: [
      { id: "general-settings", label: "", description: "" },
      { id: "yggdrasil", label: "", description: "" },
      { id: "mail", label: "", description: "" },
      { id: "auth", label: "", description: "" },
      { id: "markdown", label: "", description: "" },
      { id: "profile-settings", label: "", description: "" },
      { id: "minecraft-versions", label: "", description: "" },
      { id: "i18n", label: "", description: "" },
    ],
  },
];

const emptyDashboard: AdminDashboardData = {
  cards: [],
  overview: {
    onlineUsers: 0, monthlyActiveUsers: 0, totalUsers: 0, totalProjects: 0,
    approvedProjects: 0, pendingReviews: 0, viewsToday: 0, actionsToday: 0,
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
    downloadUrlMode: "esa_private_origin",
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
      { taskType: aiTranslationTaskTypes.permission, modelKey: "", concurrencyLimit: 2, timeoutSeconds: 120, prompt: "" },
      { taskType: aiTranslationTaskTypes.i18n, modelKey: "", concurrencyLimit: 2, timeoutSeconds: 120, prompt: "" },
      { taskType: aiTranslationTaskTypes.notification, modelKey: "", concurrencyLimit: 4, timeoutSeconds: 90, prompt: "" },
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
  developerRole: string;
  editorRole: string;
};

const emptyCatalog: PermissionCatalog = { roles: [], permissions: [] };

type AdminNotice = {
  title: string;
  message: string;
  tone?: "info" | "danger";
};

export function AdminConsole() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { t } = useI18n();
  const brand = useSiteBrand();
  const auth = useAuthSnapshot();
  const [activePanel, setActivePanel] = useState<PanelId>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [expanded, setExpanded] = useState([
    "workbench",
    "content",
    "permission",
    "creators",
    "economy",
    "progression",
    "monitoring",
    "oss",
    "logs",
    "ai",
    "infrastructure",
    "users",
    "system",
  ]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [config, setConfig] = useState(emptyConfig);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState(t("admin.backendDisconnected"));
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [reconnectIn, setReconnectIn] = useState(0);
  const [noticeDialog, setNoticeDialog] = useState<AdminNotice | null>(null);
  const authReady = auth.ready;
  const allowed = canAccessAdmin(auth.user);

  useEffect(() => {
    function handlePermissionDenied(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const message = typeof detail?.message === "string" ? detail.message : "";
      setNoticeDialog({
        title: t("admin.permissionDeniedTitle"),
        message: message || t("admin.permissionDeniedBody"),
        tone: "danger",
      });
    }
    function handleAdminNotice(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const message = typeof detail?.message === "string" ? detail.message : "";
      if (!message) return;
      const title = typeof detail?.title === "string" ? detail.title : t("admin.noticeTitle");
      const tone = detail?.tone === "danger" ? "danger" : "info";
      setNoticeDialog({ title, message, tone });
    }
    window.addEventListener("mcmods-permission-denied", handlePermissionDenied);
    window.addEventListener("mcmods-admin-notice", handleAdminNotice);
    return () => {
      window.removeEventListener("mcmods-permission-denied", handlePermissionDenied);
      window.removeEventListener("mcmods-admin-notice", handleAdminNotice);
    };
  }, [t]);

  useEffect(() => {
    if (!authReady) return;
    if (!auth.token) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!allowed) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    let countdownTimer: number | undefined;

    function clearRetryTimers() {
      if (retryTimer) window.clearTimeout(retryTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
    }

    function scheduleReconnect(attempt: number) {
      clearRetryTimers();
      const delaySeconds = Math.min(30, Math.max(3, 3 * 2 ** Math.min(attempt, 3)));
      setReconnectIn(delaySeconds);
      countdownTimer = window.setInterval(() => {
        setReconnectIn((current) => Math.max(0, current - 1));
      }, 1000);
      retryTimer = window.setTimeout(() => {
        if (!cancelled) {
          loadAdminData(attempt + 1);
        }
      }, delaySeconds * 1000);
    }

    async function loadAdminData(attempt = 0) {
      try {
        setStatus(attempt === 0 ? t("admin.connecting") : t("admin.reconnecting"));
        const [dashboardData, configData, permissionData, userData] = await Promise.all([
          apiRequest<AdminDashboardData>("/api/v1/admin/dashboard", {}, auth.token),
          apiRequest<AdminConfig>("/api/v1/admin/config", {}, auth.token),
          apiRequest<PermissionCatalog>("/api/v1/admin/permissions", {}, auth.token),
          apiRequest<User[]>("/api/v1/admin/users", {}, auth.token),
        ]);
        if (!cancelled) {
          setDashboard(dashboardData);
          setConfig({ ...configData, markdown: normalizeMarkdownConfig(configData.markdown) });
          setCatalog(normalizePermissionCatalog(permissionData));
          setUsers(userData);
          setStatus(t("common.connected"));
          setBackendAvailable(true);
          setReconnectIn(0);
          clearRetryTimers();
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            clearAuth();
            router.replace("/login?next=/admin");
            return;
          }
          const message = cleanError(error) || t("admin.backendDisconnected");
          setStatus(message);
          setBackendAvailable(false);
          scheduleReconnect(attempt);
        }
      }
    }
    loadAdminData();
    return () => {
      cancelled = true;
      clearRetryTimers();
    };
  }, [allowed, auth.token, authReady, router, t]);

  async function refreshCatalog() {
    if (!auth.token) return;
    setCatalog(normalizePermissionCatalog(await apiRequest<PermissionCatalog>("/api/v1/admin/permissions", {}, auth.token)));
  }

  async function refreshUsers() {
    if (!auth.token) return;
    setUsers(await apiRequest<User[]>("/api/v1/admin/users", {}, auth.token));
  }

  function toggleGroup(groupId: string) {
    setExpanded((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  }

  function logout() {
    clearAuth();
    router.push("/login");
  }

  const noticeModal = (
    <AdminNoticeDialog
      notice={noticeDialog}
      onClose={() => setNoticeDialog(null)}
    />
  );

  if (!authReady || !auth.token) {
    return (
      <>
        <AdminGateMessage text={t("admin.checkingAuth")} />
        {noticeModal}
      </>
    );
  }

  if (!allowed) {
    return (
      <>
        <AdminGateMessage text={t("admin.noPermissionReturning")} />
        {noticeModal}
      </>
    );
  }

  if (backendAvailable === false) {
    return (
      <>
        <AdminGateMessage
          text={reconnectIn > 0 ? t("admin.retrySeconds", { seconds: reconnectIn }) : t("admin.reconnecting")}
        />
        {noticeModal}
      </>
    );
  }

  if (backendAvailable === null) {
    return (
      <>
        <AdminGateMessage text={t("admin.connecting")} />
        {noticeModal}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[292px_1fr]">
        <aside className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--panel)] lg:static lg:z-auto lg:border-b-0 lg:border-r">
          <div className="flex max-h-[80vh] flex-col lg:sticky lg:top-0 lg:h-screen lg:max-h-none">
            <div className="flex items-center gap-3 border-b border-[var(--line)] p-3 lg:block lg:p-4">
              <Link className="flex min-w-0 flex-1 items-center gap-3" href="/">
                {brand.logoUrl ? <img alt="" className="h-10 w-10 rounded-lg object-contain" src={brand.logoUrl} /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">M</span>}
                <span>
                  <span className="block text-sm font-semibold text-[var(--muted)]">{brand.siteName}</span>
                  <span className="block text-xl font-bold">{t("admin.title")}</span>
                </span>
              </Link>
              <button aria-expanded={mobileNavigationOpen} aria-label={t("admin.navigation")} className="button-secondary focus-ring shrink-0 px-3 py-2 lg:hidden" type="button" onClick={() => setMobileNavigationOpen((value) => !value)}>{mobileNavigationOpen ? "×" : "☰"}</button>
              <div className="mt-4 hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm text-[var(--muted)] lg:block">
                {status}
              </div>
            </div>

            <nav className={`${mobileNavigationOpen ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto p-3 lg:block`}>
              {adminNavGroups.map((group) => {
                const open = expanded.includes(group.id);
                return (
                  <section key={group.id} className="mb-2">
                    <button
                      data-admin-group={group.id}
                      className="focus-ring flex w-full items-center justify-between rounded-lg px-3 py-3 text-left font-bold hover:bg-[var(--panel-subtle)]"
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                    >
                      {adminNavGroupLabel(group.id, group.label, t)}
                      <span className="text-lg text-[var(--muted)]">{open ? "-" : "+"}</span>
                    </button>
                    {open ? (
                      <div className="mt-1 grid gap-1 pl-2">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            data-admin-panel={item.id}
                            className={`focus-ring rounded-lg px-3 py-2 text-left ${
                              activePanel === item.id
                                ? "bg-[var(--accent)] text-white"
                                : "text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
                            }`}
                            type="button"
                            onClick={() => { setActivePanel(item.id); setMobileNavigationOpen(false); }}
                          >
                            <span className="block text-sm font-semibold">{panelTitleV2(item.id, t)}</span>
                            <span className="mt-0.5 block text-xs opacity-80">{adminNavItemDescription(item.id, item.description, t)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </nav>

            <div className={`${mobileNavigationOpen ? "block" : "hidden"} border-t border-[var(--line)] p-3 lg:block`}>
              <button className="button-secondary focus-ring w-full" type="button" onClick={toggleTheme}>
                {t("common.toggleTheme")}
              </button>
              {auth.user ? (
                <button className="button-secondary focus-ring mt-2 w-full" type="button" onClick={logout}>
                  {t("common.logout")}
                </button>
              ) : (
                <Link className="button-primary focus-ring mt-2 block w-full text-center" href="/login?next=/admin">
                  {t("admin.loginAdmin")}
                </Link>
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 md:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--accent)]">Admin Console</p>
              <h1 className="text-2xl font-bold">{panelTitleV2(activePanel, t)}</h1>
            </div>
            {auth.user ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
                {auth.user.username} / {(auth.user.roleCodes ?? []).join(", ") || t("admin.ungrouped")}
              </div>
            ) : null}
          </div>

          {activePanel === "overview" ? <AdminDashboardPanel initialData={dashboard} token={auth.token} features={config.features} /> : null}
          {activePanel === "general-settings" ? <GeneralSettingsPanel initialConfig={config.general ?? emptyConfig.general} token={auth.token} /> : null}
          {activePanel === "yggdrasil" ? <AdminYggdrasilPanel initialConfig={config.yggdrasil ?? emptyConfig.yggdrasil} token={auth.token} /> : null}
          {activePanel === "roles" ? (
            <PermissionGroupEditor catalog={catalog} token={auth.token} refreshCatalog={refreshCatalog} />
          ) : null}
          {activePanel === "user-roles" ? (
            <UserRolePanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "permission-list" ? (
            <PermissionCatalogEditor
              key={JSON.stringify(catalog.permissions)}
              catalog={catalog}
              token={auth.token}
              refreshCatalog={refreshCatalog}
            />
          ) : null}
          {activePanel === "role-tracks" ? (
            <RoleTracksPanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "permission-settings" ? <PermissionSettingsPanel catalog={catalog} token={auth.token} /> : null}
          {activePanel === "creator-claims" ? <CreatorClaimsPanel token={auth.token} /> : null}
          {activePanel === "activity-monitor" ? <ActivityMonitorPanel token={auth.token} /> : null}
          {activePanel === "economy-config" ? <EconomyConfigPanel token={auth.token} /> : null}
          {activePanel === "currencies" ? <CurrencyManagementPanel token={auth.token} /> : null}
          {activePanel === "shop-items" ? <ShopManagementPanel token={auth.token} /> : null}
          {activePanel === "level-config" ? <LevelConfigPanel token={auth.token} /> : null}
          {activePanel === "tasks" ? <TaskManagementPanel token={auth.token} /> : null}
          {activePanel === "users" ? (
            <UsersPanelV2 catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "notifications" ? <SystemNotificationPanel token={auth.token} /> : null}
          {activePanel === "notification-templates" ? <NotificationTemplatePanel token={auth.token} /> : null}
          {activePanel === "reviews-content" ? <ModReviewQueuePanel kind="content" token={auth.token} /> : null}
          {activePanel === "reviews-editor" ? <ModReviewQueuePanel kind="editor" token={auth.token} /> : null}
          {activePanel === "reviews-server" ? <ServerReviewQueuePanel token={auth.token} /> : null}
          {activePanel === "reviews-comments" ? <CommentReportReviewPanel token={auth.token} /> : null}
          {activePanel === "review-settings" ? <ReviewSettingsPanel token={auth.token} /> : null}
          {activePanel === "server-settings" ? <ServerSettingsPanel token={auth.token} /> : null}
          {activePanel === "mail" ? <MailPanelV2 config={config} token={auth.token} /> : null}
          {activePanel === "auth" ? <AuthPanelV2 config={config} token={auth.token} /> : null}
          {activePanel === "markdown" ? <MarkdownConfigPanel initialConfig={config.markdown} token={auth.token} /> : null}
          {activePanel === "profile-settings" ? <ProfileSettingsPanel initialConfig={config.profile ?? emptyConfig.profile} token={auth.token} /> : null}
          {activePanel === "minecraft-versions" ? <MinecraftVersionConfigPanel token={auth.token} /> : null}
          {activePanel === "resource-attributes" ? <AdminContentAttributePanel token={auth.token} /> : null}
          {activePanel === "mod-import-settings" ? <ModImportConfigPanel token={auth.token} /> : null}
          {activePanel === "unresolved-references" ? <AdminUnresolvedReferences token={auth.token} /> : null}
          {activePanel === "nats" ? <NATSConfigPanel token={auth.token} /> : null}
          {activePanel === "i18n" ? <TranslationManagerPanel token={auth.token} /> : null}
          {activePanel === "oss-config" ? <OSSConfigPanelV2 initialConfig={config.oss ?? emptyConfig.oss!} token={auth.token} /> : null}
          {activePanel === "oss-files" ? <OSSFilesPanel token={auth.token} /> : null}
          {activePanel === "oss-uploads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-uploads", t)} endpoint="/api/v1/admin/oss/uploads" /> : null}
          {activePanel === "oss-scans" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-scans", t)} endpoint="/api/v1/admin/oss/scans" /> : null}
          {activePanel === "oss-downloads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-downloads", t)} endpoint="/api/v1/admin/oss/downloads" /> : null}
          {activePanel === "logs-system" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-system", t)} category="system" /> : null}
          {activePanel === "logs-user" ? <><LogsPanel token={auth.token} title={panelTitleV2("logs-user", t)} category="user_interaction" /><AdminActivityRetentionPanel token={auth.token} /></> : null}
          {activePanel === "logs-admin" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-admin", t)} category="admin_operation" /> : null}
          {activePanel === "logs-permission" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-permission", t)} category="permission_change" /> : null}
          {activePanel === "logs-login" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-login", t)} category="login_security" /> : null}
          {activePanel === "logs-api" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-api", t)} category="api_access" /> : null}
          {activePanel === "logs-file-upload" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-file-upload", t)} category="file_upload" /> : null}
          {activePanel === "logs-ai" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-ai", t)} category="ai_call" /> : null}
          {activePanel === "ai-providers" ? <AIProvidersPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {activePanel === "ai-models" ? <AIModelsPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {activePanel === "ai-task-models" ? <AITaskModelsPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {activePanel === "ai-costs" ? <AICostsPanel token={auth.token} /> : null}
          {activePanel === "ai-task-logs" ? <AITaskLogsPanel token={auth.token} /> : null}
        </section>
      </div>
      {noticeModal}
    </main>
  );
}

function PermissionGroupEditor({
  catalog,
  token,
  refreshCatalog,
}: {
  catalog: PermissionCatalog;
  token: string;
  refreshCatalog: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const firstRole = catalog.roles[0]?.code ?? "";
  const [selectedCode, setSelectedCode] = useState(firstRole);
  const selectedRole = catalog.roles.find((role) => role.code === selectedCode) ?? catalog.roles[0];
  const [draft, setDraft] = useState<Role | null>(selectedRole ? cloneRole(selectedRole) : null);
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [bulkPermissionInput, setBulkPermissionInput] = useState("");
  const [bulkPermissionAllow, setBulkPermissionAllow] = useState(true);
  const [bulkPermissionExpiresAt, setBulkPermissionExpiresAt] = useState("");
  const [bulkPermissionName, setBulkPermissionName] = useState("");
  const [bulkPermissionDescription, setBulkPermissionDescription] = useState("");
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedPermissionIndexes, setSelectedPermissionIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const currentDraft = draft ?? (selectedRole ? cloneRole(selectedRole) : null);

  function selectRole(role: Role) {
    setSelectedCode(role.code);
    setDraft(cloneRole(role));
    setSelectedPermissionIndexes([]);
    setMessage("");
  }

  function startCreateRole() {
    setSelectedCode("");
    setDraft({ code: "", name: "", description: "", translations: {}, weight: 0, parents: [], permissions: [], permissionEntries: [] });
    setSelectedPermissionIndexes([]);
    setMessage("");
  }

  function updatePermissionAt(index: number, patch: Partial<RolePermissionEntry>) {
    if (!currentDraft) return;
    const permissionEntries = currentDraft.permissionEntries.map((permission, permissionIndex) =>
      permissionIndex === index ? { ...permission, ...patch } : permission,
    );
    setDraft({
      ...currentDraft,
      permissionEntries,
      permissions: permissionEntries.map((permission) => permission.code),
    });
  }

  function removePermissionAt(index: number) {
    if (!currentDraft) return;
    const permissionEntries = currentDraft.permissionEntries.filter((_, permissionIndex) => permissionIndex !== index);
    setDraft({
      ...currentDraft,
      permissionEntries,
      permissions: permissionEntries.map((permission) => permission.code),
    });
    setSelectedPermissionIndexes((current) => current.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)));
  }

  function togglePermissionSelection(index: number) {
    setSelectedPermissionIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  function setVisiblePermissionSelection(checked: boolean) {
    const visibleIndexes = visibleDraftPermissions.map((permission) => permission.index);
    setSelectedPermissionIndexes((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIndexes]));
      return current.filter((index) => !visibleIndexes.includes(index));
    });
  }

  function bulkUpdatePermissionAllow(allow: boolean) {
    if (!currentDraft || selectedPermissionIndexes.length === 0) return;
    const selected = new Set(selectedPermissionIndexes);
    const permissionEntries = currentDraft.permissionEntries.map((permission, index) =>
      selected.has(index) ? { ...permission, allow } : permission,
    );
    setDraft({ ...currentDraft, permissionEntries, permissions: permissionEntries.map((permission) => permission.code) });
  }

  function bulkRemovePermissions() {
    if (!currentDraft || selectedPermissionIndexes.length === 0) return;
    const selected = new Set(selectedPermissionIndexes);
    const permissionEntries = currentDraft.permissionEntries.filter((_, index) => !selected.has(index));
    setDraft({ ...currentDraft, permissionEntries, permissions: permissionEntries.map((permission) => permission.code) });
    setSelectedPermissionIndexes([]);
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentDraft || !token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    const payload = {
      ...withFallbackLocalizedText(currentDraft),
      parents: splitCodes(currentDraft.parents.join(",")),
      permissions: currentDraft.permissionEntries.map((permission) => permission.code),
      permissionEntries: currentDraft.permissionEntries,
    };
    const creating = selectedCode === "";
    try {
      const saved = await apiRequest<Role>(
        creating ? "/api/v1/admin/roles" : `/api/v1/admin/roles/${encodeURIComponent(currentDraft.code)}`,
        { method: creating ? "POST" : "PUT", body: JSON.stringify(payload) },
        token,
      );
      await refreshCatalog();
      setSelectedCode(saved.code);
      setDraft(cloneRole(saved));
      setMessage(t("admin.roleSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function deleteRole() {
    if (!currentDraft || !selectedCode || !token) {
      setMessage(t("admin.selectExistingRole"));
      return;
    }
    if (!window.confirm(t("admin.confirmDeleteRole", { code: currentDraft.code }))) return;
    try {
      await apiRequest<{ ok: boolean }>(
        `/api/v1/admin/roles/${encodeURIComponent(currentDraft.code)}`,
        { method: "DELETE" },
        token,
      );
      await refreshCatalog();
      setSelectedCode("");
      setDraft({ code: "", name: "", description: "", translations: {}, weight: 0, parents: [], permissions: [], permissionEntries: [] });
      setMessage(t("admin.roleDeleted"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function addPermissionEntriesFromInput() {
    if (!currentDraft || !token) {
      setMessage(t("admin.selectRoleAndLoginRequired"));
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput);
    if (codes.length === 0) {
      setMessage(t("admin.permissionInputRequired"));
      return;
    }
    const existingCodes = new Set(catalog.permissions.map((permission) => permission.code));
    const currentCodes = new Set(currentDraft.permissionEntries.map((permission) => permission.code));
    try {
      for (const code of codes) {
        if (!existingCodes.has(code)) {
          await apiRequest<{ ok: boolean }>(
            "/api/v1/admin/permissions",
            {
              method: "POST",
              body: JSON.stringify(buildNewPermissionPayload(code, bulkPermissionName, bulkPermissionDescription, targetLocale)),
            },
            token,
          );
        }
      }
      const appended = codes
        .filter((code) => !currentCodes.has(code))
        .map((code) => ({
          code,
          allow: bulkPermissionAllow,
          expiresAt: bulkPermissionExpiresAt,
        }));
      const permissionEntries = [...currentDraft.permissionEntries, ...appended];
      setDraft({
        ...currentDraft,
        permissionEntries,
        permissions: permissionEntries.map((permission) => permission.code),
      });
      setBulkPermissionInput("");
      setBulkPermissionName("");
      setBulkPermissionDescription("");
      await refreshCatalog();
      setMessage(t("admin.permissionAdded"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  if (!currentDraft) {
    return (
      <section className="surface overflow-hidden rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">{t("admin.roleGroup")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("admin.roleCount", { count: 0 })}</p>
          </div>
          <button className="button-primary focus-ring" type="button" onClick={startCreateRole}>
            {t("admin.newRole")}
          </button>
        </div>
        <div className="p-4">
          <EmptyState text={t("admin.noRoles")} />
        </div>
      </section>
    );
  }

  const modules = Array.from(new Set(catalog.permissions.map((permission) => permission.module)));
  const permissionMeta = new Map(catalog.permissions.map((permission) => [permission.code, permission]));
  const draftPermissionRows = currentDraft.permissionEntries.map((permission, index) => {
    const meta = permissionMeta.get(permission.code) ?? permissionMeta.get(permissionTemplateCode(permission.code));
    const localizedMeta = meta ? localizedText(meta, locale) : null;
    return {
      ...permission,
      index,
      module: meta?.module ?? permission.code.split(".")[0] ?? "custom",
      name: localizedMeta?.name ?? t("admin.customPermission"),
      description: localizedMeta?.description ?? t("admin.manualPermissionNode"),
    };
  });
  const visibleDraftPermissions =
    selectedModule === "all"
      ? draftPermissionRows
      : draftPermissionRows.filter((permission) => permission.module === selectedModule);
  const permissionOptions =
    selectedModule === "all"
      ? catalog.permissions
      : catalog.permissions.filter((permission) => permission.module === selectedModule);

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <section className="surface overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">{t("admin.roleGroup")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("admin.roleCount", { count: catalog.roles.length })}</p>
          </div>
          <button className="button-secondary focus-ring px-3 py-2" type="button" onClick={startCreateRole}>
            {t("admin.newRole")}
          </button>
        </div>
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
          {catalog.roles.map((role) => (
            (() => {
              const roleText = localizedText(role, locale);
              return (
            <button
              key={role.code}
              className={`grid w-full grid-cols-[1fr_auto] gap-3 border-b border-[var(--line)] px-4 py-3 text-left ${
                selectedCode === role.code ? "bg-[var(--panel-subtle)]" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => selectRole(role)}
            >
              <span>
                <span className="block font-bold">{roleText.name}</span>
                <span className="mt-1 block font-mono text-xs text-[var(--muted)]">{role.code}</span>
              </span>
              <span className="text-sm font-bold text-[var(--muted)]">{role.weight}</span>
            </button>
              );
            })()
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <form className="surface overflow-hidden rounded-lg p-4" onSubmit={saveRole}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="grid gap-3 lg:grid-cols-[auto_minmax(220px,360px)_auto] lg:items-center">
                <span className="text-2xl font-bold">Group:</span>
                <div className="field text-xl font-bold">{localizedText(currentDraft, locale).name || t("admin.unnamedRole")}</div>
                <span className="break-all font-mono text-xl font-bold text-[var(--muted)]">({currentDraft.code || "new_group"})</span>
              </div>
              <div className="mt-3 grid gap-3 text-sm font-semibold md:grid-cols-[140px_minmax(220px,1fr)]">
                <label className="grid gap-1">
                  {t("admin.weight")}:
                  <input
                    className="field px-2 py-1"
                    onChange={(event) => setDraft({ ...currentDraft, weight: Number(event.target.value) })}
                    type="number"
                    value={currentDraft.weight}
                  />
                </label>
                <label className="grid gap-1">
                  {t("admin.roleId")}
                  <input
                    className="field font-mono"
                    disabled={selectedCode !== ""}
                    onChange={(event) => setDraft({ ...currentDraft, code: event.target.value })}
                    placeholder="project_editor.[ProjectID]"
                    value={currentDraft.code}
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCode ? (
                <button className="button-secondary focus-ring border-red-500/40 text-red-600" type="button" onClick={deleteRole}>
                  {t("admin.deleteRole")}
                </button>
              ) : null}
              <button className="button-primary focus-ring" type="submit">
                {t("admin.saveRole")}
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="text-sm font-semibold">
              {t("admin.parentGroups")}
              <ParentRolePicker
                roles={catalog.roles.filter((role) => role.code !== currentDraft.code)}
                value={currentDraft.parents}
                onChange={(parents) => setDraft({ ...currentDraft, parents })}
              />
            </label>
            <label className="text-sm font-semibold">
              {t("admin.localizedDisplay")}
              <LocalizedTextPairEditor
                description={t("admin.localizedDisplayDesc")}
                sourceLocale={sourceLocale}
                targetLocale={targetLocale}
                value={currentDraft}
                onChange={(translations) => setDraft({ ...currentDraft, translations })}
                onSourceLocaleChange={setSourceLocale}
                onTargetLocaleChange={setTargetLocale}
              />
            </label>
            {message ? <InlineMessage text={message} /> : null}
          </div>
        </form>

        <section className="surface rounded-lg">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-lg font-bold">{t("admin.permissionNodes")} ({currentDraft.permissions.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
            <span className="font-semibold text-[var(--muted)]">{t("admin.selectedCount", { count: selectedPermissionIndexes.length })}</span>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(true)}>
              {t("admin.bulkSetTrue")}
            </button>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(false)}>
              {t("admin.bulkSetFalse")}
            </button>
            <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={bulkRemovePermissions}>
              {t("admin.bulkDelete")}
            </button>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[160px_1fr]">
            <div className="grid h-fit gap-2">
              <button
                className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                  selectedModule === "all" ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"
                }`}
                type="button"
                onClick={() => setSelectedModule("all")}
              >
                {t("admin.moduleAll")}
              </button>
              {modules.map((module) => (
                <button
                  key={module}
                  className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                    selectedModule === module ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"
                  }`}
                  type="button"
                  onClick={() => setSelectedModule(module)}
                >
                  {module}
                </button>
              ))}
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="border-b border-[var(--line)] px-3 py-3">
                      <input
                        checked={visibleDraftPermissions.length > 0 && visibleDraftPermissions.every((permission) => selectedPermissionIndexes.includes(permission.index))}
                        type="checkbox"
                        onChange={(event) => setVisiblePermissionSelection(event.target.checked)}
                      />
                    </th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.permission")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.value")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.expiresAt")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.description")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.operation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDraftPermissions.map((permission) => (
                    <tr key={`permission-${permission.index}`} className="hover:bg-[var(--panel-subtle)]">
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <input
                          checked={selectedPermissionIndexes.includes(permission.index)}
                          type="checkbox"
                          onChange={() => togglePermissionSelection(permission.index)}
                        />
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <input
                          className="field px-3 py-2 font-mono"
                          onChange={(event) => updatePermissionAt(permission.index, { code: event.target.value.trim() })}
                          placeholder="project.edit.[ProjectID]"
                          value={permission.code}
                        />
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <button
                          className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${
                            permission.allow
                              ? "bg-[var(--panel-subtle)] text-[var(--accent)]"
                              : "bg-[var(--panel-subtle)] text-[var(--red)]"
                          }`}
                          type="button"
                          onClick={() => updatePermissionAt(permission.index, { allow: !permission.allow })}
                        >
                          {permission.allow ? "true" : "false"}
                        </button>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-[var(--muted)]">
                            {permission.expiresAt ? t("admin.expireTime") : t("admin.neverExpires")}
                          </span>
                          <input
                            className="field px-3 py-2"
                            onChange={(event) => updatePermissionAt(permission.index, { expiresAt: event.target.value })}
                            title={t("admin.emptyDateMeansNever")}
                            type="date"
                            value={permission.expiresAt ? permission.expiresAt.slice(0, 10) : ""}
                          />
                        </label>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted)]">
                        <span className="block font-semibold text-[var(--foreground)]">{permission.name}</span>
                        <span className="mt-1 block">{permission.description}</span>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <button
                          className="button-secondary focus-ring whitespace-nowrap px-3 py-2"
                          type="button"
                          onClick={() => removePermissionAt(permission.index)}
                        >
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleDraftPermissions.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                        {t("admin.noPermissionNodesInFilter")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <PermissionBulkAdder
            allow={bulkPermissionAllow}
            description={bulkPermissionDescription}
            expiresAt={bulkPermissionExpiresAt}
            input={bulkPermissionInput}
            name={bulkPermissionName}
            permissions={permissionOptions}
            selectedCodes={currentDraft.permissionEntries.map((permission) => permission.code)}
            onAdd={addPermissionEntriesFromInput}
            onAllowChange={setBulkPermissionAllow}
            onDescriptionChange={setBulkPermissionDescription}
            onExpiresAtChange={setBulkPermissionExpiresAt}
            onInputChange={setBulkPermissionInput}
            onNameChange={setBulkPermissionName}
          />
        </section>

      </section>
    </div>
  );
}

function UserPermissionNodeEditor({
  entries,
  catalog,
  selectedModule,
  onModuleChange,
  onUpdate,
  onRemove,
  onBulkUpdate,
  onBulkRemove,
  children,
}: {
  entries: UserPermissionEntry[];
  catalog: PermissionCatalog;
  selectedModule: string;
  onModuleChange: (module: string) => void;
  onUpdate: (index: number, patch: Partial<UserPermissionEntry>) => void;
  onRemove: (index: number) => void;
  onBulkUpdate: (indexes: number[], patch: Partial<UserPermissionEntry>) => void;
  onBulkRemove: (indexes: number[]) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const roleMap = new Map(catalog.roles.map((role) => [`group.${role.code}`, role]));
  const rows = entries.map((entry, index) => {
    const role = roleMap.get(entry.code);
    const permission = permissionInfoForCode(catalog, entry.code);
    return {
      ...entry,
      index,
      module: role ? "group" : permission?.module || permissionModule(entry.code),
      name: role?.name || permission?.name || entry.code,
      description: role?.description || permission?.description || t("admin.permissionNotCataloged"),
    };
  });
  const modules = Array.from(new Set(rows.map((entry) => entry.module))).sort();
  const visibleRows = selectedModule === "all" ? rows : rows.filter((entry) => entry.module === selectedModule);

  function toggleSelection(index: number) {
    setSelectedIndexes((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));
  }

  function setVisibleSelection(checked: boolean) {
    const visibleIndexes = visibleRows.map((entry) => entry.index);
    setSelectedIndexes((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIndexes]));
      return current.filter((index) => !visibleIndexes.includes(index));
    });
  }

  function bulkUpdateAllow(allow: boolean) {
    if (selectedIndexes.length === 0) return;
    onBulkUpdate(selectedIndexes, { allow });
  }

  function bulkRemove() {
    if (selectedIndexes.length === 0) return;
    onBulkRemove(selectedIndexes);
    setSelectedIndexes([]);
  }

  function removeOne(index: number) {
    onRemove(index);
    setSelectedIndexes((current) => current.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)));
  }

  return (
    <section className="surface rounded-lg">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-lg font-bold">{t("admin.directPermissions")} ({entries.length})</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--muted)]">{t("admin.selectedCount", { count: selectedIndexes.length })}</span>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(true)}>
          {t("admin.bulkSetTrue")}
        </button>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(false)}>
          {t("admin.bulkSetFalse")}
        </button>
        <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedIndexes.length === 0} type="button" onClick={bulkRemove}>
          {t("admin.bulkDelete")}
        </button>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[160px_1fr]">
        <div className="grid h-fit gap-2">
          <button
            className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
              selectedModule === "all" ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"
            }`}
            type="button"
            onClick={() => onModuleChange("all")}
          >
            {t("admin.moduleAll")}
          </button>
          {modules.map((module) => (
            <button
              key={module}
              className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                selectedModule === module ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => onModuleChange(module)}
            >
              {module}
            </button>
          ))}
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] px-3 py-3">
                  <input
                    checked={visibleRows.length > 0 && visibleRows.every((entry) => selectedIndexes.includes(entry.index))}
                    type="checkbox"
                    onChange={(event) => setVisibleSelection(event.target.checked)}
                  />
                </th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.permission")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.value")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.expiresAt")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.description")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.operation")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entry) => (
                <tr key={`user-permission-${entry.index}`} className="hover:bg-[var(--panel-subtle)]">
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <input checked={selectedIndexes.includes(entry.index)} type="checkbox" onChange={() => toggleSelection(entry.index)} />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <input
                      className="field px-3 py-2 font-mono"
                      onChange={(event) => onUpdate(entry.index, { code: event.target.value.trim() })}
                      value={entry.code}
                    />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <button
                      className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${
                        entry.allow ? "bg-[var(--panel-subtle)] text-[var(--accent)]" : "bg-[var(--panel-subtle)] text-[var(--red)]"
                      }`}
                      type="button"
                      onClick={() => onUpdate(entry.index, { allow: !entry.allow })}
                    >
                      {entry.allow ? "true" : "false"}
                    </button>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-[var(--muted)]">{entry.expiresAt ? t("admin.expireTime") : t("admin.neverExpires")}</span>
                      <input
                        className="field px-3 py-2"
                        onChange={(event) => onUpdate(entry.index, { expiresAt: event.target.value })}
                        title={t("admin.emptyDateMeansNever")}
                        type="date"
                        value={entry.expiresAt ? entry.expiresAt.slice(0, 10) : ""}
                      />
                    </label>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted)]">
                    <span className="block font-semibold text-[var(--foreground)]">{entry.name}</span>
                    <span className="mt-1 block">{entry.description}</span>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <button className="button-secondary focus-ring whitespace-nowrap px-3 py-2" type="button" onClick={() => removeOne(entry.index)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                    {t("admin.noPermissionNodesInFilter")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {children}
    </section>
  );
}

function ParentRolePicker({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string[];
  onChange: (roles: string[]) => void;
}) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);

  function commit(nextValue: string) {
    onChange(splitCodes(nextValue));
  }

  function toggleRole(roleCode: string) {
    const next = value.includes(roleCode) ? value.filter((code) => code !== roleCode) : [...value, roleCode];
    onChange(next);
  }

  return (
    <div className="relative mt-2">
      <input
        className="field font-mono"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => commit(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="project_editor.[ProjectID], moderator"
        value={value.join(", ")}
      />
      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-xl">
          {roles.map((role) => {
            const selected = value.includes(role.code);
            const roleText = localizedText(role, locale);
            return (
              <button
                key={role.code}
                className={`grid w-full gap-1 px-4 py-3 text-left hover:bg-[var(--panel-subtle)] ${
                  selected ? "bg-[var(--accent)]/15" : ""
                }`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleRole(role.code)}
              >
                <span className="font-mono font-bold">{role.code}</span>
                <span className="text-sm text-[var(--muted)]">{roleText.name || roleText.description}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PermissionBulkAdder({
  allow,
  description,
  expiresAt,
  input,
  name,
  permissions,
  selectedCodes,
  onAdd,
  onAllowChange,
  onDescriptionChange,
  onExpiresAtChange,
  onInputChange,
  onNameChange,
}: {
  allow: boolean;
  description: string;
  expiresAt: string;
  input: string;
  name: string;
  permissions: Permission[];
  selectedCodes: string[];
  onAdd: () => void;
  onAllowChange: (value: boolean) => void;
  onDescriptionChange: (value: string) => void;
  onExpiresAtChange: (value: string) => void;
  onInputChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = parsePermissionInput(input);
  const suggestions = permissionSuggestions(permissions, input, selectedCodes, locale);

  function appendPermission(code: string) {
    const next = Array.from(new Set([...selected, code])).join("\n");
    onInputChange(next);
  }

  function removePermission(code: string) {
    onInputChange(selected.filter((item) => item !== code).join("\n"));
  }

  function togglePermission(code: string) {
    if (selected.includes(code)) {
      removePermission(code);
      return;
    }
    appendPermission(code);
  }

  return (
    <div className="grid gap-3 border-t border-[var(--line)] bg-[var(--panel-muted)] p-4">
      <div className="relative">
        {pickerOpen && suggestions.length > 0 ? (
          <div className="absolute bottom-full left-0 z-30 max-h-[50vh] w-full overflow-y-auto rounded-t-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl md:w-[min(760px,100%)]">
            {suggestions.map((permission) => {
              const isSelected = selected.includes(permission.code);
              const permissionText = localizedText(permission, locale);
              return (
                <button
                  key={permission.code}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 ${
                    isSelected ? "bg-[#9be33b] text-black" : "hover:bg-[var(--panel-subtle)]"
                  }`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => togglePermission(permission.code)}
                >
                  <span>
                    <span className="block font-mono text-sm font-bold md:text-base">{permission.code}</span>
                    <span className={isSelected ? "text-black/60" : "text-[var(--muted)]"}>
                      {permissionText.description || permissionText.name}
                    </span>
                  </span>
                  {isSelected ? <span className="font-mono text-sm font-bold">{t("admin.selected")}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-2 shadow-inner">
          {selected.length > 0 ? (
            <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {selected.map((code) => (
                <button
                  key={code}
                  className="rounded bg-black/20 px-2.5 py-1 font-mono text-sm text-[var(--text)] hover:bg-black/30"
                  type="button"
                  onClick={() => removePermission(code)}
                >
                  {code} <span className="text-[var(--muted)]">x</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            className="min-h-24 w-full resize-y bg-transparent px-2 py-2 font-mono text-sm outline-none placeholder:text-[var(--muted)]"
            onBlur={() => window.setTimeout(() => setPickerOpen(false), 120)}
            onChange={(event) => {
              setPickerOpen(true);
              onInputChange(event.target.value);
            }}
            onFocus={() => setPickerOpen(true)}
            placeholder={t("admin.permissionBulkPlaceholder")}
            value={input}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[160px_180px_1fr_1fr_auto]">
        <div className="grid grid-cols-2 gap-2">
          <button className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${allow ? "bg-[var(--accent)] text-white" : "button-secondary"}`} type="button" onClick={() => onAllowChange(true)}>
            true
          </button>
          <button className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${!allow ? "bg-[var(--red)] text-white" : "button-secondary"}`} type="button" onClick={() => onAllowChange(false)}>
            false
          </button>
        </div>
        <input className="field" type="date" value={expiresAt} onChange={(event) => onExpiresAtChange(event.target.value)} />
        <input className="field" placeholder={t("admin.permissionNamePlaceholder")} value={name} onChange={(event) => onNameChange(event.target.value)} />
        <input className="field" placeholder={t("admin.permissionDescriptionPlaceholder")} value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
        <button className="button-primary focus-ring" type="button" onClick={onAdd}>
          {t("common.create")}
        </button>
      </div>
    </div>
  );
}

function PermissionCatalogEditor({
  catalog,
  token,
  refreshCatalog,
}: {
  catalog: PermissionCatalog;
  token: string;
  refreshCatalog: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Permission[]>(() =>
    catalog.permissions.map((permission) => ({
      ...permission,
      translations: normalizeLocalizedTexts(permission.translations),
    })),
  );
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const [aiCompleting, setAICompleting] = useState(false);
  const [message, setMessage] = useState("");

  const visible = draft.filter((permission) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    const source = editableLocalizedText(permission, sourceLocale);
    const target = editableLocalizedText(permission, targetLocale);
    return `${permission.code} ${permission.module} ${permission.name} ${permission.description} ${source.name} ${source.description} ${target.name} ${target.description}`
      .toLowerCase()
      .includes(keyword);
  });

  function updatePermissionDraft(code: string, patch: Partial<Permission>) {
    setDraft((current) => current.map((permission) => (permission.code === code ? { ...permission, ...patch } : permission)));
  }

  async function savePermissions() {
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      for (const permission of draft) {
        await apiRequest<{ ok: boolean }>(
          "/api/v1/admin/permissions",
          {
            method: "POST",
            body: JSON.stringify({
              code: permission.code,
              module: permission.module.trim() || permissionModule(permission.code),
              name: withFallbackLocalizedText(permission).name,
              description: withFallbackLocalizedText(permission).description,
              translations: normalizeLocalizedTexts(permission.translations),
            }),
          },
          token,
        );
      }
      await refreshCatalog();
      setMessage(t("admin.permissionListSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function completePermissionTranslations() {
    if (sourceLocale === targetLocale) {
      notifyAdminNotice(t("admin.ai.sameLanguage"), t("admin.noticeTitle"), "danger");
      return;
    }
    const candidates = visible.filter((permission) => {
      const target = editableLocalizedText(permission, targetLocale);
      return target.name.trim() === "" || target.description.trim() === "";
    }).slice(0, 100);
    if (candidates.length === 0) {
      notifyAdminNotice(t("admin.ai.noMissingTranslations"));
      return;
    }
    setAICompleting(true);
    try {
      const result = await runAITranslationTask(token, aiTranslationTaskTypes.permission, {
        sourceLocale,
        targetLocale,
        items: candidates.map((permission) => ({ key: permission.code, ...editableLocalizedText(permission, sourceLocale) })),
      });
      const translated = new Map((result.items ?? []).map((item) => [item.key, item]));
      let completed = 0;
      const nextDraft = draft.map((permission) => {
        const item = translated.get(permission.code);
        if (!item) return permission;
        const target = editableLocalizedText(permission, targetLocale);
        const name = target.name || item.name?.trim() || "";
        const description = target.description || item.description?.trim() || "";
        if (name === target.name && description === target.description) return permission;
        completed += 1;
        return {
          ...permission,
          translations: setLocalizedText(permission.translations, targetLocale, { name, description }),
        };
      });
      setDraft(nextDraft);
      notifyAdminNotice(t("admin.ai.translationCompleted", { count: completed }));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setAICompleting(false);
    }
  }

  return (
    <section className="surface flex min-h-[calc(100vh-8rem)] flex-col rounded-lg p-4">
      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t("admin.permissionList")}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.permissionListI18nDesc")}</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto] sm:items-center xl:min-w-[940px]">
          <input className="field min-w-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.searchPermission")} />
          <select className="field w-auto py-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {t("admin.sourceLanguage")}: {item.label}
              </option>
            ))}
          </select>
          <select className="field w-auto py-2" value={targetLocale} onChange={(event) => setTargetLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {t("admin.targetLanguage")}: {item.label}
              </option>
            ))}
          </select>
          <button className="button-secondary focus-ring whitespace-nowrap" disabled={aiCompleting} type="button" onClick={completePermissionTranslations}>
            {aiCompleting ? t("admin.ai.completingTranslation") : t("admin.ai.completeTranslation")}
          </button>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={savePermissions}>
            {saving ? t("admin.saving") : t("admin.savePermissionList")}
          </button>
        </div>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="sticky top-0 z-10 grid gap-2 border-b border-[var(--line)] bg-[var(--panel)] py-3 text-xs font-bold uppercase text-[var(--muted)] lg:grid-cols-[1.2fr_140px_1.2fr_1.2fr_1.5fr]">
          <div>{t("admin.permissionNodes")}</div>
          <div>{t("admin.module")}</div>
          <div>{sourceLocale} {t("admin.reference")}</div>
          <div>{targetLocale} {t("admin.displayName")}</div>
          <div>{targetLocale} {t("admin.description")}</div>
        </div>
        {visible.map((permission) => (
          <div
            key={permission.code}
            className="grid gap-2 border-b border-[var(--line)] py-3 last:border-b-0 lg:grid-cols-[1.2fr_140px_1.2fr_1.2fr_1.5fr]"
          >
            <div className="font-mono text-sm font-bold">{permission.code}</div>
            <input
              className="field px-3 py-2"
              value={permission.module}
              onChange={(event) => updatePermissionDraft(permission.code, { module: event.target.value })}
            />
            <div className="rounded-md bg-[var(--panel-subtle)] px-3 py-2 text-sm text-[var(--muted)]">
              <span className="block font-semibold text-[var(--foreground)]">
                {editableLocalizedText(permission, sourceLocale).name || t("admin.emptyTranslation")}
              </span>
              <span className="mt-1 block">
                {editableLocalizedText(permission, sourceLocale).description || t("admin.emptyTranslation")}
              </span>
            </div>
            <input
              key={`${targetLocale}:${permission.code}:name`}
              className="field px-3 py-2"
              value={editableLocalizedText(permission, targetLocale).name}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { name: event.target.value }),
                })
              }
            />
            <input
              key={`${targetLocale}:${permission.code}:description`}
              className="field px-3 py-2"
              value={editableLocalizedText(permission, targetLocale).description}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { description: event.target.value }),
                })
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function UserRolePanel({
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
  const { locale, t } = useI18n();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const [details, setDetails] = useState<UserPermissionDetails | null>(null);
  const [draft, setDraft] = useState<UserPermissionEntry[]>([]);
  const [bulkPermissionInput, setBulkPermissionInput] = useState("");
  const [bulkPermissionAllow, setBulkPermissionAllow] = useState(true);
  const [bulkPermissionExpiresAt, setBulkPermissionExpiresAt] = useState("");
  const [bulkPermissionName, setBulkPermissionName] = useState("");
  const [bulkPermissionDescription, setBulkPermissionDescription] = useState("");
  const [selectedModule, setSelectedModule] = useState("all");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !selectedUser) return;
    let cancelled = false;
    async function loadUserPermissions() {
      try {
        const data = await apiRequest<UserPermissionDetails>(
          `/api/v1/admin/users/${selectedUser.id}/permissions`,
          {},
          token,
        );
        if (!cancelled) {
          setDetails(data);
          setDraft([
            ...data.groupPermissions.map((code) => ({ code, allow: true })),
            ...data.directPermissions.map((permission) => ({
              code: permission.code,
              allow: permission.allow,
              expiresAt: permission.expiresAt,
            })),
          ]);
        }
      } catch (error) {
        if (!cancelled) setMessage(cleanError(error));
      }
    }
    loadUserPermissions();
    return () => {
      cancelled = true;
    };
  }, [selectedUser, token]);

  async function saveUserPermissions() {
    if (!selectedUser) return;
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await apiRequest<{ ok: boolean }>(
        `/api/v1/admin/users/${selectedUser.id}/permissions`,
        { method: "PUT", body: JSON.stringify({ permissions: draft }) },
        token,
      );
      await refreshUsers();
      setMessage(t("admin.userPermissionsSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function addUserPermissionEntriesFromInput() {
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput).filter((code) => !code.includes("[") && !code.includes("]"));
    if (codes.length === 0) {
      setMessage(t("admin.userPermissionInputRequired"));
      return;
    }
    const existingCodes = new Set(catalog.permissions.map((permission) => permission.code));
    const currentCodes = new Set(draft.map((permission) => permission.code));
    try {
      for (const code of codes) {
        if (code.startsWith("group.")) continue;
        if (!existingCodes.has(code)) {
          await apiRequest<{ ok: boolean }>(
            "/api/v1/admin/permissions",
            {
              method: "POST",
              body: JSON.stringify(buildNewPermissionPayload(code, bulkPermissionName, bulkPermissionDescription, locale)),
            },
            token,
          );
        }
      }
      setDraft((current) => [
        ...current,
        ...codes
          .filter((code) => !currentCodes.has(code))
          .map((code) => ({ code, allow: bulkPermissionAllow, expiresAt: bulkPermissionExpiresAt })),
      ]);
      setBulkPermissionInput("");
      setBulkPermissionName("");
      setBulkPermissionDescription("");
      setMessage(t("admin.userPermissionAdded"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  const roleNameMap = new Map(catalog.roles.map((role) => [role.code, role.name || role.code]));
  const assignedRoleCodes = Array.from(
    new Set([
      ...(selectedUser?.roleCodes ?? []),
      ...draft.filter((permission) => permission.code.startsWith("group.")).map((permission) => permission.code.slice("group.".length)),
    ]),
  ).filter(Boolean);

  function bulkUpdateUserPermissionDraft(indexes: number[], patch: Partial<UserPermissionEntry>) {
    const selected = new Set(indexes);
    setDraft((current) => current.map((item, index) => (selected.has(index) ? { ...item, ...patch } : item)));
  }

  function bulkRemoveUserPermissionDraft(indexes: number[]) {
    const selected = new Set(indexes);
    setDraft((current) => current.filter((_, index) => !selected.has(index)));
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <section className="surface overflow-hidden rounded-lg">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-lg font-bold">{t("admin.users")}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.userCount", { count: users.length })}</p>
        </div>
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
          {users.map((user) => (
            <button
              key={user.id}
              className={`w-full border-b border-[var(--line)] px-4 py-3 text-left ${
                selectedUser?.id === user.id ? "bg-[var(--panel-subtle)]" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => {
                setSelectedUserId(user.id);
                setDetails(null);
                setDraft([]);
                setMessage("");
              }}
            >
              <span className="block font-bold">{user.username}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">ID {user.id}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">User</p>
            <h2 className="text-xl font-bold">{selectedUser ? selectedUser.username : t("admin.noUserSelected")}</h2>
            {assignedRoleCodes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {assignedRoleCodes.map((roleCode) => (
                  <span key={roleCode} className="rounded-md bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                    {roleNameMap.get(roleCode) ?? roleCode}
                    <span className="ml-1 font-mono text-[var(--foreground)]">({roleCode})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">{t("admin.noRoleAssigned")}</p>
            )}
          </div>
          <button className="button-primary focus-ring" disabled={!selectedUser || saving} type="button" onClick={saveUserPermissions}>
            {saving ? t("admin.saving") : t("admin.saveUserPermissions")}
          </button>
        </div>
        {message ? <div className="px-4"><InlineMessage text={message} /></div> : null}
      {users.length === 0 ? (
        <EmptyState text={t("admin.noUsers")} />
      ) : (
        <>
          <UserPermissionNodeEditor
            entries={draft}
            catalog={catalog}
            selectedModule={selectedModule}
            onModuleChange={setSelectedModule}
            onUpdate={updatePermissionDraft}
            onRemove={(index) => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            onBulkUpdate={bulkUpdateUserPermissionDraft}
            onBulkRemove={bulkRemoveUserPermissionDraft}
          >
            <PermissionBulkAdder
              allow={bulkPermissionAllow}
              description={bulkPermissionDescription}
              expiresAt={bulkPermissionExpiresAt}
              input={bulkPermissionInput}
              name={bulkPermissionName}
              permissions={[
                ...catalog.roles.map((role) => ({
                  code: `group.${role.code}`,
                  module: "group",
                  name: localizedText(role, locale).name,
                  description: localizedText(role, locale).description,
                  translations: role.translations,
                })),
                ...catalog.permissions.filter((permission) => !permission.code.includes("[") && !permission.code.includes("]")),
              ]}
              selectedCodes={draft.map((permission) => permission.code)}
              onAdd={addUserPermissionEntriesFromInput}
              onAllowChange={setBulkPermissionAllow}
              onDescriptionChange={setBulkPermissionDescription}
              onExpiresAtChange={setBulkPermissionExpiresAt}
              onInputChange={setBulkPermissionInput}
              onNameChange={setBulkPermissionName}
            />
          </UserPermissionNodeEditor>
          {details ? (
            <div className="border-t border-[var(--line)] p-4 text-sm text-[var(--muted)]">
              {t("admin.effectivePermissions", { count: details.effectivePermissionRules.length })}
            </div>
          ) : null}
        </>
      )}
      </section>
    </div>
  );

  function updatePermissionDraft(index: number, patch: Partial<UserPermissionEntry>) {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }
}

function NATSConfigPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<NATSConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<NATSConfig>("/api/v1/admin/config/nats", {}, token)
      .then((config) => {
        if (!cancelled) setDraft({ ...config, password: "", token: "" });
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
          body: JSON.stringify({
            enabled: draft.enabled,
            url: draft.url,
            username: draft.username,
            password: draft.password ?? "",
            token: draft.token ?? "",
            subjectPrefix: draft.subjectPrefix,
            tasks: draft.tasks,
          }),
        },
        token,
      );
      setDraft({ ...saved, password: "", token: "" });
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
            <input checked={draft.enabled} type="checkbox" onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
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
          <label className="text-sm font-semibold">
            {t("admin.nats.password")}
            <input className="field mt-2" value={draft.password ?? ""} autoComplete="new-password" placeholder={draft.hasPassword ? t("admin.nats.secretSaved") : ""} type="password" onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
          </label>
          <label className="text-sm font-semibold md:col-span-2 xl:col-span-3">
            {t("admin.nats.token")}
            <input className="field mt-2" value={draft.token ?? ""} autoComplete="off" placeholder={draft.hasToken ? t("admin.nats.secretSaved") : t("admin.nats.tokenHint")} type="password" onChange={(event) => setDraft({ ...draft, token: event.target.value })} />
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
          <div className="hidden gap-3 px-3 text-xs font-bold text-[var(--muted)] xl:grid xl:grid-cols-[minmax(190px,1.2fr)_minmax(240px,1.4fr)_120px_120px_minmax(300px,2fr)]">
            <span>{t("admin.ai.taskType")}</span>
            <span>{t("admin.ai.model")}</span>
            <span>{t("admin.ai.concurrencyLimit")}</span>
            <span>{t("admin.ai.timeoutSeconds")}</span>
            <span>{t("admin.ai.prompt")}</span>
          </div>
          {draft.taskModels.map((item, index) => (
            <div key={item.taskType} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 xl:grid-cols-[minmax(190px,1.2fr)_minmax(240px,1.4fr)_120px_120px_minmax(300px,2fr)]">
              <div className="flex min-h-11 items-center font-semibold">{aiTaskTypeLabel(item.taskType, t)}</div>
              <select className="field" value={item.modelKey} onChange={(event) => setAITaskModel(draft, setDraft, index, { modelKey: event.target.value })}>
                <option value="">{t("admin.ai.selectModel")}</option>
                {availableModels.map((model) => {
                  const key = `${model.provider}/${model.model}`;
                  return <option key={key} value={key}>{model.displayName ? `${model.displayName} (${key})` : key}</option>;
                })}
              </select>
              <input className="field" type="number" value={item.concurrencyLimit} placeholder={t("admin.ai.concurrencyLimit")} onChange={(event) => setAITaskModel(draft, setDraft, index, { concurrencyLimit: Number(event.target.value) })} />
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
  const [defaults, setDefaults] = useState<PermissionDefaults>({ registeredRole: "", bannedRole: "", developerRole: "", editorRole: "" });
  const [levelConfig, setLevelConfig] = useState<LevelConfig | null>(null);
  const [roleTracks, setRoleTracks] = useState<RoleTrack[]>([]);
  const [saving, setSaving] = useState(false);
  const variableRoles = catalog.roles.filter((role) => role.code.split(".").some((segment) => /^\[(projectid)\]$|^<(projectid)>$/i.test(segment)));

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

      <section className="grid gap-4 border-b border-[var(--line)] py-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <h3 className="font-black">{t("admin.permissionSettings.projectDefaults")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.permissionSettings.projectDefaultsDescription")}</p>
        </div>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.developerRole")}
          value={defaults.developerRole}
          onChange={(developerRole) => setDefaults((current) => ({ ...current, developerRole }))}
        >
          {roleOptions(variableRoles)}
        </PermissionRoleSelect>
        <PermissionRoleSelect
          label={t("admin.permissionSettings.editorRole")}
          value={defaults.editorRole}
          onChange={(editorRole) => setDefaults((current) => ({ ...current, editorRole }))}
        >
          {roleOptions(variableRoles)}
        </PermissionRoleSelect>
        {variableRoles.length === 0 ? (
          <p className="md:col-span-2 text-sm font-bold text-[var(--warning)]">{t("admin.permissionSettings.noVariableRoles")}</p>
        ) : null}
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
            <input className="field mt-2" value={draft.plantUMLServer} onChange={(event) => setDraft((current) => ({ ...current, plantUMLServer: event.target.value }))} />
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

function UsersPanelV2({
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
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<AdminUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await apiRequest<User[]>(`/api/v1/admin/users?q=${encodeURIComponent(query)}`, {}, token);
        if (!cancelled) setSearchResults(result);
      } catch (error) {
        if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.userSearchFailed"), "danger");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, t, token]);

  async function openUserDetails(userID: string) {
    setSelectedUserDetails(null);
    setDetailsLoading(true);
    try {
      setSelectedUserDetails(await apiRequest<AdminUserDetails>(`/api/v1/admin/users/${userID}`, {}, token));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.userDetailsLoadFailed"), "danger");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const roles = String(form.get("roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    const payload = {
      username: String(form.get("username") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      status: String(form.get("status") ?? "active"),
      roles,
    };
    try {
      await apiRequest<User>("/api/v1/admin/users", { method: "POST", body: JSON.stringify(payload) }, token);
      await refreshUsers();
      event.currentTarget.reset();
      setMessage(t("admin.userCreated"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PanelShell title={t("admin.userList")}>
      <form className="mb-5 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4" onSubmit={createUser}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">{t("admin.createUser")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.createUserHint")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={creating} type="submit">
            {creating ? t("admin.saving") : t("admin.createUser")}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-sm font-semibold">
            {t("admin.username")}
            <input className="field mt-2" name="username" placeholder="steve" required />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.email")}
            <input className="field mt-2" name="email" placeholder="name@example.com" required type="email" />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.initialPassword")}
            <input className="field mt-2" minLength={8} name="password" required type="password" />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
          <label className="text-sm font-semibold">
            {t("admin.status")}
            <select className="field mt-2" defaultValue="active" name="status">
              <option value="active">{t("admin.active")}</option>
              <option value="banned">{t("admin.banned")}</option>
              <option value="deleted">{t("admin.deleted")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            {t("admin.roleList")}
            <input className="field mt-2" list="create-user-role-options" name="roles" />
          </label>
        </div>
        <datalist id="create-user-role-options">
          {catalog.roles.map((role) => (
            <option key={role.code} value={role.code} />
          ))}
        </datalist>
        {message ? <InlineMessage text={message} /> : null}
      </form>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="min-w-64 flex-1">
          <span className="sr-only">{t("admin.searchUsers")}</span>
          <input
            className="field"
            placeholder={t("admin.searchUsersPlaceholder")}
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const value = event.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setSearchResults(null);
                setSearching(false);
              }
            }}
          />
        </label>
        <span className="text-sm text-[var(--muted)]">
          {searching ? t("admin.searchingUsers") : t("admin.userCount", { count: (searchResults ?? users).length })}
        </span>
      </div>
      {(searchResults ?? users).length === 0 ? (
        <EmptyState text={t("admin.noUsers")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] py-2">ID</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.users")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.email")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.registeredAt")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.status")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.roleList")}</th>
              </tr>
            </thead>
            <tbody>
              {(searchResults ?? users).map((user) => (
                <tr key={user.id}>
                  <td className="border-b border-[var(--line)] py-3">{user.id}</td>
                  <td className="border-b border-[var(--line)] py-3">
                    <button
                      className="focus-ring text-left font-semibold text-[var(--accent)] hover:underline"
                      type="button"
                      onClick={() => void openUserDetails(user.id)}
                    >
                      {user.username}
                    </button>
                  </td>
                  <td className="border-b border-[var(--line)] py-3">{user.email}</td>
                  <td className="border-b border-[var(--line)] py-3">{formatDateTime(user.createdAt)}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.status}</td>
                  <td className="border-b border-[var(--line)] py-3">{(user.roleCodes ?? []).join(", ") || "member"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailsLoading ? <UserDetailsLoadingDialog /> : null}
      {selectedUserDetails ? (
        <AdminUserDetailsDialog
          details={selectedUserDetails}
          token={token}
          onClose={() => setSelectedUserDetails(null)}
          onStatusChanged={async () => {
            await refreshUsers();
            await openUserDetails(selectedUserDetails.user.id);
          }}
        />
      ) : null}
    </PanelShell>
  );
}

function UserDetailsLoadingDialog() {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4" role="dialog" aria-modal="true">
      <div className="surface w-full max-w-sm rounded-lg p-6 text-center shadow-2xl">
        <p className="font-bold">{t("admin.loadingUserDetails")}</p>
      </div>
    </div>
  );
}

function AdminUserDetailsDialog({
  details,
  token,
  onClose,
  onStatusChanged,
}: {
  details: AdminUserDetails;
  token: string;
  onClose: () => void;
  onStatusChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const user = details.user;
  const [status, setStatus] = useState(user.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const registrationLocation = formatUserLocation(details.registrationCountryCode, details.registrationCity);
  const lastLoginLocation = formatUserLocation(details.lastLogin?.countryCode, details.lastLogin?.city);

  async function saveStatus() {
    setSavingStatus(true);
    try {
      await apiRequest(`/api/v1/admin/users/${user.id}/status`, { method: "PUT", body: JSON.stringify({ status }) }, token);
      notifyAdminNotice(t("admin.userStatusSaved"));
      await onStatusChanged();
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        className="surface flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--line)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">UID {user.id}</p>
            <h2 id="admin-user-details-title" className="text-xl font-bold">{user.username}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
          </div>
          <button className="focus-ring grid h-10 w-10 place-items-center rounded-md text-xl hover:bg-[var(--panel-subtle)]" title={t("common.close")} type="button" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <section className="flex flex-wrap items-end gap-3 border-b border-[var(--line)] px-5 py-4">
            <label className="min-w-52 text-sm font-semibold">{t("admin.status")}
              <select className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="active">{t("admin.active")}</option>
                <option value="banned">{t("admin.banned")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
                <option value="deleted">{t("admin.deleted")}</option>
              </select>
            </label>
            <button className="button-primary focus-ring" disabled={savingStatus || status === user.status} type="button" onClick={() => void saveStatus()}>{savingStatus ? t("admin.saving") : t("common.save")}</button>
          </section>
          <section className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <UserDetailValue label={t("admin.status")} value={user.status} />
            <UserDetailValue label={t("admin.registeredAt")} value={formatDateTime(user.createdAt)} />
            <UserDetailValue label={t("admin.lastLoginAt")} value={formatDateTime(details.lastLogin?.at || user.lastLoginAt)} />
            <UserDetailValue label={t("admin.timezone")} value={details.timezone || "-"} />
            <UserDetailValue label={t("admin.primaryLanguage")} value={details.primaryLanguage || "-"} />
            <UserDetailValue label={t("admin.secondaryLanguage")} value={details.secondaryLanguage || "-"} />
            <UserDetailValue label={t("admin.selectedCountry")} value={details.country || "-"} />
            <UserDetailValue label={t("admin.emailVerified")} value={user.emailVerified ? t("common.yes") : t("common.no")} />
            <UserDetailValue label={t("admin.oauthBound")} value={details.oauthProviders.length > 0 ? details.oauthProviders.join(", ") : t("common.no")} />
            <UserDetailValue label={t("admin.registrationIp")} value={details.registrationIp || "-"} />
            <UserDetailValue label={t("admin.registrationLocation")} value={registrationLocation} />
            <UserDetailValue label={t("admin.lastLoginIp")} value={details.lastLogin?.ip || "-"} />
            <UserDetailValue label={t("admin.lastLoginLocation")} value={lastLoginLocation} />
            <UserDetailValue label={t("admin.lastLoginDevice")} value={details.lastLogin?.userAgent || "-"} wide />
          </section>

          <AdminUserBalanceEditor token={token} userID={user.id} />

          <section className="border-t border-[var(--line)] px-5 py-5">
            <h3 className="font-bold">{t("admin.roleList")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(user.roleCodes ?? []).length > 0 ? (user.roleCodes ?? []).map((role) => (
                <span key={role} className="rounded-md bg-[var(--panel-subtle)] px-2.5 py-1 font-mono text-xs">{role}</span>
              )) : <span className="text-sm text-[var(--muted)]">{t("admin.noRoleAssigned")}</span>}
            </div>
          </section>

          <section className="border-t border-[var(--line)] px-5 py-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-bold">{t("admin.rootPermissions")}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.rootPermissionsHint")}</p>
              </div>
              <span className="text-sm text-[var(--muted)]">{t("admin.permissionCount", { count: details.rootPermissions.length })}</span>
            </div>
            {details.rootPermissions.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">{t("admin.noRootPermissions")}</p>
            ) : (
              <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-[var(--line)]">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
                    <tr>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionCode")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionValue")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionSource")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionPriority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.rootPermissions.map((permission) => (
                      <tr key={permission.code}>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono">{permission.code}</td>
                        <td className={`border-b border-[var(--line)] px-3 py-2 font-mono font-bold ${permission.allow ? "text-[var(--accent)]" : "text-red-600"}`}>
                          {String(permission.allow)}
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono text-xs">{permission.source === "user" ? t("admin.directUserPermission") : permission.source}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2">{permission.priority >= 1_000_000_000 ? t("admin.highestPriority") : permission.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function AdminUserBalanceEditor({ token, userID }: { token: string; userID: string }) {
  const { locale, t } = useI18n();
  const [balances, setBalances] = useState<AdminUserBalance[]>([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = balances.find((item) => item.code === currencyCode);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ items: AdminUserBalance[] }>(`/api/v1/admin/users/${userID}/balances`, {}, token)
      .then((result) => {
        if (cancelled) return;
        const items = result.items ?? [];
        setBalances(items);
        setCurrencyCode(items[0]?.code || "");
        setAmount(items[0] ? String(items[0].balance) : "");
      })
      .catch((error) => {
        if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.userBalancesLoadFailed"), "danger");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t, token, userID]);

  async function saveBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount)) {
      notifyAdminNotice(t("admin.invalidBalanceAmount"), t("admin.noticeTitle"), "danger");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ balance: number }>(`/api/v1/admin/users/${userID}/balances`, {
        method: "POST",
        body: JSON.stringify({ currencyCode, mode, amount: parsedAmount, reason: reason.trim() }),
      }, token);
      setBalances((current) => current.map((item) => item.code === currencyCode ? { ...item, balance: result.balance } : item));
      setAmount(mode === "set" ? String(result.balance) : "");
      setReason("");
      notifyAdminNotice(t("admin.userBalanceSaved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-[var(--line)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{t("admin.userBalances")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.userBalancesHint")}</p>
        </div>
        {selected ? <strong className="rounded-lg bg-[var(--panel-subtle)] px-4 py-2 text-lg tabular-nums">{new Intl.NumberFormat(locale).format(selected.balance)} {selected.code}</strong> : null}
      </div>
      {loading ? <p className="mt-4 text-sm text-[var(--muted)]">{t("common.loading")}</p> : balances.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">{t("admin.noActiveCurrencies")}</p> : (
        <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_150px_minmax(160px,1fr)_minmax(240px,2fr)_auto]" onSubmit={saveBalance}>
          <label className="text-sm font-semibold">{t("admin.currency")}
            <select className="field mt-2" value={currencyCode} onChange={(event) => {
              const nextCode = event.target.value;
              setCurrencyCode(nextCode);
              const nextBalance = balances.find((item) => item.code === nextCode)?.balance ?? 0;
              setAmount(mode === "set" ? String(nextBalance) : "");
            }}>
              {balances.map((item) => <option key={item.publicId} value={item.code}>{item.name || item.code} ({item.code})</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">{t("admin.balanceMode")}
            <select className="field mt-2" value={mode} onChange={(event) => {
              const nextMode = event.target.value as "set" | "adjust";
              setMode(nextMode);
              setAmount(nextMode === "set" ? String(selected?.balance ?? 0) : "");
            }}>
              <option value="set">{t("admin.setBalance")}</option>
              <option value="adjust">{t("admin.adjustBalance")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">{mode === "set" ? t("admin.targetBalance") : t("admin.balanceDelta")}
            <input className="field mt-2" required step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">{t("admin.adjustmentReason")}
            <input className="field mt-2" maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="button-primary focus-ring self-end" disabled={saving || !currencyCode || !reason.trim()} type="submit">{saving ? t("admin.saving") : t("common.save")}</button>
        </form>
      )}
    </section>
  );
}

function UserDetailValue({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatUserLocation(countryCode?: string, city?: string) {
  return [countryCode, city].filter(Boolean).join(" / ") || "-";
}

function SystemNotificationPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceLocale, setSourceLocale] = useState<Locale>(locale);
  const [sendEmail, setSendEmail] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);
    try {
      await apiRequest(
        "/api/v1/admin/notifications",
        { method: "POST", body: JSON.stringify({ title, body, sourceLocale, sendEmail }) },
        token,
      );
      setTitle("");
      setBody("");
      notifyAdminNotice(t("admin.notifications.queued"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="surface rounded-lg p-5">
      <div className="mb-5">
        <h2 className="text-xl font-bold">{t("admin.notifications.title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.notifications.description")}</p>
      </div>
      <form className="grid gap-4" onSubmit={publish}>
        <label className="text-sm font-semibold">
          {t("admin.notifications.sourceLanguage")}
          <select className="field mt-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("admin.notifications.notificationTitle")}
          <input className="field mt-2" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {t("admin.notifications.body")}
          <textarea className="field mt-2 min-h-56 resize-y" maxLength={10000} required value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-4">
          <input checked={sendEmail} type="checkbox" onChange={(event) => setSendEmail(event.target.checked)} />
          <span>
            <span className="block font-semibold">{t("admin.notifications.sendEmail")}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">{t("admin.notifications.sendEmailDescription")}</span>
          </span>
        </label>
        <div className="flex justify-end">
          <button className="button-primary focus-ring" disabled={publishing} type="submit">
            {publishing ? t("admin.notifications.publishing") : t("admin.notifications.publish")}
          </button>
        </div>
      </form>
    </section>
  );
}

type NotificationTemplateTranslation = { title: string; body: string };
type NotificationTemplateDefinition = {
  code: string;
  translations: Record<string, NotificationTemplateTranslation>;
};

function NotificationTemplatePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [templates, setTemplates] = useState<NotificationTemplateDefinition[]>([]);
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale === "zh-CN" ? "en-US" : locale);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ templates: NotificationTemplateDefinition[] }>("/api/v1/admin/config/notifications", {}, token)
      .then((result) => { if (!cancelled) setTemplates(result.templates ?? []); })
      .catch((error) => { if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t, token]);

  function updateTemplate(index: number, language: string, field: keyof NotificationTemplateTranslation, value: string) {
    setTemplates((current) => current.map((template, templateIndex) => {
      if (templateIndex !== index) return template;
      const translation = template.translations?.[language] ?? { title: "", body: "" };
      return { ...template, translations: { ...template.translations, [language]: { ...translation, [field]: value } } };
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await apiRequest<{ templates: NotificationTemplateDefinition[] }>(
        "/api/v1/admin/config/notifications",
        { method: "PUT", body: JSON.stringify({ templates }) },
        token,
      );
      setTemplates(result.templates ?? []);
      notifyAdminNotice(t("admin.notificationTemplates.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="surface rounded-lg p-5 font-bold text-[var(--muted)]">{t("common.loading")}</section>;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-black">{t("admin.notificationTemplates.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.notificationTemplates.description")}</p></div>
      <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button>
    </header>
    <div className="surface grid gap-4 rounded-lg p-4 sm:grid-cols-2">
      <label className="text-sm font-bold">{t("admin.notificationTemplates.sourceLanguage")}<select className="field mt-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="text-sm font-bold">{t("admin.notificationTemplates.targetLanguage")}<select className="field mt-2" value={targetLocale} onChange={(event) => setTargetLocale(event.target.value as Locale)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
    </div>
    {templates.map((template, index) => {
      const source = template.translations?.[sourceLocale] ?? { title: "", body: "" };
      const target = template.translations?.[targetLocale] ?? { title: "", body: "" };
      return <section className="surface overflow-hidden rounded-lg" key={template.code}>
        <header className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><code className="font-bold">{template.code}</code></header>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <TemplateTranslationEditor label={t("admin.notificationTemplates.sourceColumn")} value={source} onChange={(field, value) => updateTemplate(index, sourceLocale, field, value)} />
          <TemplateTranslationEditor label={t("admin.notificationTemplates.targetColumn")} value={target} onChange={(field, value) => updateTemplate(index, targetLocale, field, value)} />
        </div>
      </section>;
    })}
  </section>;
}

function TemplateTranslationEditor({ label, value, onChange }: { label: string; value: NotificationTemplateTranslation; onChange: (field: keyof NotificationTemplateTranslation, value: string) => void }) {
  const { t } = useI18n();
  return <div className="grid gap-3"><h3 className="font-black">{label}</h3><label className="text-sm font-bold">{t("admin.notificationTemplates.templateTitle")}<input className="field mt-2" value={value.title} onChange={(event) => onChange("title", event.target.value)} /></label><label className="text-sm font-bold">{t("admin.notificationTemplates.templateBody")}<textarea className="field mt-2 min-h-28 resize-y" value={value.body} onChange={(event) => onChange("body", event.target.value)} /></label></div>;
}

type ReviewSettings = {
  blueprintCreate: boolean;
  blueprintEdit: boolean;
  serverCreate: boolean;
  tutorialCreate: boolean;
  tutorialEdit: boolean;
  issueCreate: boolean;
  issueEdit: boolean;
  newsCreate: boolean;
  newsEdit: boolean;
  discussionCreate: boolean;
  discussionEdit: boolean;
  changelogCreate: boolean;
  changelogEdit: boolean;
  modCreate: boolean;
  modEdit: boolean;
  modpackCreate: boolean;
  modpackEdit: boolean;
  pluginCreate: boolean;
  pluginEdit: boolean;
  mapCreate: boolean;
  mapEdit: boolean;
  resourcePackCreate: boolean;
  resourcePackEdit: boolean;
  shaderPackCreate: boolean;
  shaderPackEdit: boolean;
  datapackCreate: boolean;
  datapackEdit: boolean;
  addonCreate: boolean;
  addonEdit: boolean;
  authorCreate: boolean;
  authorEdit: boolean;
  authorClaim: boolean;
  teamCreate: boolean;
  teamEdit: boolean;
  teamClaim: boolean;
  modContentSectionCreate: boolean;
};

function ReviewSettingsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiRequest<ReviewSettings>("/api/v1/admin/config/reviews", {}, token)
      .then((result) => { if (!cancelled) setSettings(result); })
      .catch((error) => { if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"); });
    return () => { cancelled = true; };
  }, [t, token]);
  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await apiRequest<ReviewSettings>("/api/v1/admin/config/reviews", { method: "PUT", body: JSON.stringify(settings) }, token));
      notifyAdminNotice(t("admin.reviewSettings.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }
  if (!settings) return <section className="surface rounded-lg p-5 font-bold text-[var(--muted)]">{t("common.loading")}</section>;
  const options: Array<{ key: keyof ReviewSettings; title: string; description: string }> = [
    { key: "blueprintCreate", title: t("admin.reviewSettings.blueprintCreate"), description: t("admin.reviewSettings.blueprintCreateDescription") },
    { key: "blueprintEdit", title: t("admin.reviewSettings.blueprintEdit"), description: t("admin.reviewSettings.blueprintEditDescription") },
    { key: "serverCreate", title: t("admin.reviewSettings.serverCreate"), description: t("admin.reviewSettings.serverCreateDescription") },
    { key: "tutorialCreate", title: t("admin.reviewSettings.tutorialCreate"), description: t("admin.reviewSettings.tutorialCreateDescription") },
    { key: "tutorialEdit", title: t("admin.reviewSettings.tutorialEdit"), description: t("admin.reviewSettings.tutorialEditDescription") },
    { key: "issueCreate", title: t("admin.reviewSettings.issueCreate"), description: t("admin.reviewSettings.issueCreateDescription") },
    { key: "issueEdit", title: t("admin.reviewSettings.issueEdit"), description: t("admin.reviewSettings.issueEditDescription") },
    { key: "newsCreate", title: t("admin.reviewSettings.newsCreate"), description: t("admin.reviewSettings.newsCreateDescription") },
    { key: "newsEdit", title: t("admin.reviewSettings.newsEdit"), description: t("admin.reviewSettings.newsEditDescription") },
    { key: "discussionCreate", title: t("admin.reviewSettings.discussionCreate"), description: t("admin.reviewSettings.discussionCreateDescription") },
    { key: "discussionEdit", title: t("admin.reviewSettings.discussionEdit"), description: t("admin.reviewSettings.discussionEditDescription") },
    { key: "changelogCreate", title: t("admin.reviewSettings.changelogCreate"), description: t("admin.reviewSettings.changelogCreateDescription") },
    { key: "changelogEdit", title: t("admin.reviewSettings.changelogEdit"), description: t("admin.reviewSettings.changelogEditDescription") },
    { key: "modCreate", title: t("admin.reviewSettings.modCreate"), description: t("admin.reviewSettings.modCreateDescription") },
    { key: "modEdit", title: t("admin.reviewSettings.modEdit"), description: t("admin.reviewSettings.modEditDescription") },
    { key: "modpackCreate", title: t("admin.reviewSettings.modpackCreate"), description: t("admin.reviewSettings.modpackCreateDescription") },
    { key: "modpackEdit", title: t("admin.reviewSettings.modpackEdit"), description: t("admin.reviewSettings.modpackEditDescription") },
    { key: "pluginCreate", title: t("admin.reviewSettings.pluginCreate"), description: t("admin.reviewSettings.pluginCreateDescription") },
    { key: "pluginEdit", title: t("admin.reviewSettings.pluginEdit"), description: t("admin.reviewSettings.pluginEditDescription") },
    { key: "mapCreate", title: t("admin.reviewSettings.mapCreate"), description: t("admin.reviewSettings.mapCreateDescription") },
    { key: "mapEdit", title: t("admin.reviewSettings.mapEdit"), description: t("admin.reviewSettings.mapEditDescription") },
    { key: "resourcePackCreate", title: t("admin.reviewSettings.resourcePackCreate"), description: t("admin.reviewSettings.resourcePackCreateDescription") },
    { key: "resourcePackEdit", title: t("admin.reviewSettings.resourcePackEdit"), description: t("admin.reviewSettings.resourcePackEditDescription") },
    { key: "shaderPackCreate", title: t("admin.reviewSettings.shaderPackCreate"), description: t("admin.reviewSettings.shaderPackCreateDescription") },
    { key: "shaderPackEdit", title: t("admin.reviewSettings.shaderPackEdit"), description: t("admin.reviewSettings.shaderPackEditDescription") },
    { key: "datapackCreate", title: t("admin.reviewSettings.datapackCreate"), description: t("admin.reviewSettings.datapackCreateDescription") },
    { key: "datapackEdit", title: t("admin.reviewSettings.datapackEdit"), description: t("admin.reviewSettings.datapackEditDescription") },
    { key: "addonCreate", title: t("admin.reviewSettings.addonCreate"), description: t("admin.reviewSettings.addonCreateDescription") },
    { key: "addonEdit", title: t("admin.reviewSettings.addonEdit"), description: t("admin.reviewSettings.addonEditDescription") },
    { key: "authorCreate", title: t("admin.reviewSettings.authorCreate"), description: t("admin.reviewSettings.authorCreateDescription") },
    { key: "authorEdit", title: t("admin.reviewSettings.authorEdit"), description: t("admin.reviewSettings.authorEditDescription") },
    { key: "authorClaim", title: t("admin.reviewSettings.authorClaim"), description: t("admin.reviewSettings.authorClaimDescription") },
    { key: "teamCreate", title: t("admin.reviewSettings.teamCreate"), description: t("admin.reviewSettings.teamCreateDescription") },
    { key: "teamEdit", title: t("admin.reviewSettings.teamEdit"), description: t("admin.reviewSettings.teamEditDescription") },
    { key: "teamClaim", title: t("admin.reviewSettings.teamClaim"), description: t("admin.reviewSettings.teamClaimDescription") },
    { key: "modContentSectionCreate", title: t("admin.reviewSettings.modContentSectionCreate"), description: t("admin.reviewSettings.modContentSectionCreateDescription") },
  ];
  return <section className="space-y-4"><header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black">{t("admin.reviewSettings.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.reviewSettings.description")}</p></div><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button></header><div className="surface divide-y divide-[var(--line)] rounded-lg px-5">{options.map((option) => <label className="flex items-center justify-between gap-5 py-5" key={option.key}><span><span className="block font-black">{option.title}</span><span className="mt-1 block text-sm text-[var(--muted)]">{option.description}</span></span><input checked={settings[option.key]} type="checkbox" onChange={(event) => setSettings((current) => current ? { ...current, [option.key]: event.target.checked } : current)} /></label>)}</div></section>;
}

function isResourceDataPageTranslationKey(key: string) {
  return key.startsWith("mods.detail.dataCategories.") || key.startsWith("mods.detail.dataDescriptions.");
}

function TranslationManagerPanel({ token }: { token: string }) {
  const {
    locale,
    t,
    translationKeys,
    getTranslation,
    getBaseTranslation,
    getOwnTranslation,
    setTranslation,
    setTranslations,
    resetTranslation,
  } = useI18n();
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [aiCompleting, setAICompleting] = useState(false);

  const visibleKeys = translationKeys.filter((key) => {
    if (isResourceDataPageTranslationKey(key)) return false;
    const keyword = query.trim().toLowerCase();
    const targetOwn = getOwnTranslation(targetLocale, key);
    if (missingOnly && targetOwn.trim() !== "") return false;
    if (!keyword) return true;
    return (
      key.toLowerCase().includes(keyword) ||
      getTranslation(sourceLocale, key).toLowerCase().includes(keyword) ||
      targetOwn.toLowerCase().includes(keyword)
    );
  });

  function saveTranslation(key: string, value: string) {
    setTranslation(targetLocale, key, value);
  }

  async function completeMissingTranslations() {
    if (sourceLocale === targetLocale) {
      notifyAdminNotice(t("admin.ai.sameLanguage"), t("admin.noticeTitle"), "danger");
      return;
    }
    const candidates = visibleKeys
      .filter((key) => getOwnTranslation(targetLocale, key).trim() === "" && getTranslation(sourceLocale, key).trim() !== "")
      .slice(0, 100);
    if (candidates.length === 0) {
      notifyAdminNotice(t("admin.ai.noMissingTranslations"));
      return;
    }
    setAICompleting(true);
    try {
      const result = await runAITranslationTask(token, aiTranslationTaskTypes.i18n, {
        sourceLocale,
        targetLocale,
        items: candidates.map((key) => ({ key, text: getTranslation(sourceLocale, key) })),
      });
      const translations: Record<string, string> = {};
      for (const item of result.items ?? []) {
        const value = item.text?.trim() ?? "";
        if (candidates.includes(item.key) && value) translations[item.key] = value;
      }
      setTranslations(targetLocale, translations);
      notifyAdminNotice(t("admin.ai.translationCompleted", { count: Object.keys(translations).length }));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setAICompleting(false);
    }
  }

  return (
    <section className="surface rounded-lg">
      <div className="grid gap-3 border-b border-[var(--line)] p-4 lg:grid-cols-[1fr_220px_220px]">
        <div>
          <h2 className="text-lg font-bold">{t("admin.translationManager")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.i18nDesc")}</p>
        </div>
        <label className="text-sm font-semibold">
          {t("admin.sourceLanguage")}
          <select
            className="field mt-2"
            value={sourceLocale}
            onChange={(event) => setSourceLocale(event.target.value as Locale)}
          >
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("admin.targetLanguage")}
            <select
              className="field mt-2"
              value={targetLocale}
              onChange={(event) => setTargetLocale(event.target.value as Locale)}
            >
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-b border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field min-w-0 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t("common.search")} key / text`}
          />
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold">
            <input checked={missingOnly} type="checkbox" onChange={(event) => setMissingOnly(event.target.checked)} />
            {t("admin.missingOnly")}
          </label>
          <button className="button-primary focus-ring whitespace-nowrap" disabled={aiCompleting} type="button" onClick={completeMissingTranslations}>
            {aiCompleting ? t("admin.ai.completingTranslation") : t("admin.ai.completeTranslation")}
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto">
        <table className="w-full min-w-[960px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-64" />
            <col />
            <col />
            <col className="w-28" />
          </colgroup>
          <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.translationKey")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.sourceText")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.targetText")}</th>
              <th className="whitespace-nowrap border-b border-[var(--line)] px-4 py-3 align-bottom">{t("common.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleKeys.map((key) => {
              const baseTarget = getBaseTranslation(targetLocale, key);
              const target = getOwnTranslation(targetLocale, key);
              const edited = target !== "" && target !== baseTarget;
              return (
                <tr key={key}>
                  <td className="break-all border-b border-[var(--line)] px-4 py-4 align-top font-mono text-xs leading-5">{key}</td>
                  <td className="whitespace-pre-wrap break-words border-b border-[var(--line)] px-4 py-4 align-top leading-6">{getTranslation(sourceLocale, key)}</td>
                  <td className="border-b border-[var(--line)] px-4 py-4 align-top">
                    <textarea
                      key={`${targetLocale}:${key}:${target}`}
                      className="field min-h-24 resize-y leading-6"
                      defaultValue={target}
                      placeholder={target ? "" : t("admin.missingTranslation")}
                      onBlur={(event) => saveTranslation(key, event.currentTarget.value)}
                    />
                    {edited ? <span className="mt-1 block text-xs text-[var(--accent)]">{t("admin.editedLocally")}</span> : null}
                  </td>
                  <td className="border-b border-[var(--line)] px-4 py-4 align-top">
                    <button className="button-secondary focus-ring whitespace-nowrap" type="button" onClick={() => resetTranslation(targetLocale, key)}>
                      {t("admin.resetTranslation")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function normalizeOSSConfigForUI(config: OSSConfig): OSSConfig {
  const region = config.region || "cn-beijing";
  const endpoint = config.endpoint || `https://oss-${region}.aliyuncs.com`;
  const customEndpoint = endpoint && !endpoint.includes(".aliyuncs.com") && !endpoint.includes(".aliyun.com");
  return {
    ...config,
    region,
    endpoint: customEndpoint ? `https://oss-${region}.aliyuncs.com` : endpoint,
    publicEndpoint: config.publicEndpoint || (customEndpoint ? endpoint : "https://oss.mcmods.cn"),
    useCName: customEndpoint ? false : config.useCName,
    downloadUrlMode: config.downloadUrlMode || "esa_private_origin",
    allowedExtensions: normalizeExtensionList(config.allowedExtensions),
  };
}

function previewEndpoint(value: string, fallback: string) {
  const endpoint = value || fallback;
  return endpoint.startsWith("http://") || endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`;
}

function splitExtensionText(value: string) {
  return normalizeExtensionList(value.split(/[\s,;，；]+/));
}

function normalizeExtensionList(values: string[] | undefined) {
  const fallback = emptyConfig.oss!.allowedExtensions;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values && values.length > 0 ? values : fallback) {
    let ext = String(value ?? "").trim().toLowerCase();
    if (!ext) continue;
    if (!ext.startsWith(".")) ext = `.${ext}`;
    if (!/^\.[a-z0-9_+-]+$/.test(ext)) continue;
    if (seen.has(ext)) continue;
    seen.add(ext);
    result.push(ext);
  }
  return result.length > 0 ? result : fallback;
}

function isAllowedFileName(fileName: string, allowedExtensions: string[]) {
  const lowerName = fileName.toLowerCase();
  return normalizeExtensionList(allowedExtensions).some((ext) => lowerName.endsWith(ext));
}

function OSSConfigPanelV2({ initialConfig, token }: { initialConfig: OSSConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ ...normalizeOSSConfigForUI(initialConfig), accessKeySecret: "", securityToken: "" });
  const [message, setMessage] = useState("");
  const uploadEndpointPreview = previewEndpoint(draft.endpoint, "https://oss-cn-beijing.aliyuncs.com");
  const publicEndpointPreview = previewEndpoint(draft.publicEndpoint, "https://oss.mcmods.cn");
  const objectPrefix = (draft.prefix || "mcmods").replace(/^\/+|\/+$/g, "");

  useEffect(() => {
    let cancelled = false;
    apiRequest<OSSConfig>("/api/v1/admin/config/oss", {}, token)
      .then((config) => {
        if (!cancelled) setDraft({ ...normalizeOSSConfigForUI(config), accessKeySecret: "", securityToken: "" });
      })
      .catch((error) => {
        if (!cancelled) setMessage(cleanError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    setMessage("");
    try {
      const payload = {
        enabled: draft.enabled,
        region: draft.region,
        endpoint: draft.endpoint,
        publicEndpoint: draft.publicEndpoint,
        bucket: draft.bucket,
        accessKeyId: draft.accessKeyId,
        accessKeySecret: draft.accessKeySecret,
        securityToken: draft.securityToken,
        useCName: draft.useCName,
        prefix: draft.prefix,
        downloadUrlTtlMinutes: draft.downloadUrlTtlMinutes,
        downloadUrlMode: draft.downloadUrlMode,
        allowedExtensions: normalizeExtensionList(draft.allowedExtensions),
      };
      const saved = await apiRequest<OSSConfig>(
        "/api/v1/admin/config/oss",
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );
      setDraft({ ...normalizeOSSConfigForUI(saved), accessKeySecret: "", securityToken: "" });
      setMessage(t("admin.oss.configSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="space-y-4">
      <div className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{t("admin.oss.configTitle")}</h2>
              <span
                className={`rounded-md px-2 py-1 text-xs font-bold ${
                  draft.enabled ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-subtle)] text-[var(--muted)]"
                }`}
              >
                {draft.enabled ? t("admin.oss.enabled") : t("admin.oss.disabled")}
              </span>
              <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{t("admin.oss.connectedByPrivateBucket")}</span>
              {draft.publicEndpoint ? (
                <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{t("admin.oss.cnameMode")}</span>
              ) : null}
            </div>
            <p className="max-w-3xl text-sm text-[var(--muted)]">
              {t("admin.oss.configIntro")}
            </p>
          </div>
          <button className="button-primary focus-ring" type="button" onClick={save}>
            {t("admin.oss.saveConfig")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.uploadEndpoint")}</div>
            <div className="mt-1 truncate font-mono text-sm">{uploadEndpointPreview}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.publicEndpoint")}</div>
            <div className="mt-1 truncate font-mono text-sm">{publicEndpointPreview}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">Bucket</div>
            <div className="mt-1 truncate font-mono text-sm">{draft.bucket || t("admin.notConfigured")}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.temporaryUrl")}</div>
            <div className="mt-1 truncate text-sm font-semibold">{draft.downloadUrlMode === "oss_presigned" ? t("admin.oss.downloadModeOSSPresignedShort") : t("admin.oss.downloadModeESAPrivateOriginShort")}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface rounded-lg p-5">
          <div className="mb-4">
            <h3 className="font-bold">{t("admin.oss.connection")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.oss.connectionDesc")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 md:col-span-2">
              <input
                checked={draft.enabled}
                type="checkbox"
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>
                <span className="block font-bold">{t("admin.oss.enableOSS")}</span>
                <span className="text-sm text-[var(--muted)]">{t("admin.oss.enableOSSDesc")}</span>
              </span>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Region
              <input
                className="field"
                placeholder="cn-beijing"
                value={draft.region}
                onChange={(event) => setDraft((current) => ({ ...current, region: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Bucket
              <input
                className="field"
                placeholder="mcmods-cn"
                value={draft.bucket}
                onChange={(event) => setDraft((current) => ({ ...current, bucket: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold md:col-span-2">
              {t("admin.oss.uploadEndpoint")}
              <input
                className="field font-mono"
                placeholder="https://oss-cn-beijing.aliyuncs.com"
                value={draft.endpoint}
                onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold md:col-span-2">
              {t("admin.oss.publicEndpoint")}
              <input
                className="field font-mono"
                placeholder="https://oss.mcmods.cn"
                value={draft.publicEndpoint}
                onChange={(event) => setDraft((current) => ({ ...current, publicEndpoint: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 md:col-span-2">
              <input
                checked={draft.useCName}
                type="checkbox"
                onChange={(event) => setDraft((current) => ({ ...current, useCName: event.target.checked }))}
              />
              <span>
                <span className="block font-bold">{t("admin.oss.useCName")}</span>
                <span className="text-sm text-[var(--muted)]">{t("admin.oss.useCNameDesc")}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="surface rounded-lg p-5">
          <div className="mb-4">
            <h3 className="font-bold">{t("admin.oss.credentials")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.oss.credentialsDesc")}</p>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              AccessKey ID
              <input
                className="field font-mono"
                value={draft.accessKeyId}
                onChange={(event) => setDraft((current) => ({ ...current, accessKeyId: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              AccessKey Secret
              <input
                className="field font-mono"
                placeholder={draft.hasAccessKeySecret ? t("admin.oss.secretPlaceholderSaved") : t("admin.oss.secretPlaceholderEmpty")}
                type="password"
                value={draft.accessKeySecret}
                onChange={(event) => setDraft((current) => ({ ...current, accessKeySecret: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              SecurityToken / STS Token
              <input
                className="field font-mono"
                placeholder={draft.hasSecurityToken ? t("admin.oss.tokenPlaceholderSaved") : t("admin.oss.tokenPlaceholderEmpty")}
                type="password"
                value={draft.securityToken}
                onChange={(event) => setDraft((current) => ({ ...current, securityToken: event.target.value }))}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="surface rounded-lg p-5">
        <div className="mb-4">
          <h3 className="font-bold">{t("admin.oss.storagePolicy")}</h3>
          <p className="text-sm text-[var(--muted)]">{t("admin.oss.storagePolicyDesc")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.objectKeyPrefix")}
            <input
              className="field font-mono"
              placeholder="mcmods"
              value={draft.prefix}
              onChange={(event) => setDraft((current) => ({ ...current, prefix: event.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.downloadUrlMode")}
            <select
              className="field"
              value={draft.downloadUrlMode}
              onChange={(event) => setDraft((current) => ({ ...current, downloadUrlMode: event.target.value }))}
            >
              <option value="esa_private_origin">{t("admin.oss.downloadModeESAPrivateOrigin")}</option>
              <option value="oss_presigned">{t("admin.oss.downloadModeOSSPresigned")}</option>
            </select>
            <span className="text-xs font-normal text-[var(--muted)]">{t("admin.oss.downloadUrlModeDesc")}</span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.temporaryUrlMinutes")}
            <input
              className="field"
              min={1}
              type="number"
              value={draft.downloadUrlTtlMinutes}
              onChange={(event) => setDraft((current) => ({ ...current, downloadUrlTtlMinutes: Number(event.target.value) }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            {t("admin.oss.allowedExtensions")}
            <textarea
              className="field min-h-28 font-mono"
              value={draft.allowedExtensions.join(", ")}
              onChange={(event) => setDraft((current) => ({ ...current, allowedExtensions: splitExtensionText(event.target.value) }))}
            />
            <span className="text-xs font-normal text-[var(--muted)]">{t("admin.oss.allowedExtensionsDesc")}</span>
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm text-[var(--muted)]">
          {t("admin.oss.objectKeyExample")}
          <span className="ml-1 font-mono text-[var(--foreground)]">{objectPrefix}/projects/m123abc/description/550e8400-e29b-41d4-a716-446655440000.webp</span>
        </div>
      </div>

      {message ? <InlineMessage text={message} /> : null}
    </section>
  );
}

function OSSFilesPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<OSSFile[]>([]);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("project");
  const [source, setSource] = useState("admin");
  const [allowedExtensions, setAllowedExtensions] = useState(emptyConfig.oss!.allowedExtensions);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setFiles(await apiRequest<OSSFile[]>("/api/v1/admin/oss/files", {}, token));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void apiRequest<OSSConfig>("/api/v1/admin/config/oss", {}, token)
        .then((config) => setAllowedExtensions(normalizeExtensionList(config.allowedExtensions)))
        .catch(() => setAllowedExtensions(emptyConfig.oss!.allowedExtensions));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, token]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File)) {
      setMessage(t("admin.oss.selectFile"));
      return;
    }
    if (!isAllowedFileName(file.name, allowedExtensions)) {
      setMessage(t("admin.oss.fileTypeNotAllowed"));
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const sha256 = await computeFileSHA256(file);
      const ticket = await apiRequest<OSSDirectUploadTicket>(
        "/api/v1/admin/oss/uploads/presign",
        {
          method: "POST",
          body: JSON.stringify({
            originalName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            sha256,
            category,
            source,
            preferMultipart: true,
          }),
        },
        token,
      );
      if (ticket.uploadRequired === false) {
        setMessage(t("admin.oss.fileReused", { id: ticket.file?.id ?? ticket.objectKey }));
      } else {
        try {
          await putFileToOSS(ticket, file);
        } catch (error) {
          await abortMultipartUpload("/api/v1/admin/oss/uploads/complete", ticket, token);
          throw error;
        }
        await completeOSSUpload("/api/v1/admin/oss/uploads/complete", ticket, token);
        setMessage(t("admin.oss.uploadSuccess"));
      }
      form.reset();
      await load();
    } catch (error) {
      setMessage(cleanOSSError(error));
    } finally {
      setUploading(false);
    }
  }

  async function copyDownloadLink(objectKey: string) {
    try {
      const result = await apiRequest<{ url: string; expiresAt: string }>(
        "/api/v1/admin/oss/files/presign",
        { method: "POST", body: JSON.stringify({ objectKey }) },
        token,
      );
      await navigator.clipboard.writeText(result.url);
      setMessage(t("admin.oss.tempUrlCopied", { time: formatDateTime(result.expiresAt) }));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-lg font-bold">{t("admin.oss.filesTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("admin.oss.filesDesc")}</p>
      </div>
      <form className="mb-4 grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[1fr_160px_160px_auto]" onSubmit={upload}>
        <input className="field" accept={allowedExtensions.join(",")} name="file" required type="file" />
        <input className="field" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="category" />
        <input className="field" value={source} onChange={(event) => setSource(event.target.value)} placeholder="source" />
        <button className="button-primary focus-ring" disabled={uploading} type="submit">
          {uploading ? t("admin.oss.uploading") : t("admin.oss.uploadFile")}
        </button>
      </form>
      {message ? <InlineMessage text={message} /> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.file")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.category")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.size")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.scan")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.uploadedAt")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.operation")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.objectKey}>
                <td className="border-b border-[var(--line)] py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{file.originalName || file.objectKey}</span>
                    {file.converted ? <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t("admin.oss.convertedToWebP")}</span> : null}
                  </div>
                  {file.converted ? <div className="mt-1 text-xs text-[var(--muted)]">{t("admin.oss.sourceFile")}: {file.sourceOriginalName}</div> : null}
                  <div className="font-mono text-xs text-[var(--muted)]">ID: {file.id}</div>
                  <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">{file.objectKey}</div>
                  {file.sha256 ? <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">SHA-256: {file.sha256}</div> : null}
                </td>
                <td className="border-b border-[var(--line)] py-2">{file.category}</td>
                <td className="border-b border-[var(--line)] py-2">
                  {file.converted ? (
                    <div className="space-y-1 text-xs">
                      <div>{t("admin.oss.sourceSize")}: <strong>{formatBytes(file.sourceSizeBytes ?? file.sizeBytes)}</strong></div>
                      <div>{t("admin.oss.storedSize")}: <strong>{formatBytes(file.sizeBytes)}</strong></div>
                    </div>
                  ) : formatBytes(file.sizeBytes)}
                </td>
                <td className="border-b border-[var(--line)] py-2">{file.scanStatus}</td>
                <td className="border-b border-[var(--line)] py-2">{formatDateTime(file.createdAt)}</td>
                <td className="border-b border-[var(--line)] py-2">
                  <button className="button-secondary focus-ring" type="button" onClick={() => copyDownloadLink(file.objectKey)}>
                    {t("admin.oss.copyTempUrl")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 ? <EmptyState text={t("admin.oss.noFiles")} /> : null}
      </div>
    </section>
  );
}

function OSSRowsPanel({ token, title, endpoint }: { token: string; title: string; endpoint: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<LogRow[]>(endpoint, {}, token)
      .then(setRows)
      .catch((error) => setMessage(cleanError(error)));
  }, [endpoint, token]);
  return <RowsPanel title={title} rows={rows} message={message} />;
}

function LogsPanel({ token, title, category }: { token: string; title: string; category: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(100);
  const [showRetention, setShowRetention] = useState(false);
  const [retention, setRetention] = useState<LogRetentionConfig>({
    enabled: true,
    defaultDays: 180,
    categoryDays: {},
  });
  const displayTitle = logCategoryTitle(category, t) || title;

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      category,
      limit: String(limit),
    });
    if (query.trim()) params.set("q", query.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (level) params.set("level", level);
    if (status) params.set("status", status);
    try {
      setRows(await apiRequest<LogRow[]>(`/api/v1/admin/logs?${params.toString()}`, {}, token));
      setMessage("");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }, [category, from, level, limit, query, status, to, token]);

  const loadInitial = useCallback(async () => {
    const params = new URLSearchParams({
      category,
      limit: String(limit),
    });
    try {
      setRows(await apiRequest<LogRow[]>(`/api/v1/admin/logs?${params.toString()}`, {}, token));
      setMessage("");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }, [category, limit, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitial();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInitial]);

  useEffect(() => {
    apiRequest<LogRetentionConfig>("/api/v1/admin/logs/config", {}, token)
      .then(setRetention)
      .catch(() => undefined);
  }, [token]);

  async function saveRetention() {
    try {
      const result = await apiRequest<{ config: LogRetentionConfig; deleted: Record<string, number> }>(
        "/api/v1/admin/logs/config",
        { method: "PUT", body: JSON.stringify(retention) },
        token,
      );
      setRetention(result.config);
      const deletedCount = Object.values(result.deleted ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
      setMessage(t("admin.logs.policySaved", { count: deletedCount }));
      await load();
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{displayTitle}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.logs.titleDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary focus-ring" type="button" onClick={() => setShowRetention((current) => !current)}>
            {t("admin.logs.cleanupPolicy")}
          </button>
          <button className="button-primary focus-ring" type="button" onClick={load}>
            {t("admin.logs.query")}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_repeat(5,minmax(120px,0.6fr))]">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.logs.searchPlaceholder")} />
        <input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className="field" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">{t("admin.logs.allLevels")}</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input className="field" value={status} onChange={(event) => setStatus(event.target.value)} placeholder={t("admin.logs.status")} />
        <input className="field" min={1} max={500} type="number" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
      </div>

      {showRetention ? (
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">{t("admin.logs.rollingCleanup")}</h3>
              <p className="text-sm text-[var(--muted)]">{t("admin.logs.rollingCleanupDesc")}</p>
            </div>
            <button className="button-primary focus-ring" type="button" onClick={saveRetention}>
              {t("admin.logs.saveCleanupPolicy")}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
              <input
                checked={retention.enabled}
                type="checkbox"
                onChange={(event) => setRetention((current) => ({ ...current, enabled: event.target.checked }))}
              />
              {t("admin.logs.enableRollingCleanup")}
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {t("admin.logs.defaultRetentionDays")}
              <input
                className="field"
                min={1}
                max={3650}
                type="number"
                value={retention.defaultDays}
                onChange={(event) => setRetention((current) => ({ ...current, defaultDays: Number(event.target.value) }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {t("admin.logs.categoryRetentionDays")}
              <input
                className="field"
                min={1}
                max={3650}
                type="number"
                value={retention.categoryDays?.[category] ?? retention.defaultDays}
                onChange={(event) =>
                  setRetention((current) => ({
                    ...current,
                    categoryDays: { ...(current.categoryDays ?? {}), [category]: Number(event.target.value) },
                  }))
                }
              />
            </label>
          </div>
        </div>
      ) : null}

      <RowsPanel title={displayTitle} rows={rows} message={message} />
    </section>
  );
}

function RowsPanel({ title, rows, message }: { title: string; rows: LogRow[]; message?: string }) {
  const { t } = useI18n();
  const keys = useMemo(() => orderedLogKeys(rows).slice(0, 12), [rows]);
  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
          <span className="text-sm text-[var(--muted)]">{t("admin.logs.records", { count: rows.length })}</span>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="max-h-[calc(100vh-14rem)] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
            <tr>{keys.map((key) => <th key={key} className="border-b border-[var(--line)] px-3 py-2">{key}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {keys.map((key) => (
                  <td key={key} className="max-w-xs truncate border-b border-[var(--line)] px-3 py-2">
                    {displayCell(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : null}
      </div>
    </section>
  );
}

function orderedLogKeys(rows: LogRow[]) {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const preferred = [
    "id",
    "actor_username",
    "operator_username",
    "target_username",
    "username",
    "uploader_username",
    "actor_id",
    "operator_id",
    "target_user_id",
    "user_id",
    "uploader_id",
    "category",
    "level",
    "action",
    "method",
    "path",
    "status",
    "success",
    "result",
    "ip",
    "created_at",
  ];
  return [...preferred.filter((key) => allKeys.includes(key)), ...allKeys.filter((key) => !preferred.includes(key))];
}

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
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">
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

function panelTitleV2(panel: PanelId, t: (key: string, params?: Record<string, string | number>) => string) {
  const titles: Record<PanelId, string> = {
    overview: t("admin.overview"),
    "general-settings": t("admin.generalSettings.title"),
    yggdrasil: t("admin.yggdrasil.title"),
    roles: t("admin.roles"),
    "user-roles": t("admin.userRoles"),
    "permission-list": t("admin.permissionList"),
    "role-tracks": t("admin.roleTracks.title"),
    "permission-settings": t("admin.permissionSettings.title"),
    "creator-claims": t("admin.community.creatorClaims"),
    "activity-monitor": t("admin.community.activity"),
    "economy-config": t("admin.community.economyConfig"),
    currencies: t("admin.community.currencies"),
    "shop-items": t("admin.community.shopItems"),
    "level-config": t("admin.community.levelConfig"),
    tasks: t("admin.community.tasks"),
    users: t("admin.userList"),
    "reviews-content": t("admin.reviews.contentTitle"),
    "reviews-editor": t("admin.reviews.editorTitle"),
    "reviews-server": t("admin.serverReviews.title"),
    "reviews-comments": t("admin.reviews.commentReportsTitle"),
    "review-settings": t("admin.reviewSettings.title"),
    "server-settings": t("admin.serverSettings.title"),
    notifications: t("admin.notifications.title"),
    "notification-templates": t("admin.notificationTemplates.title"),
    mail: t("admin.mail"),
    auth: t("admin.auth"),
    markdown: t("admin.markdown.navTitle"),
    "profile-settings": t("admin.profileSettings.navTitle"),
    "minecraft-versions": t("admin.minecraftVersions.title"),
    "resource-attributes": t("admin.resourceAttributes.title"),
    "mod-import-settings": t("admin.modImport.navTitle"),
    "unresolved-references": t("admin.unresolved.title"),
    nats: t("admin.nats.navTitle"),
    i18n: t("admin.i18n"),
    "oss-config": t("admin.panels.ossConfig"),
    "oss-files": t("admin.panels.ossFiles"),
    "oss-uploads": t("admin.panels.ossUploads"),
    "oss-scans": t("admin.panels.ossScans"),
    "oss-downloads": t("admin.panels.ossDownloads"),
    "logs-system": t("admin.panels.logsSystem"),
    "logs-user": t("admin.panels.logsUser"),
    "logs-admin": t("admin.panels.logsAdmin"),
    "logs-permission": t("admin.panels.logsPermission"),
    "logs-login": t("admin.panels.logsLogin"),
    "logs-api": t("admin.panels.logsApi"),
    "logs-file-upload": t("admin.panels.logsFileUpload"),
    "logs-ai": t("admin.panels.logsAi"),
    "ai-providers": t("admin.panels.aiProviders"),
    "ai-models": t("admin.panels.aiModels"),
    "ai-task-models": t("admin.panels.aiTaskModels"),
    "ai-costs": t("admin.panels.aiCosts"),
    "ai-task-logs": t("admin.panels.aiTaskLogs"),
  };
  return titles[panel];
}

function adminNavGroupLabel(groupId: string, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const labels: Record<string, string> = {
    workbench: t("admin.workbench"),
    content: t("admin.modImport.group"),
    reviews: t("admin.reviews.group"),
    permission: t("admin.permission"),
    economy: t("admin.community.nav.economy"),
    progression: t("admin.community.nav.progression"),
    monitoring: t("admin.community.nav.monitoring"),
    oss: t("admin.nav.oss"),
    logs: t("admin.nav.logs"),
    ai: t("admin.nav.ai"),
    infrastructure: t("admin.nats.infrastructure"),
    notifications: t("admin.notifications.group"),
    users: t("admin.users"),
    system: t("admin.system"),
  };
  return labels[groupId] ?? fallback;
}

function adminNavItemDescription(panel: PanelId, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const descriptions: Partial<Record<PanelId, string>> = {
    overview: t("admin.overviewDesc"),
    "general-settings": t("admin.generalSettings.description"),
    yggdrasil: t("admin.yggdrasil.navDescription"),
    roles: t("admin.rolesDesc"),
    "user-roles": t("admin.userRolesDesc"),
    "permission-list": t("admin.permissionListDesc"),
    "role-tracks": t("admin.roleTracks.navDescription"),
    "permission-settings": t("admin.permissionSettings.navDescription"),
    "creator-claims": t("admin.community.creatorClaimsDescription"),
    "activity-monitor": t("admin.community.activityDescription"),
    "economy-config": t("admin.community.economyConfigDescription"),
    currencies: t("admin.community.currenciesDescription"),
    "shop-items": t("admin.community.shopItemsDescription"),
    "level-config": t("admin.community.levelConfigDescription"),
    tasks: t("admin.community.tasksDescription"),
    users: t("admin.usersDesc"),
    "reviews-content": t("admin.reviews.contentDescription"),
    "reviews-editor": t("admin.reviews.editorDescription"),
    "reviews-server": t("admin.serverReviews.navDescription"),
    "reviews-comments": t("admin.reviews.commentReportsDescription"),
    "review-settings": t("admin.reviewSettings.navDescription"),
    "server-settings": t("admin.serverSettings.navDescription"),
    notifications: t("admin.notifications.navDescription"),
    "notification-templates": t("admin.notificationTemplates.navDescription"),
    mail: t("admin.mailDesc"),
    auth: t("admin.authDesc"),
    markdown: t("admin.markdown.navDesc"),
    "profile-settings": t("admin.profileSettings.navDescription"),
    "minecraft-versions": t("admin.minecraftVersions.description"),
    "resource-attributes": t("admin.resourceAttributes.navDescription"),
    "mod-import-settings": t("admin.modImport.navDescription"),
    "unresolved-references": t("admin.unresolved.navDescription"),
    nats: t("admin.nats.navDescription"),
    i18n: t("admin.i18nDesc"),
    "oss-config": t("admin.nav.ossConfigDesc"),
    "oss-files": t("admin.nav.ossFilesDesc"),
    "oss-uploads": t("admin.nav.ossUploadsDesc"),
    "oss-scans": t("admin.nav.ossScansDesc"),
    "oss-downloads": t("admin.nav.ossDownloadsDesc"),
    "logs-system": t("admin.nav.logsSystemDesc"),
    "logs-user": t("admin.nav.logsUserDesc"),
    "logs-admin": t("admin.nav.logsAdminDesc"),
    "logs-permission": t("admin.nav.logsPermissionDesc"),
    "logs-login": t("admin.nav.logsLoginDesc"),
    "logs-api": t("admin.nav.logsApiDesc"),
    "logs-file-upload": t("admin.nav.logsFileDesc"),
    "logs-ai": t("admin.nav.logsAiDesc"),
    "ai-providers": t("admin.nav.aiProvidersDesc"),
    "ai-models": t("admin.nav.aiModelsDesc"),
    "ai-task-models": t("admin.nav.aiTaskModelsDesc"),
    "ai-costs": t("admin.nav.aiCostsDesc"),
    "ai-task-logs": t("admin.nav.aiTaskLogsDesc"),
  };
  return descriptions[panel] ?? fallback;
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
    user_interaction: t("admin.panels.logsUser"),
    admin_operation: t("admin.panels.logsAdmin"),
    permission_change: t("admin.panels.logsPermission"),
    login_security: t("admin.panels.logsLogin"),
    api_access: t("admin.panels.logsApi"),
    file_upload: t("admin.panels.logsFileUpload"),
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







