import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "../_lib/api";
import { apiErrorMessage } from "../_lib/api-error.mts";
import { useI18n } from "../_lib/i18n-provider";
import type { NATSConfig } from "../_lib/nats-config.mts";
import { defaultMarkdownConfig, type MarkdownRendererConfig } from "../_lib/markdown-config";
import { AdminDashboardPanel, type AdminDashboardData } from "./admin-dashboard-panel";
import { AdminYggdrasilPanel, defaultAdminYggdrasilConfig, type AdminYggdrasilConfig } from "./admin-yggdrasil-panel";
import { AuthPanelV2, GeneralSettingsPanel, MailPanelV2, MarkdownConfigPanel, NATSConfigPanel, PermissionSettingsPanel, ProfileSettingsPanel, RoleTracksPanel } from "./admin-console-infrastructure";
import { PermissionCatalogEditor, PermissionGroupEditor, UserRolePanel } from "./admin-console-permissions";
import { emptyCatalog, normalizePermissionCatalog, type AdminConfig, type MailConfig, type PermissionCatalog, type User } from "./admin-console-shared";
import { UsersPanelV2 } from "./admin-console-users";

type ReadState<T> = {
  value?: T;
  error?: unknown;
};

function usePanelRead<T>(path: string, token?: string, normalize?: (value: T) => T) {
  const [state, setState] = useState<ReadState<T>>({});
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || !mounted.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState(current => current.error ? { value: current.value } : current);
    try {
      const data = await apiRequest<T>(path, { signal: controller.signal }, token);
      if (data == null) throw new Error("Missing panel data");
      const value = normalize ? normalize(data) : data;
      if (!controller.signal.aborted) setState({ value });
    } catch (error) {
      if (!controller.signal.aborted) setState(current => ({ value: current.value, error }));
    }
  }, [normalize, path, token]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, [refresh]);
  return { ...state, refresh };
}

function ReadStatus({ error, retry }: { error?: unknown; retry: () => void }) {
  const { t } = useI18n();
  if (!error) return <p role="status" className="p-3 text-sm text-[var(--muted)]">{t("common.loading")}</p>;
  return <div role="alert" className="surface flex flex-wrap items-center gap-3 p-3 text-sm">
    <span>{apiErrorMessage(error, t, t("common.loadFailed"))}</span>
    <button className="button-secondary focus-ring" type="button" onClick={retry}>{t("common.retry")}</button>
  </div>;
}

function readFeatures(value: Record<string, boolean>) {
  if (typeof value !== "object" || Array.isArray(value) || Object.values(value).some(flag => typeof flag !== "boolean")) {
    throw new Error("Invalid dashboard feature flags");
  }
  return value;
}

function DashboardFeatures({ token }: { token: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const flags = usePanelRead("/api/v1/admin/config/features", open ? token : undefined, readFeatures);
  return <details className="surface rounded-xl p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="focus-ring cursor-pointer text-sm font-black">{t("admin.dashboard.systemState")}</summary>
    {open && (flags.value && !flags.error ? <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(flags.value).map(([key, enabled]) => <span key={key} className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{key}</span>)}
    </div> : <ReadStatus error={flags.error} retry={flags.refresh} />)}
  </details>;
}

export function AdminOverview({ token, canReadConfig }: { token: string; canReadConfig: boolean }) {
  const dashboard = usePanelRead<AdminDashboardData>("/api/v1/admin/dashboard", token);
  if (!dashboard.value) return <ReadStatus error={dashboard.error} retry={dashboard.refresh} />;
  return <AdminDashboardPanel initialData={dashboard.value} token={token} featureStatus={canReadConfig && <DashboardFeatures token={token} />} />;
}

type SettingsPanel = "general-settings" | "mail" | "auth" | "profile-settings" | "yggdrasil" | "markdown" | "nats";
type AuthConfig = Pick<AdminConfig, "auth" | "oauth">;

function readSettings<T>(valid: (value: T) => boolean) {
  return (value: T) => {
    if (!valid(value)) throw new Error("Incomplete settings snapshot");
    return value;
  };
}

const readGeneral = readSettings((config: AdminConfig["general"]) => typeof config.siteName === "string" && typeof config.logoUrl === "string");
const readMail = readSettings((config: MailConfig) => typeof config.enabled === "boolean" && typeof config.host === "string"
  && Number.isFinite(config.port) && typeof config.username === "string" && typeof config.from === "string" && typeof config.useTLS === "boolean");
const readAuth = readSettings((config: AuthConfig) => Boolean(config.auth && config.oauth?.providers));
const readProfile = readSettings((config: AdminConfig["profile"]) => Number.isFinite(config.signatureMaxBytes));
const readMarkdown = readSettings((config: MarkdownRendererConfig) =>
  (Object.keys(defaultMarkdownConfig) as (keyof MarkdownRendererConfig)[]).every(key => typeof config[key] === typeof defaultMarkdownConfig[key]));
const readYggdrasil = readSettings((config: AdminYggdrasilConfig) => Array.isArray(config.trustedProxyCidrs)
  && (Object.keys(defaultAdminYggdrasilConfig) as (keyof AdminYggdrasilConfig)[]).every(key => typeof config[key] === typeof defaultAdminYggdrasilConfig[key]));
const readNATS = readSettings((config: NATSConfig) => Boolean(config.status && config.jetStream && Array.isArray(config.tasks)));

function SettingsRead<T>({ path, token, validate, editable, children }: {
  path: string; token: string; validate: (value: T) => T; editable: boolean; children: (value: T) => ReactNode;
}) {
  const config = usePanelRead(path, token, validate);
  if (!config.value) return <ReadStatus error={config.error} retry={config.refresh} />;
  return <fieldset disabled={!editable} className="min-w-0">{children(config.value)}</fieldset>;
}

export function AdminSettingsEditor({ panel, token, canWrite }: { panel: SettingsPanel; token: string; canWrite: boolean }) {
  switch (panel) {
    case "general-settings": return <SettingsRead path="/api/v1/site/config" token={token} validate={readGeneral} editable={canWrite}>
      {general => <GeneralSettingsPanel initialConfig={general} token={token} />}
    </SettingsRead>;
    case "mail": return <SettingsRead path="/api/v1/admin/config/mail" token={token} validate={readMail} editable={canWrite}>
      {mail => <MailPanelV2 config={mail} token={token} />}
    </SettingsRead>;
    case "auth": return <SettingsRead path="/api/v1/admin/config/auth" token={token} validate={readAuth} editable={canWrite}>
      {auth => <AuthPanelV2 config={auth} token={token} />}
    </SettingsRead>;
    case "profile-settings": return <SettingsRead path="/api/v1/admin/config/profile" token={token} validate={readProfile} editable={canWrite}>
      {profile => <ProfileSettingsPanel initialConfig={profile} token={token} />}
    </SettingsRead>;
    case "yggdrasil": return <SettingsRead path="/api/v1/admin/config/yggdrasil" token={token} validate={readYggdrasil} editable={canWrite}>
      {settings => <AdminYggdrasilPanel initialConfig={settings} token={token} />}
    </SettingsRead>;
    case "markdown": return <SettingsRead path="/api/v1/admin/config/markdown" token={token} validate={readMarkdown} editable={canWrite}>
      {markdown => <MarkdownConfigPanel initialConfig={markdown} token={token} />}
    </SettingsRead>;
    case "nats": return <SettingsRead path="/api/v1/admin/config/nats" token={token} validate={readNATS} editable>
      {settings => <NATSConfigPanel initialConfig={settings} token={token} canWrite={canWrite} />}
    </SettingsRead>;
  }
}

type AccessPanel = "roles" | "user-roles" | "role-tracks" | "permission-list" | "permission-settings" | "users";

export function AdminAccessEditor({ panel, token, canReadUsers, canReadCatalog }: {
  panel: AccessPanel; token: string; canReadUsers: boolean; canReadCatalog: boolean;
}) {
  const needsUsers = panel === "user-roles" || panel === "users";
  const catalog = usePanelRead<PermissionCatalog>("/api/v1/admin/permissions", canReadCatalog ? token : undefined, normalizePermissionCatalog);
  const users = usePanelRead<User[]>("/api/v1/admin/users", canReadUsers && (needsUsers || panel === "role-tracks") ? token : undefined);
  if (panel !== "users" && !catalog.value) return <ReadStatus error={catalog.error} retry={catalog.refresh} />;
  if (needsUsers && !users.value) return <ReadStatus error={users.error} retry={users.refresh} />;

  const permissions = catalog.value ?? emptyCatalog;
  const list = users.value ?? [];
  let editor: ReactNode;
  switch (panel) {
    case "roles": editor = <PermissionGroupEditor catalog={permissions} token={token} refreshCatalog={catalog.refresh} />; break;
    case "user-roles": editor = <UserRolePanel catalog={permissions} token={token} users={list} refreshUsers={users.refresh} />; break;
    case "role-tracks": editor = <RoleTracksPanel catalog={permissions} token={token} users={list} refreshUsers={users.refresh} />; break;
    case "permission-list": editor = <PermissionCatalogEditor key={JSON.stringify(permissions.permissions)} catalog={permissions} token={token} refreshCatalog={catalog.refresh} />; break;
    case "permission-settings": editor = <PermissionSettingsPanel catalog={permissions} token={token} />; break;
    case "users": editor = <UsersPanelV2 catalog={permissions} token={token} users={list} refreshUsers={users.refresh} />; break;
  }
  return <>
    {catalog.error ? <ReadStatus error={catalog.error} retry={catalog.refresh} /> : null}
    {users.error ? <ReadStatus error={users.error} retry={users.refresh} /> : null}
    {editor}
  </>;
}
