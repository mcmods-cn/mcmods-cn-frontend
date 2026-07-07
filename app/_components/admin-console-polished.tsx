"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { canAccessAdmin, clearAuth } from "../_lib/auth";
import { ApiError, apiRequest } from "../_lib/api";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";

type PanelId = "overview" | "roles" | "user-roles" | "permission-list" | "users" | "mail" | "auth" | "i18n";

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
  permissions: Record<string, string | number | boolean>;
  database: Record<string, string>;
  features: Record<string, boolean>;
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

const navGroups = [
  {
    id: "workbench",
    label: "工作台",
    items: [{ id: "overview" as const, label: "总览", description: "运行状态与功能开关" }],
  },
  {
    id: "permission",
    label: "权限",
    items: [
      { id: "roles" as const, label: "权限组编辑器", description: "新增、修改、绑定权限节点" },
      { id: "user-roles" as const, label: "用户权限组", description: "为用户分配权限组" },
      { id: "permission-list" as const, label: "权限列表", description: "维护权限名称与说明" },
    ],
  },
  {
    id: "users",
    label: "用户",
    items: [{ id: "users" as const, label: "用户列表", description: "账号、状态与角色" }],
  },
  {
    id: "system",
    label: "系统",
    items: [
      { id: "mail" as const, label: "邮件系统", description: "SMTP 配置与测试发送" },
      { id: "auth" as const, label: "登录配置", description: "登录方式与账号安全" },
    ],
  },
  {
    id: "language",
    label: "多语言",
    items: [{ id: "i18n" as const, label: "多语言管理", description: "对照两种语言并修改翻译" }],
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
  },
};

const emptyCatalog: PermissionCatalog = { roles: [], permissions: [] };

export function AdminConsolePolished() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const auth = useStoredAuth();
  const [activePanel, setActivePanel] = useState<PanelId>("roles");
  const [expanded, setExpanded] = useState(["workbench", "permission", "system", "language"]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [config, setConfig] = useState(emptyConfig);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("后端未连接");
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [reconnectIn, setReconnectIn] = useState(0);
  const authReady = auth.snapshot !== "";
  const allowed = canAccessAdmin(auth.user);

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
        setStatus(attempt === 0 ? "正在连接后端服务" : "正在尝试重新连接后端");
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
          setStatus("已连接后端");
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
    return <AdminGateMessage text="正在检查登录状态" />;
  }

  if (!allowed) {
    return <AdminGateMessage text="当前账号没有后台权限，正在返回首页" />;
  }

  if (backendAvailable === false) {
    return (
      <AdminGateMessage
        text={`后端未连接，后台暂不可访问：${status}。${reconnectIn > 0 ? `${reconnectIn} 秒后自动重试` : "正在重新连接"}`}
      />
    );
  }

  if (backendAvailable === null) {
    return <AdminGateMessage text="正在连接后端服务" />;
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
                  <span className="block text-xl font-bold">后台管理</span>
                </span>
              </Link>
              <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm text-[var(--muted)]">
                {displayStatus}
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              {navGroups.map((group) => {
                const open = expanded.includes(group.id);
                return (
                  <section key={group.id} className="mb-2">
                    <button
                      className="focus-ring flex w-full items-center justify-between rounded-lg px-3 py-3 text-left font-bold hover:bg-[var(--panel-subtle)]"
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                    >
                      {group.label}
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
                            <span className="block text-sm font-semibold">{item.label}</span>
                            <span className="mt-0.5 block text-xs opacity-80">{item.description}</span>
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
                切换主题
              </button>
              {auth.user ? (
                <button className="button-secondary focus-ring mt-2 w-full" type="button" onClick={logout}>
                  退出登录
                </button>
              ) : (
                <Link className="button-primary focus-ring mt-2 block w-full text-center" href="/login?next=/admin">
                  登录后台
                </Link>
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 md:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--accent)]">Admin Console</p>
              <h1 className="text-2xl font-bold">{panelTitle(activePanel)}</h1>
            </div>
            {auth.user ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
                {auth.user.displayName || auth.user.username} / {auth.user.roles.join(", ") || "未分组"}
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
            <UsersPanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {activePanel === "mail" ? <MailPanel config={config} token={auth.token} /> : null}
          {activePanel === "auth" ? <AuthPanel config={config} token={auth.token} /> : null}
          {activePanel === "i18n" ? <TranslationManagerPanel /> : null}
        </section>
      </div>
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
  const { locale } = useI18n();
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
      setMessage("请先登录拥有权限管理权限的账号");
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
      setMessage("权限组已保存");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function deleteRole() {
    if (!currentDraft || !selectedCode || !token) {
      setMessage("请先选择一个已有权限组");
      return;
    }
    if (!window.confirm(`确认删除权限组 ${currentDraft.code}？用户与该组的绑定也会被移除。`)) return;
    try {
      await apiRequest<{ ok: boolean }>(
        `/api/v1/admin/roles/${encodeURIComponent(currentDraft.code)}`,
        { method: "DELETE" },
        token,
      );
      await refreshCatalog();
      setSelectedCode("");
      setDraft({ code: "", name: "", description: "", translations: {}, weight: 0, parents: [], permissions: [], permissionEntries: [] });
      setMessage("权限组已删除");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function addPermissionEntriesFromInput() {
    if (!currentDraft || !token) {
      setMessage("请先选择权限组并登录拥有权限管理权限的账号");
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput);
    if (codes.length === 0) {
      setMessage("请先输入要添加的权限");
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
              body: JSON.stringify({
                code,
                module: permissionModule(code),
                name: bulkPermissionName.trim() || code,
                description: bulkPermissionDescription.trim() || "新建权限",
              }),
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
      setMessage("权限已添加");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  if (!currentDraft) {
    return <EmptyState text="暂无权限组。可以先启动后端，或新增一个权限组。" />;
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
      name: localizedMeta?.name ?? "自定义权限",
      description: localizedMeta?.description ?? "手动输入的权限节点",
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
            <h2 className="text-lg font-bold">权限组</h2>
            <p className="text-sm text-[var(--muted)]">{catalog.roles.length} 个权限组</p>
          </div>
          <button className="button-secondary focus-ring px-3 py-2" type="button" onClick={startCreateRole}>
            新增
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
                <div className="field text-xl font-bold">{localizedText(currentDraft, locale).name || "未命名权限组"}</div>
                <span className="break-all font-mono text-xl font-bold text-[var(--muted)]">({currentDraft.code || "new_group"})</span>
              </div>
              <div className="mt-3 grid gap-3 text-sm font-semibold md:grid-cols-[140px_minmax(220px,1fr)]">
                <label className="grid gap-1">
                  权重:
                  <input
                    className="field px-2 py-1"
                    onChange={(event) => setDraft({ ...currentDraft, weight: Number(event.target.value) })}
                    type="number"
                    value={currentDraft.weight}
                  />
                </label>
                <label className="grid gap-1">
                  权限组 ID
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
                  删除权限组
                </button>
              ) : null}
              <button className="button-primary focus-ring" type="submit">
                保存权限组
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="text-sm font-semibold">
              父权限组
              <ParentRolePicker
                roles={catalog.roles.filter((role) => role.code !== currentDraft.code)}
                value={currentDraft.parents}
                onChange={(parents) => setDraft({ ...currentDraft, parents })}
              />
            </label>
            <label className="text-sm font-semibold">
              多语言显示名与说明
              <LocalizedTextPairEditor
                description="权限组的显示名和说明会按用户当前语言显示；未填写时回退到默认文本。"
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
            <h2 className="text-lg font-bold">权限节点 ({currentDraft.permissions.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
            <span className="font-semibold text-[var(--muted)]">已选择 {selectedPermissionIndexes.length} 项</span>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(true)}>
              批量设为 true
            </button>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(false)}>
              批量设为 false
            </button>
            <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={bulkRemovePermissions}>
              批量删除
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
                全部
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
                    <th className="border-b border-[var(--line)] px-3 py-3">权限</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">值</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">有效期至</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">说明</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">操作</th>
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
                            {permission.expiresAt ? "到期时间" : "永不过期"}
                          </span>
                          <input
                            className="field px-3 py-2"
                            onChange={(event) => updatePermissionAt(permission.index, { expiresAt: event.target.value })}
                            title="留空表示永不过期"
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
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleDraftPermissions.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                        当前筛选下没有权限节点
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
      description: role?.description || permission?.description || "未登记到权限目录",
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
        <h2 className="text-lg font-bold">用户权限 ({entries.length})</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--muted)]">已选择 {selectedIndexes.length} 项</span>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(true)}>
          批量设为 true
        </button>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(false)}>
          批量设为 false
        </button>
        <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedIndexes.length === 0} type="button" onClick={bulkRemove}>
          批量删除
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
            全部
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
                <th className="border-b border-[var(--line)] px-3 py-3">权限</th>
                <th className="border-b border-[var(--line)] px-3 py-3">值</th>
                <th className="border-b border-[var(--line)] px-3 py-3">有效期至</th>
                <th className="border-b border-[var(--line)] px-3 py-3">说明</th>
                <th className="border-b border-[var(--line)] px-3 py-3">操作</th>
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
                      <span className="text-xs font-semibold text-[var(--muted)]">{entry.expiresAt ? "到期时间" : "永不过期"}</span>
                      <input
                        className="field px-3 py-2"
                        onChange={(event) => onUpdate(entry.index, { expiresAt: event.target.value })}
                        title="留空表示永不过期"
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
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                    当前筛选下没有权限节点
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
  const { locale } = useI18n();
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
                  {isSelected ? <span className="font-mono text-sm font-bold">Selected</span> : null}
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
                  {code} <span className="text-[var(--muted)]">×</span>
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
            placeholder="Enter permissions or paste many"
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
        <input className="field" placeholder="显示名，不填则使用权限名" value={name} onChange={(event) => onNameChange(event.target.value)} />
        <input className="field" placeholder="说明，不填则为 新建权限" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
        <button className="button-primary focus-ring" type="button" onClick={onAdd}>
          添加
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
  const { locale } = useI18n();
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
      setMessage("请先登录拥有权限管理权限的账号");
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
      setMessage("权限列表已保存");
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
          <h2 className="text-lg font-bold">权限列表</h2>
          <p className="text-sm text-[var(--muted)]">权限说明和显示名可按语言单独维护。</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto] sm:items-center xl:min-w-[760px]">
          <input className="field min-w-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索权限" />
          <select className="field w-auto py-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                源: {item.label}
              </option>
            ))}
          </select>
          <select className="field w-auto py-2" value={targetLocale} onChange={(event) => setTargetLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                目标: {item.label}
              </option>
            ))}
          </select>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={savePermissions}>
            {saving ? "保存中" : "保存权限列表"}
          </button>
        </div>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="sticky top-0 z-10 grid gap-2 border-b border-[var(--line)] bg-[var(--panel)] py-3 text-xs font-bold uppercase text-[var(--muted)] lg:grid-cols-[1.2fr_140px_1.2fr_1.2fr_1.5fr]">
          <div>权限节点</div>
          <div>模块</div>
          <div>{sourceLocale} 参考</div>
          <div>{targetLocale} 显示名</div>
          <div>{targetLocale} 说明</div>
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
              className="field px-3 py-2"
              value={localizedText(permission, targetLocale).name}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { name: event.target.value }),
                })
              }
            />
            <input
              className="field px-3 py-2"
              value={localizedText(permission, targetLocale).description}
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
  const { locale } = useI18n();
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
      setMessage("请先登录拥有权限管理权限的账号");
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
      setMessage("用户权限已保存");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function addUserPermissionEntriesFromInput() {
    if (!token) {
      setMessage("请先登录拥有权限管理权限的账号");
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput).filter((code) => !code.includes("[") && !code.includes("]"));
    if (codes.length === 0) {
      setMessage("请先输入要添加的权限。用户直接权限不支持变量模板。");
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
              body: JSON.stringify({
                code,
                module: permissionModule(code),
                name: bulkPermissionName.trim() || code,
                description: bulkPermissionDescription.trim() || "新建权限",
              }),
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
      setMessage("用户权限已添加");
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
          <h2 className="text-lg font-bold">用户</h2>
          <p className="text-sm text-[var(--muted)]">{users.length} 个用户</p>
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
            <h2 className="text-xl font-bold">{selectedUser ? selectedUser.username : "未选择用户"}</h2>
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
              <p className="mt-2 text-sm text-[var(--muted)]">暂无权限组</p>
            )}
          </div>
          <button className="button-primary focus-ring" disabled={!selectedUser || saving} type="button" onClick={saveUserPermissions}>
            {saving ? "保存中" : "保存用户权限"}
          </button>
        </div>
        {message ? <div className="px-4"><InlineMessage text={message} /></div> : null}
      {users.length === 0 ? (
        <EmptyState text="暂无用户数据。后端启动并登录管理员账号后会显示真实用户。" />
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
              当前生效权限：{details.effectivePermissions.length} 个
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
        <ConfigBlock title="已接入功能">
          {Object.entries(config.features).map(([key, enabled]) => (
            <ConfigLine key={key} label={featureLabel(key)} value={enabled ? "已启用" : "未启用"} />
          ))}
        </ConfigBlock>
        <ConfigBlock title="近期事项">
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

function AuthPanel({ config, token }: { config: AdminConfig; token: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigBlock title="登录方式">
        <ConfigLine label="邮箱 + 密码" value={valueText(config.auth.emailPasswordLogin)} />
        <ConfigLine label="用户名 + 密码" value={valueText(config.auth.usernamePasswordLogin)} />
        <ConfigLine label="用户 ID + 密码" value={valueText(config.auth.userIDPasswordLogin)} />
        <ConfigLine label="邮箱验证码登录" value={valueText(config.auth.emailCodeLogin)} />
        <ConfigLine label="允许注册" value={valueText(config.auth.allowRegistration)} />
      </ConfigBlock>
      <ConfigBlock title="账号安全">
        <ConfigLine label="密码最小长度" value={`${config.auth.passwordMinLength ?? 8}`} />
        <ConfigLine label="Token 有效期" value={`${config.auth.tokenTTLHours ?? 24} 小时`} />
        <ConfigLine label="邮箱验证" value={valueText(config.auth.requireEmailVerification)} />
        <ConfigLine label="密码存储" value="PBKDF2-SHA256 + 独立 salt" />
      </ConfigBlock>
      <OAuthConfigPanel config={config.oauth} token={token} />
    </div>
  );
}

function OAuthConfigPanel({ config, token }: { config: OAuthConfig; token: string }) {
  const [message, setMessage] = useState("");
  const providers = [
    ["wechat", "微信"],
    ["qq", "QQ"],
    ["google", "Google"],
    ["github", "GitHub"],
  ] as const;

  async function saveOAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("请先登录拥有系统配置权限的账号");
      return;
    }
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
      setMessage("第三方登录配置已保存");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4 lg:col-span-2">
      <h2 className="mb-3 text-lg font-bold">第三方登录配置</h2>
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
                placeholder={current.hasClientSecret ? "已保存，留空保持不变" : "AppSecret / Client Secret"}
                type="password"
              />
              <input className="field" defaultValue={current.redirectUri} name={`${key}.redirectUri`} placeholder={`https://mcmods.cn/api/v1/auth/oauth/${key}/callback`} />
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button className="button-primary focus-ring" type="submit">
            保存第三方登录配置
          </button>
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
        </div>
      </form>
    </section>
  );
}

function MailPanel({ config, token }: { config: AdminConfig; token: string }) {
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("请先登录拥有邮件管理权限的账号");
      return;
    }
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
      setMessage("邮件配置已保存");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function testMail() {
    if (!token) {
      setMessage("请先登录拥有邮件管理权限的账号");
      return;
    }
    setTesting(true);
    setMessage("");
    try {
      await apiRequest<{ sent: boolean }>("/api/v1/admin/mail/test", { method: "POST", body: JSON.stringify({ to: testTo }) }, token);
      setMessage("测试邮件已发送");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigBlock title="SMTP 配置">
        <form className="grid gap-3" onSubmit={saveMail}>
          <label className="text-sm font-semibold">
            服务器
            <input className="field mt-2" defaultValue={config.mail.host} name="host" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              端口
              <input className="field mt-2" defaultValue={config.mail.port} min={1} name="port" type="number" />
            </label>
            <label className="text-sm font-semibold">
              发件人
              <input className="field mt-2" defaultValue={config.mail.from} name="from" />
            </label>
          </div>
          <label className="text-sm font-semibold">
            用户名
            <input className="field mt-2" defaultValue={config.mail.username} name="username" />
          </label>
          <label className="text-sm font-semibold">
            密码
            <input className="field mt-2" name="password" placeholder={config.mail.hasPassword ? "已保存，留空保持不变" : ""} type="password" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input defaultChecked={config.mail.useTLS} name="useTLS" type="checkbox" />
            TLS / STARTTLS
          </label>
          <button className="button-primary focus-ring" disabled={saving} type="submit">
            {saving ? "保存中" : "保存邮件配置"}
          </button>
        </form>
      </ConfigBlock>

      <ConfigBlock title="测试发送">
        <ConfigLine label="状态" value={config.mail.enabled ? "已配置" : "未配置"} />
        <ConfigLine label="服务器" value={config.mail.host || "未设置"} />
        <ConfigLine label="发件人" value={config.mail.from || "未设置"} />
        <div className="grid gap-2 pt-2">
          <input className="field" onChange={(event) => setTestTo(event.target.value)} placeholder="test@example.com" type="email" value={testTo} />
          <button className="button-secondary focus-ring" disabled={testing} type="button" onClick={testMail}>
            {testing ? "发送中" : "发送测试邮件"}
          </button>
          {message ? <InlineMessage text={message} /> : null}
        </div>
      </ConfigBlock>
    </div>
  );
}

function UsersPanel({
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
      setMessage("用户已创建");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PanelShell title="用户列表">
      <form className="mb-5 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4" onSubmit={createUser}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">新增用户</h3>
            <p className="text-sm text-[var(--muted)]">管理员创建的账号会直接写入后端数据库。</p>
          </div>
          <button className="button-primary focus-ring" disabled={creating} type="submit">
            {creating ? "创建中" : "创建用户"}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-sm font-semibold">
            用户名
            <input className="field mt-2" name="username" placeholder="例如 steve" required />
          </label>
          <label className="text-sm font-semibold">
            邮箱
            <input className="field mt-2" name="email" placeholder="name@example.com" required type="email" />
          </label>
          <label className="text-sm font-semibold">
            初始密码
            <input className="field mt-2" minLength={8} name="password" required type="password" />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_1fr]">
          <label className="text-sm font-semibold">
            显示名
            <input className="field mt-2" name="displayName" placeholder="留空使用用户名" />
          </label>
          <label className="text-sm font-semibold">
            状态
            <select className="field mt-2" defaultValue="active" name="status">
              <option value="active">正常</option>
              <option value="disabled">停用</option>
              <option value="banned">封禁</option>
              <option value="deleted">注销</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            权限组
            <input
              className="field mt-2"
              list="create-user-role-options"
              name="roles"
              placeholder="留空表示暂不分配，或输入 project_editor.112345"
            />
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
        <EmptyState text="暂无用户数据。后端启动并登录管理员账号后会显示真实用户。" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] py-2">ID</th>
                <th className="border-b border-[var(--line)] py-2">用户</th>
                <th className="border-b border-[var(--line)] py-2">邮箱</th>
                <th className="border-b border-[var(--line)] py-2">注册时间</th>
                <th className="border-b border-[var(--line)] py-2">状态</th>
                <th className="border-b border-[var(--line)] py-2">权限组</th>
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
    setLocale,
    t,
    translationKeys,
    getTranslation,
    getBaseTranslation,
    setTranslation,
    resetTranslation,
  } = useI18n();
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const visibleKeys = translationKeys.filter((key) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return (
      key.toLowerCase().includes(keyword) ||
      getTranslation(sourceLocale, key).toLowerCase().includes(keyword) ||
      getTranslation(targetLocale, key).toLowerCase().includes(keyword)
    );
  });

  function saveTranslation(key: string, value: string) {
    setTranslation(targetLocale, key, value);
    setMessage(t("admin.translationSaved"));
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
            onChange={(event) => {
              const nextLocale = event.target.value as Locale;
              setTargetLocale(nextLocale);
              setLocale(nextLocale);
            }}
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
        <input
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`${t("common.search")} key / text`}
        />
        {message ? <InlineMessage text={message} /> : null}
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
              const target = getTranslation(targetLocale, key);
              const edited = target !== baseTarget;
              return (
                <tr key={key}>
                  <td className="border-b border-[var(--line)] px-4 py-3 font-mono text-xs">{key}</td>
                  <td className="border-b border-[var(--line)] px-4 py-3">{getTranslation(sourceLocale, key)}</td>
                  <td className="border-b border-[var(--line)] px-4 py-3">
                    <textarea
                      className="field min-h-20"
                      defaultValue={target}
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
  const source = localizedText(value, sourceLocale);
  const target = localizedText(value, targetLocale);

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto py-2" value={sourceLocale} onChange={(event) => onSourceLocaleChange(event.target.value as Locale)}>
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              源: {item.label}
            </option>
          ))}
        </select>
        <select className="field w-auto py-2" value={targetLocale} onChange={(event) => onTargetLocaleChange(event.target.value as Locale)}>
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              目标: {item.label}
            </option>
          ))}
        </select>
      </div>
      {description ? <p className="text-sm font-normal text-[var(--muted)]">{description}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2 rounded-md bg-[var(--panel-subtle)] p-3">
          <div className="text-xs font-bold uppercase text-[var(--muted)]">{sourceLocale} 参考</div>
          <div className="font-bold">{source.name || "未填写"}</div>
          <div className="text-sm font-normal text-[var(--muted)]">{source.description || "未填写"}</div>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1">
            {targetLocale} 显示名
            <input
              className="field"
              value={target.name}
              onChange={(event) => onChange(setLocalizedText(value.translations, targetLocale, { name: event.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            {targetLocale} 说明
            <textarea
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
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="surface w-full max-w-md rounded-lg p-6 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">
          M
        </div>
        <h1 className="text-xl font-bold">后台管理</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{text}</p>
      </div>
    </main>
  );
}

function panelTitle(panel: PanelId) {
  const titles: Record<PanelId, string> = {
    overview: "总览",
    roles: "权限组编辑器",
    "user-roles": "用户权限组",
    "permission-list": "权限列表",
    users: "用户列表",
    mail: "邮件系统",
    auth: "登录配置",
    i18n: "多语言管理",
  };
  return titles[panel];
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
  return value ? "启用" : "关闭";
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

function featureLabel(key: string) {
  const labels: Record<string, string> = {
    contentReview: "内容审核",
    emailSystem: "邮件系统",
    permissionRBAC: "权限 RBAC",
    oss: "对象存储",
    redis: "Redis 缓存",
    crawler: "爬虫",
    ai: "AI 能力",
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
      description: permission.description || "新建权限",
      translations: normalizeLocalizedTexts(permission.translations),
    };
    if (!existing || permission.code === code || isTemplatePermissionCode(permission.code)) {
      grouped.set(code, normalized);
    }
  }
  return {
    ...catalog,
    roles: catalog.roles.map((role) => ({ ...role, translations: normalizeLocalizedTexts(role.translations) })),
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
  const localized = value.translations?.[locale];
  return {
    name: localized?.name?.trim() || value.name || "",
    description: localized?.description?.trim() || value.description || "",
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

function withFallbackLocalizedText<T extends { name: string; description: string; translations?: LocalizedTexts }>(value: T): T {
  const translations = normalizeLocalizedTexts(value.translations);
  const fallback = translations["zh-CN"] ?? translations.en ?? Object.values(translations)[0];
  return {
    ...value,
    name: value.name.trim() || fallback?.name || "未命名",
    description: value.description.trim() || fallback?.description || "",
    translations,
  };
}

function cloneRole(role: Role): Role {
  const permissionEntries =
    role.permissionEntries?.length > 0
      ? role.permissionEntries.map((permission) => ({ ...permission }))
      : role.permissions.map((code) => ({ code, allow: true }));
  return {
    ...role,
    translations: normalizeLocalizedTexts(role.translations),
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
  const message = error instanceof Error ? error.message : "请求失败";
  if (message === "Failed to fetch") {
    return "后端未连接或接口请求失败";
  }
  return message;
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
