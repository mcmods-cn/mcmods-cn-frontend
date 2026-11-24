import type { ReactNode } from "react";
import { type AuthUser, canAccessReviewQueue, hasPermission } from "../_lib/auth";
import { ActivityMonitorPanel, CreatorClaimsPanel, CurrencyManagementPanel, EconomyConfigPanel, LevelConfigPanel, ShopManagementPanel, TaskManagementPanel } from "./admin-community-panels";
import { MinecraftVersionConfigPanel, ModReviewQueuePanel } from "./admin-mod-panels";
import { ServerReviewQueuePanel } from "./admin-server-panels";
import { AdminUnresolvedReferences } from "./admin-unresolved-references";
import { AdminContentAttributePanel } from "./admin-content-attribute-panel";
import { AdminAccessEditor, AdminOverview, AdminSettingsEditor } from "./admin-panel-data";
import { AdminProjectWorkbenchPanel } from "./admin-dashboard-panel";
import { AdminActivityRetentionPanel } from "./admin-activity-retention-panel";
import { CommentModerationPanel } from "./comment-moderation-panel";
import { AdminAntiAbusePanel } from "./admin-anti-abuse-panel";
import { ProjectAutomationAdminPanel, SeedCrawlerAdminPanel } from "./admin-automation-panels";
import { BanAdminPanel } from "./admin-ban-panel";
import { UnifiedReportAdminPanel } from "./admin-report-panel";
import { AboutAdminPanel, SiteChangelogAdminPanel } from "./admin-site-affairs-panels";
import { AdminStickerPanel } from "./admin-sticker-panel";
import { AdminProjectAuthorshipPanel } from "./admin-project-authorship-panel";
import { AICostsPanel, AITaskLogsPanel } from "./admin-ai-activity";
import { AISettingsPanel } from "./admin-ai-settings";
import { ModImportConfigPanel } from "./admin-console-infrastructure";
import { NotificationTemplatePanel, ReviewSettingsPanel, SystemNotificationPanel, TranslationManagerPanel } from "./admin-console-users";
import { LogCleanupPanel, LogsPanel, OSSConfigPanelV2, OSSFilesPanel, OSSRowsPanel, RuntimeLogsPanel } from "./admin-console-oss";

const groupLabels = {
  "workbench": "admin.workbench",
  "reviews": "admin.reviews.group",
  "automation": "admin.automation.group",
  "site-affairs": "admin.governance.siteAffairsGroup",
  "content": "admin.modImport.group",
  "permission": "admin.permission",
  "economy": "admin.community.nav.economy",
  "progression": "admin.community.nav.progression",
  "monitoring": "admin.community.nav.monitoring",
  "oss": "admin.nav.oss",
  "logs": "admin.nav.logs",
  "ai": "admin.nav.ai",
  "infrastructure": "admin.nats.infrastructure",
  "users": "admin.users",
  "notifications": "admin.notifications.group",
  "system": "admin.system",
} as const;

type Gate = string | ((user: AuthUser | null) => boolean) | null;
type Access = { read: boolean; write: boolean; execute: boolean };
type Context = { user: AuthUser | null; token: string; title: string; access: Access };
type AdminPanel = {
  group: keyof typeof groupLabels;
  title: string;
  description: string;
  read: Gate;
  write?: string;
  execute?: Gate;
  render: (context: Context) => ReactNode;
};

// These operations enqueue a task and read its result.
function canTranslate(user: AuthUser | null) {
  return hasPermission(user, "ai.read") && hasPermission(user, "ai.task.enqueue");
}

// Fine-grained project and row actions stay with the component that owns them.
const definitions = {
  "overview": {
    group: "workbench", title: "admin.overview", description: "admin.overviewDesc",
    read: null,
    render: ({ token, user }) => <AdminOverview token={token} canReadConfig={hasPermission(user, "admin.config.read")} />,
  },
  "projects": {
    group: "workbench", title: "admin.projectList", description: "admin.projectListDesc",
    read: null,
    render: ({ token }) => <AdminProjectWorkbenchPanel token={token} />,
  },
  "comment-moderation": {
    group: "reviews", title: "commentModeration.title", description: "commentModeration.description",
    read: "comment.moderate",
    render: () => <CommentModerationPanel />,
  },
  "reviews-content": {
    group: "reviews", title: "admin.reviews.contentTitle", description: "admin.reviews.contentDescription",
    read: canAccessReviewQueue,
    render: ({ token }) => <ModReviewQueuePanel kind="content" token={token} />,
  },
  "reviews-editor": {
    group: "reviews", title: "admin.reviews.editorTitle", description: "admin.reviews.editorDescription",
    read: "project.editor.review",
    render: ({ token }) => <ModReviewQueuePanel kind="editor" token={token} />,
  },
  "reviews-server": {
    group: "reviews", title: "admin.serverReviews.title", description: "admin.serverReviews.navDescription",
    read: "server.review",
    render: ({ token }) => <ServerReviewQueuePanel token={token} />,
  },
  "reports": {
    group: "reviews", title: "admin.governance.reports", description: "admin.governance.reportsDescription",
    read: "report.review",
    render: ({ token }) => <UnifiedReportAdminPanel token={token} />,
  },
  "bans": {
    group: "reviews", title: "admin.governance.bans", description: "admin.governance.bansDescription",
    read: "ban.view_internal",
    render: ({ token }) => <BanAdminPanel token={token} />,
  },
  "creator-claims": {
    group: "reviews", title: "admin.community.creatorClaims", description: "admin.community.creatorClaimsDescription",
    read: "creator.claim.review",
    render: ({ token }) => <CreatorClaimsPanel token={token} />,
  },
  "project-authorship": {
    group: "reviews", title: "admin.projectAuthorship.title", description: "admin.projectAuthorship.description",
    read: (user) => hasPermission(user, "project.authorship.manage") || hasPermission(user, "project.team_relation.manage"),
    render: ({ token }) => <AdminProjectAuthorshipPanel token={token} />,
  },
  "review-settings": {
    group: "reviews", title: "admin.reviewSettings.title", description: "admin.reviewSettings.navDescription",
    read: "admin.config.read",
    render: ({ token }) => <ReviewSettingsPanel token={token} />,
  },
  "server-settings": {
    group: "reviews", title: "admin.serverSettings.title", description: "admin.serverSettings.navDescription",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="server-settings" token={token} canWrite={access.write} />,
  },
  "seed-crawler": {
    group: "automation", title: "admin.automation.seedCrawler", description: "admin.automation.seedCrawlerDescription",
    read: "seed_crawler.view", write: "seed_crawler.configure", execute: "seed_crawler.run",
    render: ({ token, access }) => <SeedCrawlerAdminPanel token={token} canWrite={access.write} canRun={access.execute} />,
  },
  "project-auto-updates": {
    group: "automation", title: "admin.automation.projectUpdates", description: "admin.automation.projectUpdatesDescription",
    read: "project.auto_update.view_logs",
    render: ({ token }) => <ProjectAutomationAdminPanel token={token} />,
  },
  "mod-import-settings": {
    group: "automation", title: "admin.modImport.navTitle", description: "admin.modImport.navDescription",
    read: "admin.config.read",
    render: ({ token }) => <ModImportConfigPanel token={token} />,
  },
  "site-about": {
    group: "site-affairs", title: "admin.governance.about", description: "admin.governance.aboutDescription",
    read: "site_affairs.about.manage",
    render: ({ token }) => <AboutAdminPanel token={token} />,
  },
  "site-changelogs": {
    group: "site-affairs", title: "admin.governance.changelogs", description: "admin.governance.changelogsDescription",
    read: "site_affairs.changelog.manage",
    render: ({ token }) => <SiteChangelogAdminPanel token={token} />,
  },
  "resource-attributes": {
    group: "content", title: "admin.resourceAttributes.title", description: "admin.resourceAttributes.navDescription",
    read: "admin.config.read",
    render: ({ token }) => <AdminContentAttributePanel token={token} />,
  },
  "unresolved-references": {
    group: "content", title: "admin.unresolved.title", description: "admin.unresolved.navDescription",
    read: "reference.unresolved.read",
    render: ({ token }) => <AdminUnresolvedReferences token={token} />,
  },
  "stickers": {
    group: "content", title: "admin.stickers.title", description: "admin.stickers.description",
    read: "sticker.manage",
    render: ({ token }) => <AdminStickerPanel token={token} />,
  },
  "roles": {
    group: "permission", title: "admin.roles", description: "admin.rolesDesc",
    read: "permission.read",
    render: ({ token, user }) => <AdminAccessEditor canReadCatalog={hasPermission(user, "permission.read")} canReadUsers={hasPermission(user, "user.read")} panel="roles" token={token} />,
  },
  "user-roles": {
    group: "permission", title: "admin.userRoles", description: "admin.userRolesDesc",
    read: (user) => hasPermission(user, "user.read") && hasPermission(user, "permission.read"),
    render: ({ token, user }) => <AdminAccessEditor canReadCatalog={hasPermission(user, "permission.read")} canReadUsers={hasPermission(user, "user.read")} panel="user-roles" token={token} />,
  },
  "permission-list": {
    group: "permission", title: "admin.permissionList", description: "admin.permissionListDesc",
    read: "permission.read", execute: canTranslate,
    render: ({ token, user, access }) => <AdminAccessEditor canReadCatalog={hasPermission(user, "permission.read")} canReadUsers={hasPermission(user, "user.read")} canTranslate={access.execute} panel="permission-list" token={token} />,
  },
  "role-tracks": {
    group: "permission", title: "admin.roleTracks.title", description: "admin.roleTracks.navDescription",
    read: "permission.read",
    render: ({ token, user }) => <AdminAccessEditor canReadCatalog={hasPermission(user, "permission.read")} canReadUsers={hasPermission(user, "user.read")} panel="role-tracks" token={token} />,
  },
  "permission-settings": {
    group: "permission", title: "admin.permissionSettings.title", description: "admin.permissionSettings.navDescription",
    read: "permission.read",
    render: ({ token, user }) => <AdminAccessEditor canReadCatalog={hasPermission(user, "permission.read")} canReadUsers={hasPermission(user, "user.read")} panel="permission-settings" token={token} />,
  },
  "economy-config": {
    group: "economy", title: "admin.community.economyConfig", description: "admin.community.economyConfigDescription",
    read: "economy.read",
    render: ({ token }) => <EconomyConfigPanel token={token} />,
  },
  "currencies": {
    group: "economy", title: "admin.community.currencies", description: "admin.community.currenciesDescription",
    read: "economy.read",
    render: ({ token }) => <CurrencyManagementPanel token={token} />,
  },
  "shop-items": {
    group: "economy", title: "admin.community.shopItems", description: "admin.community.shopItemsDescription",
    read: "shop.read",
    render: ({ token }) => <ShopManagementPanel token={token} />,
  },
  "level-config": {
    group: "progression", title: "admin.community.levelConfig", description: "admin.community.levelConfigDescription",
    read: "level.read",
    render: ({ token }) => <LevelConfigPanel token={token} />,
  },
  "tasks": {
    group: "progression", title: "admin.community.tasks", description: "admin.community.tasksDescription",
    read: "task.read",
    render: ({ token }) => <TaskManagementPanel token={token} />,
  },
  "activity-monitor": {
    group: "monitoring", title: "admin.community.activity", description: "admin.community.activityDescription",
    read: "activity.read", write: "log.write",
    render: ({ token, user, access }) => <>
      <ActivityMonitorPanel token={token} />
      {hasPermission(user, "log.read") && <AdminActivityRetentionPanel token={token} canWrite={access.write} canReadUsers={hasPermission(user, "user.read")} />}
    </>,
  },
  "anti-abuse": {
    group: "monitoring", title: "antiAbuse.navTitle", description: "antiAbuse.navDescription",
    read: "security.anti-abuse.read", write: "security.anti-abuse.write",
    render: ({ token, access }) => <AdminAntiAbusePanel token={token} canWrite={access.write} />,
  },
  "oss-config": {
    group: "oss", title: "admin.panels.ossConfig", description: "admin.nav.ossConfigDesc",
    read: "oss.read", write: "oss.write",
    render: ({ token, access }) => <OSSConfigPanelV2 token={token} canWrite={access.write} />,
  },
  "oss-files": {
    group: "oss", title: "admin.panels.ossFiles", description: "admin.nav.ossFilesDesc",
    read: "oss.read", write: "oss.write",
    render: ({ token, access }) => <OSSFilesPanel token={token} canWrite={access.write} />,
  },
  "oss-uploads": {
    group: "oss", title: "admin.panels.ossUploads", description: "admin.nav.ossUploadsDesc",
    read: "oss.read",
    render: ({ token, title }) => <OSSRowsPanel token={token} title={title} endpoint="/api/v1/admin/oss/uploads" />,
  },
  "oss-scans": {
    group: "oss", title: "admin.panels.ossScans", description: "admin.nav.ossScansDesc",
    read: "oss.read",
    render: ({ token, title }) => <OSSRowsPanel token={token} title={title} endpoint="/api/v1/admin/oss/scans" />,
  },
  "oss-downloads": {
    group: "oss", title: "admin.panels.ossDownloads", description: "admin.nav.ossDownloadsDesc",
    read: "oss.read",
    render: ({ token, title }) => <OSSRowsPanel token={token} title={title} endpoint="/api/v1/admin/oss/downloads" />,
  },
  "logs-system": {
    group: "logs", title: "admin.panels.logsSystem", description: "admin.nav.logsSystemDesc",
    read: "log.read",
    render: ({ token, title }) => <RuntimeLogsPanel token={token} title={title} />,
  },
  "logs-cleanup": {
    group: "logs", title: "admin.panels.logsCleanup", description: "admin.nav.logsCleanupDesc",
    read: "log.read", write: "log.write",
    render: ({ token, access }) => <LogCleanupPanel token={token} canWrite={access.write} />,
  },
  "logs-admin": {
    group: "logs", title: "admin.panels.logsAdmin", description: "admin.nav.logsAdminDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="admin_operation" />,
  },
  "logs-permission": {
    group: "logs", title: "admin.panels.logsPermission", description: "admin.nav.logsPermissionDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="permission_change" />,
  },
  "logs-login": {
    group: "logs", title: "admin.panels.logsLogin", description: "admin.nav.logsLoginDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="login_security" />,
  },
  "logs-api": {
    group: "logs", title: "admin.panels.logsApi", description: "admin.nav.logsApiDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="api_access" />,
  },
  "logs-file-upload": {
    group: "logs", title: "admin.panels.logsFileUpload", description: "admin.nav.logsFileDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="file_upload" />,
  },
  "logs-ai": {
    group: "logs", title: "admin.panels.logsAi", description: "admin.nav.logsAiDesc",
    read: "log.read",
    render: ({ token, title }) => <LogsPanel token={token} title={title} category="ai_call" />,
  },
  "ai-providers": {
    group: "ai", title: "admin.panels.aiProviders", description: "admin.nav.aiProvidersDesc",
    read: "ai.read", write: "ai.write",
    render: ({ token, access }) => <AISettingsPanel section="providers" token={token} canWrite={access.write} />,
  },
  "ai-models": {
    group: "ai", title: "admin.panels.aiModels", description: "admin.nav.aiModelsDesc",
    read: "ai.read", write: "ai.write",
    render: ({ token, access }) => <AISettingsPanel section="models" token={token} canWrite={access.write} />,
  },
  "ai-task-models": {
    group: "ai", title: "admin.panels.aiTaskModels", description: "admin.nav.aiTaskModelsDesc",
    read: "ai.read", write: "ai.write",
    render: ({ token, access }) => <AISettingsPanel section="taskModels" token={token} canWrite={access.write} />,
  },
  "ai-costs": {
    group: "ai", title: "admin.panels.aiCosts", description: "admin.nav.aiCostsDesc",
    read: "ai.read",
    render: ({ token }) => <AICostsPanel token={token} />,
  },
  "ai-task-logs": {
    group: "ai", title: "admin.panels.aiTaskLogs", description: "admin.nav.aiTaskLogsDesc",
    read: "ai.read", execute: "ai.task.enqueue",
    render: ({ token, access }) => <AITaskLogsPanel token={token} canEnqueue={access.execute} />,
  },
  "nats": {
    group: "infrastructure", title: "admin.nats.navTitle", description: "admin.nats.navDescription",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="nats" token={token} canWrite={access.write} />,
  },
  "users": {
    group: "users", title: "admin.userList", description: "admin.usersDesc",
    read: "user.read", write: "user.write",
    render: ({ token, user, access }) => <AdminAccessEditor
      panel="users"
      token={token}
      canReadCatalog={hasPermission(user, "permission.read")}
      canReadUsers={access.read}
      canCreateUsers={access.write}
      canAssignInitialRoles={hasPermission(user, "permission.write")}
    />,
  },
  "notifications": {
    group: "notifications", title: "admin.notifications.title", description: "admin.notifications.navDescription",
    read: "notification.system.publish",
    render: ({ token }) => <SystemNotificationPanel token={token} />,
  },
  "notification-templates": {
    group: "notifications", title: "admin.notificationTemplates.title", description: "admin.notificationTemplates.navDescription",
    read: "notification.template.manage",
    render: ({ token }) => <NotificationTemplatePanel token={token} />,
  },
  "general-settings": {
    group: "system", title: "admin.generalSettings.title", description: "admin.generalSettings.description",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="general-settings" token={token} canWrite={access.write} />,
  },
  "yggdrasil": {
    group: "system", title: "admin.yggdrasil.title", description: "admin.yggdrasil.navDescription",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="yggdrasil" token={token} canWrite={access.write} />,
  },
  "mail": {
    group: "system", title: "admin.mail", description: "admin.mailDesc",
    read: "admin.config.read", write: "mail.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="mail" token={token} canWrite={access.write} />,
  },
  "auth": {
    group: "system", title: "admin.auth", description: "admin.authDesc",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="auth" token={token} canWrite={access.write} />,
  },
  "markdown": {
    group: "system", title: "admin.markdown.navTitle", description: "admin.markdown.navDesc",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="markdown" token={token} canWrite={access.write} />,
  },
  "profile-settings": {
    group: "system", title: "admin.profileSettings.navTitle", description: "admin.profileSettings.navDescription",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <AdminSettingsEditor panel="profile-settings" token={token} canWrite={access.write} />,
  },
  "minecraft-versions": {
    group: "system", title: "admin.minecraftVersions.title", description: "admin.minecraftVersions.description",
    read: "admin.config.read", write: "admin.config.write",
    render: ({ token, access }) => <MinecraftVersionConfigPanel token={token} canWrite={access.write} />,
  },
  "i18n": {
    group: "system", title: "admin.i18n", description: "admin.i18nDesc",
    read: null, execute: canTranslate,
    render: ({ token, access }) => <TranslationManagerPanel canTranslate={access.execute} token={token} />,
  },
} satisfies Record<string, AdminPanel>;

export type PanelId = keyof typeof definitions;
export const adminPanels: Record<PanelId, AdminPanel> = definitions;

const ids = Object.keys(adminPanels) as PanelId[];
export const adminNavGroups = Object.entries(groupLabels).map(([id, title]) => ({
  id, title, panels: ids.filter(panel => adminPanels[panel].group === id),
}));

export function panelAccess(user: AuthUser | null, panel: PanelId): Access {
  const { read, write, execute } = adminPanels[panel];
  const allows = (gate: Gate) => typeof gate === "function" ? gate(user) : gate === null || hasPermission(user, gate);
  const visible = allows(read);
  return { read: visible, write: visible && !!write && allows(write), execute: visible && !!execute && allows(execute) };
}
