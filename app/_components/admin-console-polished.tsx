"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { canAccessAdmin, clearAuth } from "../_lib/auth";
import { API_BASE_URL, ApiError, apiRequest } from "../_lib/api";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";

type PanelId =
  | "overview"
  | "roles"
  | "user-roles"
  | "permission-list"
  | "users"
  | "mail"
  | "auth"
  | "i18n"
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
  | "logs-ai";

type User = {
  id: number;
  username: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  permissions: string[];
  createdAt?: string;
};

type DashboardData = {
  cards: Array<{ label: string; value: number; tone: string }>;
  todo: string[];
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
  auth: Record<string, string | number | boolean | string[]>;
  oauth: OAuthConfig;
  mail: MailConfig;
  oss?: OSSConfig;
  permissions: Record<string, string | number | boolean>;
  database: Record<string, string>;
  features: Record<string, boolean>;
};

type OSSConfig = {
  enabled: boolean;
  region: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  hasAccessKeySecret: boolean;
  useCName: boolean;
  prefix: string;
  downloadUrlTtlMinutes: number;
  bucketAccessPolicy?: string;
  temporaryDownloadPolicy?: string;
};

type OSSFile = {
  id: number;
  bucket: string;
  objectKey: string;
  category: string;
  source: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
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
  effectivePermissions: string[];
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
    id: "permission",
    label: "",
    items: [
      { id: "roles", label: "", description: "" },
      { id: "user-roles", label: "", description: "" },
      { id: "permission-list", label: "", description: "" },
    ],
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
    id: "users",
    label: "",
    items: [{ id: "users", label: "", description: "" }],
  },
  {
    id: "system",
    label: "",
    items: [
      { id: "mail", label: "", description: "" },
      { id: "auth", label: "", description: "" },
      { id: "i18n", label: "", description: "" },
    ],
  },
];

const emptyDashboard: DashboardData = { cards: [], todo: [] };

const emptyConfig: AdminConfig = {
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
  oss: {
    enabled: false,
    region: "",
    endpoint: "",
    bucket: "",
    accessKeyId: "",
    hasAccessKeySecret: false,
    useCName: true,
    prefix: "mcmods",
    downloadUrlTtlMinutes: 10,
    bucketAccessPolicy: "private-read-write",
    temporaryDownloadPolicy: "presigned-url",
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
  },
};

const emptyCatalog: PermissionCatalog = { roles: [], permissions: [] };

export function AdminConsolePolished() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { t } = useI18n();
  const auth = useStoredAuth();
  const [activePanel, setActivePanel] = useState<PanelId>("roles");
  const [expanded, setExpanded] = useState(["workbench", "permission", "oss", "logs", "system"]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [config, setConfig] = useState(emptyConfig);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState(t("admin.backendDisconnected"));
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [reconnectIn, setReconnectIn] = useState(0);
  const [permissionDialog, setPermissionDialog] = useState("");
  const authReady = auth.snapshot !== "";
  const allowed = canAccessAdmin(auth.user);

  useEffect(() => {
    function handlePermissionDenied(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const message = typeof detail?.message === "string" ? detail.message : "";
      setPermissionDialog(message || t("admin.permissionDeniedBody"));
    }
    window.addEventListener("mcmods-permission-denied", handlePermissionDenied);
    return () => window.removeEventListener("mcmods-permission-denied", handlePermissionDenied);
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
          apiRequest<DashboardData>("/api/v1/admin/dashboard", {}, auth.token),
          apiRequest<AdminConfig>("/api/v1/admin/config", {}, auth.token),
          apiRequest<PermissionCatalog>("/api/v1/admin/permissions", {}, auth.token),
          apiRequest<User[]>("/api/v1/admin/users", {}, auth.token),
        ]);
        if (!cancelled) {
          setDashboard(dashboardData);
          setConfig(configData);
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
          setStatus(cleanError(error));
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
  }, [allowed, auth.token, authReady, router]);

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

  if (!authReady || !auth.token) {
    return <AdminGateMessage text={t("admin.checkingAuth")} />;
  }

  if (!allowed) {
    return <AdminGateMessage text={t("admin.noPermissionReturning")} />;
  }

  if (backendAvailable === false) {
    return (
      <AdminGateMessage
        text={t("admin.backendLockedRetry", {
          reason: status,
          retry: reconnectIn > 0 ? t("admin.retrySeconds", { seconds: reconnectIn }) : t("admin.reconnecting"),
        })}
      />
    );
  }

  if (backendAvailable === null) {
    return <AdminGateMessage text={t("admin.connecting")} />;
  }

  const displayStatus = status;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[292px_1fr]">
        <aside className="border-r border-[var(--line)] bg-[var(--panel)]">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-[var(--line)] p-4">
              <Link className="flex items-center gap-3" href="/">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">M</span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--muted)]">Mcmods-cn</span>
                  <span className="block text-xl font-bold">{t("admin.title")}</span>
                </span>
              </Link>
              <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm text-[var(--muted)]">
                {displayStatus}
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              {adminNavGroups.map((group) => {
                const open = expanded.includes(group.id);
                return (
                  <section key={group.id} className="mb-2">
                    <button
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
                            className={`focus-ring rounded-lg px-3 py-2 text-left ${
                              activePanel === item.id
                                ? "bg-[var(--accent)] text-white"
                                : "text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
                            }`}
                            type="button"
                            onClick={() => setActivePanel(item.id)}
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

            <div className="border-t border-[var(--line)] p-3">
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
                {auth.user.displayName || auth.user.username} / {auth.user.roles.join(", ") || t("admin.ungrouped")}
              </div>
            ) : null}
          </div>

          {activePanel === "overview" ? <OverviewPanel dashboard={dashboard} config={config} /> : null}
          {activePanel === "roles" ? (
            <PermissionGroupEditor catalog={catalog} token={auth.token} refreshCatalog={refreshCatalog} />
          ) : null}
          {activePanel === "user-roles" ? (
            <UserRolePanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "permission-list" ? (
            <PermissionCatalogEditor
              key={catalog.permissions.map((permission) => permission.code).join("|")}
              catalog={catalog}
              token={auth.token}
              refreshCatalog={refreshCatalog}
            />
          ) : null}
          {activePanel === "users" ? (
            <UsersPanelV2 catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "mail" ? <MailPanelV2 config={config} token={auth.token} /> : null}
          {activePanel === "auth" ? <AuthPanelV2 config={config} token={auth.token} /> : null}
          {activePanel === "i18n" ? <TranslationManagerPanel /> : null}
          {activePanel === "oss-config" ? <OSSConfigPanelV2 initialConfig={config.oss ?? emptyConfig.oss!} token={auth.token} /> : null}
          {activePanel === "oss-files" ? <OSSFilesPanel token={auth.token} /> : null}
          {activePanel === "oss-uploads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-uploads", t)} endpoint="/api/v1/admin/oss/uploads" /> : null}
          {activePanel === "oss-scans" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-scans", t)} endpoint="/api/v1/admin/oss/scans" /> : null}
          {activePanel === "oss-downloads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-downloads", t)} endpoint="/api/v1/admin/oss/downloads" /> : null}
          {activePanel === "logs-system" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-system", t)} category="system" /> : null}
          {activePanel === "logs-user" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-user", t)} category="user_interaction" /> : null}
          {activePanel === "logs-admin" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-admin", t)} category="admin_operation" /> : null}
          {activePanel === "logs-permission" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-permission", t)} category="permission_change" /> : null}
          {activePanel === "logs-login" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-login", t)} category="login_security" /> : null}
          {activePanel === "logs-api" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-api", t)} category="api_access" /> : null}
          {activePanel === "logs-file-upload" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-file-upload", t)} category="file_upload" /> : null}
          {activePanel === "logs-ai" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-ai", t)} category="ai_call" /> : null}
        </section>
      </div>
      <PermissionDeniedDialog message={permissionDialog} onClose={() => setPermissionDialog("")} />
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
    return <EmptyState text={t("admin.noRoles")} />;
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
                    <tr key={`${permission.code}:${permission.index}`} className="hover:bg-[var(--panel-subtle)]">
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
                <tr key={`${entry.code}:${entry.index}`} className="hover:bg-[var(--panel-subtle)]">
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
  const { locale, t } = useI18n();
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
  const [draft, setDraft] = useState<Permission[]>(() => catalog.permissions.map((permission) => ({ ...permission })));
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const visible = draft.filter((permission) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    const text = localizedText(permission, locale);
    return `${permission.code} ${permission.module} ${permission.name} ${permission.description} ${text.name} ${text.description}`
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

  return (
    <section className="surface flex min-h-[calc(100vh-8rem)] flex-col rounded-lg p-4">
      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t("admin.permissionList")}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.permissionListI18nDesc")}</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto] sm:items-center xl:min-w-[760px]">
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
              <span className="block font-semibold text-[var(--foreground)]">{localizedText(permission, sourceLocale).name}</span>
              <span className="mt-1 block">{localizedText(permission, sourceLocale).description}</span>
            </div>
            <input
              key={`${targetLocale}:${permission.code}:name`}
              className="field px-3 py-2"
              value={ownLocalizedText(permission, targetLocale).name}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { name: event.target.value }),
                })
              }
            />
            <input
              key={`${targetLocale}:${permission.code}:description`}
              className="field px-3 py-2"
              value={ownLocalizedText(permission, targetLocale).description}
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
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
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
      ...(selectedUser?.roles ?? []),
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
              <span className="block font-bold">{user.displayName || user.username}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">#{user.id} / {user.username}</span>
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
              {t("admin.effectivePermissions", { count: details.effectivePermissions.length })}
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
function OverviewPanel({ dashboard, config }: { dashboard: DashboardData; config: AdminConfig }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.cards.map((card) => (
          <div key={card.label} className="surface rounded-lg p-4">
            <p className="text-sm font-semibold text-[var(--muted)]">{card.label}</p>
            <p className={`mt-3 text-3xl font-bold ${toneClass(card.tone)}`}>{card.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigBlock title={t("admin.featureFlags")}>
          {Object.entries(config.features).map(([key, enabled]) => (
            <ConfigLine key={key} label={featureLabel(key)} value={enabled ? t("common.enabled") : t("common.disabled")} />
          ))}
        </ConfigBlock>
        <ConfigBlock title={t("admin.recentTasks")}>
          {dashboard.todo.map((item) => (
            <div key={item} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </ConfigBlock>
      </div>
    </div>
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
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
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
      displayName: String(form.get("displayName") ?? "").trim(),
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
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_1fr]">
          <label className="text-sm font-semibold">
            {t("admin.displayName")}
            <input className="field mt-2" name="displayName" />
          </label>
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
      {users.length === 0 ? (
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
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="border-b border-[var(--line)] py-3">{user.id}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.displayName || user.username}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.email}</td>
                  <td className="border-b border-[var(--line)] py-3">{formatDateTime(user.createdAt)}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.status}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.roles.join(", ") || "member"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}

function TranslationManagerPanel() {
  const {
    locale,
    t,
    translationKeys,
    getTranslation,
    getBaseTranslation,
    getOwnTranslation,
    setTranslation,
    resetTranslation,
  } = useI18n();
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  const visibleKeys = translationKeys.filter((key) => {
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
        </div>
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--line)] px-4 py-3">{t("admin.translationKey")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3">{t("admin.sourceText")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3">{t("admin.targetText")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3">{t("common.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleKeys.map((key) => {
              const baseTarget = getBaseTranslation(targetLocale, key);
              const target = getOwnTranslation(targetLocale, key);
              const edited = target !== "" && target !== baseTarget;
              return (
                <tr key={key}>
                  <td className="border-b border-[var(--line)] px-4 py-3 font-mono text-xs">{key}</td>
                  <td className="border-b border-[var(--line)] px-4 py-3">{getTranslation(sourceLocale, key)}</td>
                  <td className="border-b border-[var(--line)] px-4 py-3">
                    <textarea
                      key={`${targetLocale}:${key}`}
                      className="field min-h-20"
                      defaultValue={target}
                      placeholder={target ? "" : t("admin.missingTranslation")}
                      onBlur={(event) => saveTranslation(key, event.currentTarget.value)}
                    />
                    {edited ? <span className="mt-1 block text-xs text-[var(--accent)]">{t("admin.editedLocally")}</span> : null}
                  </td>
                  <td className="border-b border-[var(--line)] px-4 py-3">
                    <button className="button-secondary focus-ring" type="button" onClick={() => resetTranslation(targetLocale, key)}>
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

function OSSConfigPanelV2({ initialConfig, token }: { initialConfig: OSSConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ ...initialConfig, accessKeySecret: "" });
  const [message, setMessage] = useState("");
  const endpointPreview = draft.endpoint
    ? draft.endpoint.startsWith("http://") || draft.endpoint.startsWith("https://")
      ? draft.endpoint
      : `https://${draft.endpoint}`
    : "https://oss.mcmods.cn";
  const objectPrefix = (draft.prefix || "mcmods").replace(/^\/+|\/+$/g, "");

  useEffect(() => {
    let cancelled = false;
    apiRequest<OSSConfig>("/api/v1/admin/config/oss", {}, token)
      .then((config) => {
        if (!cancelled) setDraft({ ...config, accessKeySecret: "" });
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
        bucket: draft.bucket,
        accessKeyId: draft.accessKeyId,
        accessKeySecret: draft.accessKeySecret,
        useCName: draft.useCName,
        prefix: draft.prefix,
        downloadUrlTtlMinutes: draft.downloadUrlTtlMinutes,
      };
      const saved = await apiRequest<OSSConfig>(
        "/api/v1/admin/config/oss",
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );
      setDraft({ ...saved, accessKeySecret: "" });
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
              {draft.useCName ? (
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.accessDomain")}</div>
            <div className="mt-1 truncate font-mono text-sm">{endpointPreview}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">Bucket</div>
            <div className="mt-1 truncate font-mono text-sm">{draft.bucket || t("admin.notConfigured")}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.temporaryUrl")}</div>
            <div className="mt-1 font-mono text-sm">{draft.downloadUrlTtlMinutes || 10} min</div>
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
              Endpoint / {t("admin.customDomain")}
              <input
                className="field font-mono"
                placeholder="oss.mcmods.cn"
                value={draft.endpoint}
                onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
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
            {t("admin.oss.temporaryUrlMinutes")}
            <input
              className="field"
              min={1}
              type="number"
              value={draft.downloadUrlTtlMinutes}
              onChange={(event) => setDraft((current) => ({ ...current, downloadUrlTtlMinutes: Number(event.target.value) }))}
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm text-[var(--muted)]">
          {t("admin.oss.objectKeyExample")}
          <span className="ml-1 font-mono text-[var(--foreground)]">{objectPrefix}/project/2026/07/07/a1b2c3d4-image.png</span>
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
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      setFiles(await apiRequest<OSSFile[]>("/api/v1/admin/oss/files", {}, token));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("category", category);
    data.set("source", source);
    setUploading(true);
    setMessage("");
    try {
      await apiUpload("/api/v1/admin/oss/upload", data, token);
      form.reset();
      setMessage(t("admin.oss.uploadSuccess"));
      await load();
    } catch (error) {
      setMessage(cleanError(error));
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
        <input className="field" name="file" required type="file" />
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
                  <div className="font-semibold">{file.originalName || file.objectKey}</div>
                  <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">{file.objectKey}</div>
                </td>
                <td className="border-b border-[var(--line)] py-2">{file.category}</td>
                <td className="border-b border-[var(--line)] py-2">{formatBytes(file.sizeBytes)}</td>
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

  async function load() {
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
  }

  useEffect(() => {
    void load();
  }, [category, token]);

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
    "actor_display_name",
    "operator_display_name",
    "target_display_name",
    "display_name",
    "uploader_display_name",
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
  const source = localizedText(value, sourceLocale);
  const target = ownLocalizedText(value, targetLocale);

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
  return <div className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]">{text}</div>;
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

function PermissionDeniedDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useI18n();

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4" role="alertdialog" aria-modal="true">
      <div className="surface w-full max-w-md rounded-lg p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-100 text-2xl font-black text-red-700">
          !
        </div>
        <h2 className="text-xl font-bold">{t("admin.permissionDeniedTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
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
    roles: t("admin.roles"),
    "user-roles": t("admin.userRoles"),
    "permission-list": t("admin.permissionList"),
    users: t("admin.userList"),
    mail: t("admin.mail"),
    auth: t("admin.auth"),
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
  };
  return titles[panel];
}

function adminNavGroupLabel(groupId: string, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const labels: Record<string, string> = {
    workbench: t("admin.workbench"),
    permission: t("admin.permission"),
    oss: t("admin.nav.oss"),
    logs: t("admin.nav.logs"),
    users: t("admin.users"),
    system: t("admin.system"),
  };
  return labels[groupId] ?? fallback;
}

function adminNavItemDescription(panel: PanelId, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const descriptions: Partial<Record<PanelId, string>> = {
    overview: t("admin.overviewDesc"),
    roles: t("admin.rolesDesc"),
    "user-roles": t("admin.userRolesDesc"),
    "permission-list": t("admin.permissionListDesc"),
    users: t("admin.usersDesc"),
    mail: t("admin.mailDesc"),
    auth: t("admin.authDesc"),
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
  };
  return descriptions[panel] ?? fallback;
}

function toneClass(tone: string) {
  const tones: Record<string, string> = {
    green: "text-[var(--accent)]",
    blue: "text-[var(--blue)]",
    violet: "text-[var(--violet)]",
    red: "text-[var(--red)]",
    warning: "text-[var(--warning)]",
  };
  return tones[tone] ?? "text-[var(--foreground)]";
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

function formatBytes(value?: number) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
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

async function apiUpload(path: string, form: FormData, token: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  const envelope = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string };
  if (!response.ok) {
    throw new ApiError(envelope.error ?? "Request failed", response.status);
  }
  return envelope.data;
}

function featureLabel(key: string) {
  const labels: Record<string, string> = {
    contentReview: "contentReview",
    emailSystem: "emailSystem",
    permissionRBAC: "permissionRBAC",
    oss: "oss",
    redis: "redis",
    crawler: "crawler",
    ai: "ai",
  };
  return labels[key] ?? key;
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

function ownLocalizedText(value: { name?: string; description?: string; translations?: LocalizedTexts }, locale: Locale) {
  const localized = normalizeEntityTranslations({
    name: value.name ?? "",
    description: value.description ?? "",
    translations: value.translations,
  })[locale];
  return {
    name: localized?.name ?? "",
    description: localized?.description ?? "",
  };
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
  if (translations.en) return "en";
  const first = Object.keys(translations).find((key): key is Locale =>
    supportedLocales.some((locale) => locale.code === key),
  );
  return first ?? "en";
}

function withFallbackLocalizedText<T extends { name: string; description: string; translations?: LocalizedTexts }>(value: T): T {
  const translations = normalizeEntityTranslations(value);
  const fallback = translations["zh-CN"] ?? translations.en ?? Object.values(translations)[0];
  return {
    ...value,
    name: value.name.trim() || fallback?.name || "Unnamed",
    description: value.description.trim() || fallback?.description || "",
    translations,
  };
}

function buildNewPermissionPayload(code: string, nameInput: string, descriptionInput: string, preferredLocale: Locale) {
  const name = nameInput.trim() || code;
  const description = descriptionInput.trim() || newPermissionDescription(preferredLocale);
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
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u3400-\u9fff]/.test(text)) return "zh-CN";
  return preferredLocale || "en";
}

function newPermissionDescription(locale: Locale) {
  return "New permission";
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
        .split(/[\s,;锛岋紱]+/)
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
  const keyword = input.split(/[\s,;锛岋紱]+/).at(-1)?.trim().toLowerCase() ?? "";
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
    return "Backend is unavailable or the request failed";
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

function useStoredAuth() {
  const snapshot = useSyncExternalStore(subscribeAuth, readStoredAuthText, () => "");
  return useMemo(() => parseStoredAuth(snapshot), [snapshot]);
}

function subscribeAuth(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("mcmods-auth-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("mcmods-auth-change", onStoreChange);
  };
}

function readStoredAuthText() {
  const token =
    window.localStorage.getItem("mcmods-token") ??
    window.localStorage.getItem("mcmods-admin-token") ??
    "";
  const savedUser =
    window.localStorage.getItem("mcmods-user") ??
    window.localStorage.getItem("mcmods-admin-user") ??
    "";
  return JSON.stringify({ token, savedUser });
}

function parseStoredAuth(snapshot: string): { snapshot: string; token: string; user: User | null } {
  if (!snapshot) {
    return { snapshot: "", token: "", user: null };
  }
  try {
    const parsed = JSON.parse(snapshot) as { token: string; savedUser: string };
    return {
      snapshot,
      token: parsed.token,
      user: parsed.savedUser ? (JSON.parse(parsed.savedUser) as User) : null,
    };
  } catch {
    return { snapshot, token: "", user: null };
  }
}







