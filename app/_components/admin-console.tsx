"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { canAccessAdmin, clearAuth, hasPermission, useAuthSnapshot } from "../_lib/auth";
import { ApiError, apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { normalizeMarkdownConfig } from "../_lib/markdown-config";
import { ActivityMonitorPanel, CreatorClaimsPanel, CurrencyManagementPanel, EconomyConfigPanel, LevelConfigPanel, ShopManagementPanel, TaskManagementPanel } from "./admin-community-panels";
import { MinecraftVersionConfigPanel, ModReviewQueuePanel } from "./admin-mod-panels";
import { ServerReviewQueuePanel, ServerSettingsPanel } from "./admin-server-panels";
import { AdminUnresolvedReferences } from "./admin-unresolved-references";
import { AdminContentAttributePanel } from "./admin-content-attribute-panel";
import { AdminYggdrasilPanel } from "./admin-yggdrasil-panel";
import { AdminDashboardPanel, AdminProjectWorkbenchPanel, type AdminDashboardData } from "./admin-dashboard-panel";
import { useTheme } from "./theme-provider";
import { useSiteBrand } from "./site-brand-provider";
import { AdminActivityRetentionPanel } from "./admin-activity-retention-panel";
import { AdminAntiAbusePanel } from "./admin-anti-abuse-panel";
import { ProjectAutomationAdminPanel, SeedCrawlerAdminPanel } from "./admin-automation-panels";
import { BanAdminPanel } from "./admin-ban-panel";
import { UnifiedReportAdminPanel } from "./admin-report-panel";
import { AboutAdminPanel, SiteChangelogAdminPanel } from "./admin-site-affairs-panels";
import { AdminStickerPanel } from "./admin-sticker-panel";
import { AdminProjectAuthorshipPanel } from "./admin-project-authorship-panel";
import { AdminConfig, AdminGateMessage, AdminNotice, AdminNoticeDialog, PermissionCatalog, User, AIConfig, cleanError, emptyCatalog, emptyConfig, emptyDashboard, normalizePermissionCatalog } from "./admin-console-shared";
import { PermissionCatalogEditor, PermissionGroupEditor, UserRolePanel } from "./admin-console-permissions";
import { AICostsPanel, AIModelsPanel, AIProvidersPanel, AITaskLogsPanel, AITaskModelsPanel, AuthPanelV2, GeneralSettingsPanel, MailPanelV2, MarkdownConfigPanel, ModImportConfigPanel, NATSConfigPanel, PermissionSettingsPanel, ProfileSettingsPanel, RoleTracksPanel } from "./admin-console-infrastructure";
import { NotificationTemplatePanel, ReviewSettingsPanel, SystemNotificationPanel, TranslationManagerPanel, UsersPanelV2 } from "./admin-console-users";
import { LogCleanupPanel, LogsPanel, OSSConfigPanelV2, OSSFilesPanel, OSSRowsPanel, RuntimeLogsPanel } from "./admin-console-oss";

type PanelId =
  | "overview"
  | "projects"
  | "general-settings"
  | "yggdrasil"
  | "roles"
  | "user-roles"
  | "permission-list"
  | "role-tracks"
  | "permission-settings"
  | "creator-claims"
  | "project-authorship"
  | "activity-monitor"
  | "anti-abuse"
  | "economy-config"
  | "currencies"
  | "shop-items"
  | "level-config"
  | "tasks"
  | "users"
  | "reviews-content"
  | "reviews-editor"
  | "reviews-server"
  | "reports"
  | "bans"
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
  | "logs-cleanup"
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
  | "ai-task-logs"
  | "site-about"
  | "site-changelogs"
  | "seed-crawler"
  | "project-auto-updates"
  | "stickers";

const adminNavGroups: Array<{
  id: string;
  label: string;
  items: Array<{ id: PanelId; label: string; description: string }>;
}> = [
  {
    id: "workbench",
    label: "",
    items: [
      { id: "overview", label: "", description: "" },
      { id: "projects", label: "", description: "" },
    ],
  },
  {
    id: "reviews",
    label: "",
    items: [
      { id: "reviews-content", label: "", description: "" },
      { id: "reviews-editor", label: "", description: "" },
      { id: "reviews-server", label: "", description: "" },
      { id: "reports", label: "", description: "" },
      { id: "bans", label: "", description: "" },
      { id: "creator-claims", label: "", description: "" },
      { id: "project-authorship", label: "", description: "" },
      { id: "review-settings", label: "", description: "" },
      { id: "server-settings", label: "", description: "" },
    ],
  },
  {
    id: "automation",
    label: "",
    items: [
      { id: "seed-crawler", label: "", description: "" },
      { id: "project-auto-updates", label: "", description: "" },
      { id: "mod-import-settings", label: "", description: "" },
    ],
  },
  {
    id: "site-affairs",
    label: "",
    items: [
      { id: "site-about", label: "", description: "" },
      { id: "site-changelogs", label: "", description: "" },
    ],
  },
  {
    id: "content",
    label: "",
    items: [
      { id: "resource-attributes", label: "", description: "" },
      { id: "unresolved-references", label: "", description: "" },
      { id: "stickers", label: "", description: "" },
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
    items: [{ id: "activity-monitor", label: "", description: "" }, { id: "anti-abuse", label: "", description: "" }],
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
      { id: "logs-cleanup", label: "", description: "" },
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

export function AdminConsole() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { t } = useI18n();
  const brand = useSiteBrand();
  const auth = useAuthSnapshot();
  const [activePanel, setActivePanel] = useState<PanelId>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [expanded, setExpanded] = useState(["workbench"]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [config, setConfig] = useState(emptyConfig);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState(t("admin.backendDisconnected"));
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [reconnectIn, setReconnectIn] = useState(0);
  const [noticeDialog, setNoticeDialog] = useState<AdminNotice | null>(null);
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const authReady = auth.ready;
  const allowed = canAccessAdmin(auth.user);
  const requiredPanelPermissions = panelPermissions(activePanel);
  const visiblePanel = requiredPanelPermissions.length === 0 || requiredPanelPermissions.some((permission) => hasPermission(auth.user, permission)) ? activePanel : "overview";

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
        setStatus(attempt === 0 ? translation.current("admin.connecting") : translation.current("admin.reconnecting"));
        const [dashboardData, configData, permissionData, userData, aiData] = await Promise.all([
          apiRequest<AdminDashboardData>("/api/v1/admin/dashboard", {}, auth.token),
          hasPermission(auth.user, "admin.config.read") ? apiRequest<AdminConfig>("/api/v1/admin/config", {}, auth.token) : Promise.resolve(undefined),
          hasPermission(auth.user, "permission.read") ? apiRequest<PermissionCatalog>("/api/v1/admin/permissions", {}, auth.token) : Promise.resolve(undefined),
          hasPermission(auth.user, "user.read") ? apiRequest<User[]>("/api/v1/admin/users", {}, auth.token) : Promise.resolve(undefined),
          !hasPermission(auth.user, "admin.config.read") && hasPermission(auth.user, "ai.read") ? apiRequest<AIConfig>("/api/v1/admin/ai/config", {}, auth.token) : Promise.resolve(undefined),
        ]);
        if (!cancelled) {
          setDashboard(dashboardData);
          setConfig({ ...emptyConfig, ...configData, ai: aiData ?? configData?.ai, features: configData?.features ?? {}, markdown: normalizeMarkdownConfig(configData?.markdown) });
          setCatalog(permissionData ? normalizePermissionCatalog(permissionData) : emptyCatalog);
          setUsers(userData ?? []);
          setStatus(translation.current("common.connected"));
          setBackendAvailable(true);
          setReconnectIn(0);
          clearRetryTimers();
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            clearAuth();
            router.replace("/login?next=/admin");
            return;
          }
          const message = cleanError(error) || translation.current("admin.backendDisconnected");
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
  }, [allowed, auth.token, auth.user, authReady, router]);

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
                {brand.logoUrl ? <img alt="" className="h-10 w-10 rounded-lg object-contain" src={brand.logoUrl} /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-[var(--on-accent)]">M</span>}
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
                const visibleItems = group.items.filter((item) => {
                  const required = panelPermissions(item.id);
                  return required.length === 0 || required.some((permission) => hasPermission(auth.user, permission));
                });
                if (visibleItems.length === 0) return null;
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
                        {visibleItems.map((item) => (
                          <button
                            key={item.id}
                            data-admin-panel={item.id}
                            className={`focus-ring rounded-lg px-3 py-2 text-left ${
                              visiblePanel === item.id
                                ? "bg-[var(--accent)] text-[var(--on-accent)]"
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

        <section key={`${auth.user?.id}:${auth.user?.permissionVersion}:${auth.user?.rbacVersion}`} className="min-w-0 px-4 py-5 md:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--accent)]">Admin Console</p>
              <h1 className="text-2xl font-bold">{panelTitleV2(visiblePanel, t)}</h1>
            </div>
            {auth.user ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
                {auth.user.username} / {(auth.user.roleCodes ?? []).join(", ") || t("admin.ungrouped")}
              </div>
            ) : null}
          </div>

          {visiblePanel === "overview" ? <AdminDashboardPanel initialData={dashboard} token={auth.token} features={config.features} /> : null}
          {visiblePanel === "projects" ? <AdminProjectWorkbenchPanel token={auth.token} /> : null}
          {visiblePanel === "general-settings" ? <GeneralSettingsPanel initialConfig={config.general ?? emptyConfig.general} token={auth.token} /> : null}
          {visiblePanel === "yggdrasil" ? <AdminYggdrasilPanel initialConfig={config.yggdrasil ?? emptyConfig.yggdrasil} token={auth.token} /> : null}
          {visiblePanel === "roles" ? (
            <PermissionGroupEditor catalog={catalog} token={auth.token} refreshCatalog={refreshCatalog} />
          ) : null}
          {visiblePanel === "user-roles" ? (
            <UserRolePanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {visiblePanel === "permission-list" ? (
            <PermissionCatalogEditor
              key={JSON.stringify(catalog.permissions)}
              catalog={catalog}
              token={auth.token}
              refreshCatalog={refreshCatalog}
            />
          ) : null}
          {visiblePanel === "role-tracks" ? (
            <RoleTracksPanel catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {visiblePanel === "permission-settings" ? <PermissionSettingsPanel catalog={catalog} token={auth.token} /> : null}
          {visiblePanel === "creator-claims" ? <CreatorClaimsPanel token={auth.token} /> : null}
          {visiblePanel === "project-authorship" ? <AdminProjectAuthorshipPanel token={auth.token} /> : null}
          {visiblePanel === "activity-monitor" ? <><ActivityMonitorPanel token={auth.token} />{hasPermission(auth.user, "log.read") ? <AdminActivityRetentionPanel token={auth.token} /> : null}</> : null}
          {visiblePanel === "anti-abuse" ? <AdminAntiAbusePanel token={auth.token} /> : null}
          {visiblePanel === "economy-config" ? <EconomyConfigPanel token={auth.token} /> : null}
          {visiblePanel === "currencies" ? <CurrencyManagementPanel token={auth.token} /> : null}
          {visiblePanel === "shop-items" ? <ShopManagementPanel token={auth.token} /> : null}
          {visiblePanel === "level-config" ? <LevelConfigPanel token={auth.token} /> : null}
          {visiblePanel === "tasks" ? <TaskManagementPanel token={auth.token} /> : null}
          {visiblePanel === "users" ? (
            <UsersPanelV2 catalog={catalog} token={auth.token} users={users} refreshUsers={refreshUsers} />
          ) : null}
          {visiblePanel === "notifications" ? <SystemNotificationPanel token={auth.token} /> : null}
          {visiblePanel === "notification-templates" ? <NotificationTemplatePanel token={auth.token} /> : null}
          {visiblePanel === "reviews-content" ? <ModReviewQueuePanel kind="content" token={auth.token} /> : null}
          {visiblePanel === "reviews-editor" ? <ModReviewQueuePanel kind="editor" token={auth.token} /> : null}
          {visiblePanel === "reviews-server" ? <ServerReviewQueuePanel token={auth.token} /> : null}
          {visiblePanel === "reports" ? <UnifiedReportAdminPanel token={auth.token} /> : null}
          {visiblePanel === "bans" ? <BanAdminPanel token={auth.token} /> : null}
          {visiblePanel === "review-settings" ? <ReviewSettingsPanel token={auth.token} /> : null}
          {visiblePanel === "server-settings" ? <ServerSettingsPanel token={auth.token} /> : null}
          {visiblePanel === "mail" ? <MailPanelV2 config={config} token={auth.token} /> : null}
          {visiblePanel === "auth" ? <AuthPanelV2 config={config} token={auth.token} /> : null}
          {visiblePanel === "markdown" ? <MarkdownConfigPanel initialConfig={config.markdown} token={auth.token} /> : null}
          {visiblePanel === "profile-settings" ? <ProfileSettingsPanel initialConfig={config.profile ?? emptyConfig.profile} token={auth.token} /> : null}
          {visiblePanel === "minecraft-versions" ? <MinecraftVersionConfigPanel token={auth.token} /> : null}
          {visiblePanel === "resource-attributes" ? <AdminContentAttributePanel token={auth.token} /> : null}
          {visiblePanel === "mod-import-settings" ? <ModImportConfigPanel token={auth.token} /> : null}
          {visiblePanel === "seed-crawler" ? <SeedCrawlerAdminPanel token={auth.token} /> : null}
          {visiblePanel === "project-auto-updates" ? <ProjectAutomationAdminPanel token={auth.token} /> : null}
          {visiblePanel === "site-about" ? <AboutAdminPanel token={auth.token} /> : null}
          {visiblePanel === "site-changelogs" ? <SiteChangelogAdminPanel token={auth.token} /> : null}
          {visiblePanel === "unresolved-references" ? <AdminUnresolvedReferences token={auth.token} /> : null}
          {visiblePanel === "stickers" ? <AdminStickerPanel token={auth.token} /> : null}
          {visiblePanel === "nats" ? <NATSConfigPanel token={auth.token} /> : null}
          {visiblePanel === "i18n" ? <TranslationManagerPanel token={auth.token} /> : null}
          {visiblePanel === "oss-config" ? <OSSConfigPanelV2 initialConfig={config.oss ?? emptyConfig.oss!} token={auth.token} /> : null}
          {visiblePanel === "oss-files" ? <OSSFilesPanel token={auth.token} /> : null}
          {visiblePanel === "oss-uploads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-uploads", t)} endpoint="/api/v1/admin/oss/uploads" /> : null}
          {visiblePanel === "oss-scans" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-scans", t)} endpoint="/api/v1/admin/oss/scans" /> : null}
          {visiblePanel === "oss-downloads" ? <OSSRowsPanel token={auth.token} title={panelTitleV2("oss-downloads", t)} endpoint="/api/v1/admin/oss/downloads" /> : null}
          {visiblePanel === "logs-system" ? <RuntimeLogsPanel token={auth.token} title={panelTitleV2("logs-system", t)} /> : null}
          {visiblePanel === "logs-cleanup" ? <LogCleanupPanel token={auth.token} /> : null}
          {visiblePanel === "logs-admin" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-admin", t)} category="admin_operation" /> : null}
          {visiblePanel === "logs-permission" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-permission", t)} category="permission_change" /> : null}
          {visiblePanel === "logs-login" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-login", t)} category="login_security" /> : null}
          {visiblePanel === "logs-api" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-api", t)} category="api_access" /> : null}
          {visiblePanel === "logs-file-upload" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-file-upload", t)} category="file_upload" /> : null}
          {visiblePanel === "logs-ai" ? <LogsPanel token={auth.token} title={panelTitleV2("logs-ai", t)} category="ai_call" /> : null}
          {visiblePanel === "ai-providers" ? <AIProvidersPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {visiblePanel === "ai-models" ? <AIModelsPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {visiblePanel === "ai-task-models" ? <AITaskModelsPanel initialConfig={config.ai ?? emptyConfig.ai!} token={auth.token} /> : null}
          {visiblePanel === "ai-costs" ? <AICostsPanel token={auth.token} /> : null}
          {visiblePanel === "ai-task-logs" ? <AITaskLogsPanel token={auth.token} /> : null}
        </section>
      </div>
      {noticeModal}
    </main>
  );
}

function panelTitleV2(panel: PanelId, t: (key: string, params?: Record<string, string | number>) => string) {
  const titles: Record<PanelId, string> = {
    overview: t("admin.overview"),
    projects: t("admin.projectList"),
    "general-settings": t("admin.generalSettings.title"),
    yggdrasil: t("admin.yggdrasil.title"),
    roles: t("admin.roles"),
    "user-roles": t("admin.userRoles"),
    "permission-list": t("admin.permissionList"),
    "role-tracks": t("admin.roleTracks.title"),
    "permission-settings": t("admin.permissionSettings.title"),
    "creator-claims": t("admin.community.creatorClaims"),
    "project-authorship": t("admin.projectAuthorship.title"),
    "activity-monitor": t("admin.community.activity"),
    "anti-abuse": t("antiAbuse.navTitle"),
    "economy-config": t("admin.community.economyConfig"),
    currencies: t("admin.community.currencies"),
    "shop-items": t("admin.community.shopItems"),
    "level-config": t("admin.community.levelConfig"),
    tasks: t("admin.community.tasks"),
    users: t("admin.userList"),
    "reviews-content": t("admin.reviews.contentTitle"),
    "reviews-editor": t("admin.reviews.editorTitle"),
    "reviews-server": t("admin.serverReviews.title"),
    reports: t("admin.governance.reports"),
    bans: t("admin.governance.bans"),
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
    "logs-cleanup": t("admin.panels.logsCleanup"),
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
    "site-about": t("admin.governance.about"),
    "site-changelogs": t("admin.governance.changelogs"),
    "seed-crawler": t("admin.automation.seedCrawler"),
    "project-auto-updates": t("admin.automation.projectUpdates"),
    stickers: t("admin.stickers.title"),
  };
  return titles[panel];
}

function panelPermissions(panel: PanelId): string[] {
  if (["general-settings", "yggdrasil", "mail", "auth", "markdown", "profile-settings", "minecraft-versions", "mod-import-settings", "resource-attributes", "review-settings", "server-settings", "nats"].includes(panel)) return ["admin.config.read"];
  if (["ai-providers", "ai-models", "ai-task-models", "ai-costs", "ai-task-logs"].includes(panel)) return ["ai.read"];
  if (panel === "oss-config") return ["oss.read"];
	if (panel === "project-authorship") return ["project.authorship.manage", "project.team_relation.manage"];
  const permissions: Partial<Record<PanelId, string>> = {
    reports: "report.review",
    bans: "ban.view_internal",
    "site-about": "site_affairs.about.manage",
    "site-changelogs": "site_affairs.changelog.manage",
    "seed-crawler": "seed_crawler.view",
    "project-auto-updates": "project.auto_update.view_logs",
    "reviews-content": "project.review",
    "reviews-editor": "project.editor.review",
    "reviews-server": "server.review",
    roles: "permission.read",
    "role-tracks": "permission.read",
    "user-roles": "permission.read",
    "permission-list": "permission.read",
    "permission-settings": "permission.read",
    users: "user.read",
    "activity-monitor": "activity.read",
    "logs-cleanup": "log.read",
    "anti-abuse": "security.anti-abuse.read",
    "oss-files": "oss.file.read",
    stickers: "sticker.manage",
  };
  return permissions[panel] ? [permissions[panel]] : [];
}

function adminNavGroupLabel(groupId: string, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const labels: Record<string, string> = {
    workbench: t("admin.workbench"),
    content: t("admin.modImport.group"),
    reviews: t("admin.reviews.group"),
    automation: t("admin.automation.group"),
    "site-affairs": t("admin.governance.siteAffairsGroup"),
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
    projects: t("admin.projectListDesc"),
    "general-settings": t("admin.generalSettings.description"),
    yggdrasil: t("admin.yggdrasil.navDescription"),
    roles: t("admin.rolesDesc"),
    "user-roles": t("admin.userRolesDesc"),
    "permission-list": t("admin.permissionListDesc"),
    "role-tracks": t("admin.roleTracks.navDescription"),
    "permission-settings": t("admin.permissionSettings.navDescription"),
    "creator-claims": t("admin.community.creatorClaimsDescription"),
    "project-authorship": t("admin.projectAuthorship.description"),
    "activity-monitor": t("admin.community.activityDescription"),
    "anti-abuse": t("antiAbuse.navDescription"),
    "economy-config": t("admin.community.economyConfigDescription"),
    currencies: t("admin.community.currenciesDescription"),
    "shop-items": t("admin.community.shopItemsDescription"),
    "level-config": t("admin.community.levelConfigDescription"),
    tasks: t("admin.community.tasksDescription"),
    users: t("admin.usersDesc"),
    "reviews-content": t("admin.reviews.contentDescription"),
    "reviews-editor": t("admin.reviews.editorDescription"),
    "reviews-server": t("admin.serverReviews.navDescription"),
    reports: t("admin.governance.reportsDescription"),
    bans: t("admin.governance.bansDescription"),
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
    "logs-cleanup": t("admin.nav.logsCleanupDesc"),
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
    "site-about": t("admin.governance.aboutDescription"),
    "site-changelogs": t("admin.governance.changelogsDescription"),
    "seed-crawler": t("admin.automation.seedCrawlerDescription"),
    "project-auto-updates": t("admin.automation.projectUpdatesDescription"),
    stickers: t("admin.stickers.description"),
  };
  return descriptions[panel] ?? fallback;
}
