"use client";

import { readBrowserStorage, writeBrowserStorage } from "./browser-storage.mts";
import { useEffect, useState } from "react";
import { API_BASE_URL, advanceAuthenticationGeneration, apiRequest, ApiError, backendFetch, isBearerAccessToken, rememberAuthorizationVersion } from "./api";
import { runAuthenticationMutation } from "./authentication-mutation.mts";

type AuthPermissionRule = {
  code: string;
  allow: boolean;
  priority: number;
  source?: string;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  roleCodes: string[];
  permissionRules: AuthPermissionRule[];
  permissionVersion: number;
  rbacVersion: number;
  avatarUrl?: string;
  signature?: string;
};

export type AuthResult = {
  token?: string;
  user: AuthUser;
};

export type AuthSnapshot = {
  ready: boolean;
  token: string;
  user: AuthUser | null;
  error?: string;
  retryAt?: number;
  logoutStatus?: "pending" | "retry" | "revoked";
};

export const cookieSessionToken = "cookie-session";

const authSyncKey = "mcmods-auth-sync";
const profileSyncKey = "mcmods-profile-update";

let activeToken = "";
let activeUser: AuthUser | null = null;
let bootstrapRequest: Promise<AuthUser | null> | null = null;
let authGeneration = 0;
let authReady = false;
let authError = "";
let authRetryAt = 0;
type LogoutIntent = { id: string; token: string; revoked: boolean; request?: Promise<boolean> };
let logoutIntent: LogoutIntent | undefined;
const authSubscribers = new Set<(snapshot: AuthSnapshot) => void>();
let authEventsInstalled = false;

function currentSnapshot(): AuthSnapshot {
  const logoutStatus = logoutIntent?.request ? "pending" : logoutIntent?.revoked ? "revoked" : logoutIntent ? "retry" : undefined;
  return { ready: authReady, token: activeToken, user: activeUser, error: authError, retryAt: authRetryAt, logoutStatus };
}

function publishAuthSnapshot() {
  const snapshot = currentSnapshot();
  for (const subscriber of authSubscribers) subscriber(snapshot);
}

function expireAuthSnapshot() {
  authGeneration += 1;
  advanceAuthenticationGeneration();
  authError = "";
  authRetryAt = 0;
  activeToken = "";
  activeUser = null;
  bootstrapRequest = null;
  authReady = true;
  rememberAuthorizationVersion();
  publishAuthSnapshot();
}

function syncLogoutIntent(marker: string | null) {
  const match = /^(logout-pending|logout-revoked):(.+)$/.exec(marker ?? "");
  if (!match) return false;
  if (logoutIntent?.id !== match[2]) logoutIntent = { id: match[2], token: "", revoked: false };
  logoutIntent.revoked ||= match[1] === "logout-revoked";
  expireAuthSnapshot();
  return true;
}

function synchronizeAuthTabs(event: StorageEvent) {
  if (event.key === profileSyncKey && activeUser && event.newValue?.startsWith(`${activeUser.id}:`)) {
    void bootstrapAuth(true);
    return;
  }
  if (event.key !== authSyncKey || (event.storageArea && readBrowserStorage(authSyncKey) !== event.newValue)) return;
  if (syncLogoutIntent(event.newValue)) return;
  if (event.newValue?.startsWith("logout:")) {
    logoutIntent = undefined;
    expireAuthSnapshot();
  } else if (event.newValue?.startsWith("login:")) {
    logoutIntent = undefined;
    // Invalidate once for the whole module, rather than once for every hook.
    expireAuthSnapshot();
    authReady = false;
    publishAuthSnapshot();
    void bootstrapAuth();
  }
}

function refreshAuthPermissions() {
  void bootstrapAuth(true);
}

function subscribeAuthSnapshot(subscriber: (snapshot: AuthSnapshot) => void) {
  authSubscribers.add(subscriber);
  if (!authEventsInstalled) {
    authEventsInstalled = true;
    syncLogoutIntent(readBrowserStorage(authSyncKey));
    // One listener set belongs to the browser module for its window lifetime.
    // Hook subscriptions are removed independently on component unmount.
    window.addEventListener("storage", synchronizeAuthTabs);
    window.addEventListener("mcmods-auth-expired", expireAuthSnapshot);
    window.addEventListener("mcmods-permissions-changed", refreshAuthPermissions);
  }
  subscriber(currentSnapshot());
  if (!authReady && !authError) void bootstrapAuth();
  return () => { authSubscribers.delete(subscriber); };
}

function syncID() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
}

export function saveAuth(result: AuthResult) {
  logoutIntent = undefined;
  authGeneration += 1;
  advanceAuthenticationGeneration();
  bootstrapRequest = null;
  authError = "";
  authRetryAt = 0;
  activeToken = result.token || cookieSessionToken;
  activeUser = normalizeAuthUser(result.user);
  authReady = true;
  rememberAuthorizationVersion(activeUser.permissionVersion, activeUser.rbacVersion);
  writeBrowserStorage(authSyncKey, `login:${syncID()}`);
  publishAuthSnapshot();
}

export function updateAuthProfile(user: AuthUser, fields: Pick<AuthUser, "username" | "avatarUrl" | "signature">) {
  // A response to an edit cannot establish a session or update a new actor.
  if (user !== activeUser || logoutIntent) return;
  activeUser = { ...user, ...fields };
  writeBrowserStorage(profileSyncKey, `${user.id}:${syncID()}`);
  publishAuthSnapshot();
}

function ownsLogout(intent: LogoutIntent) {
  const marker = readBrowserStorage(authSyncKey);
  return logoutIntent === intent && (marker === `logout-pending:${intent.id}` || marker === `logout-revoked:${intent.id}`);
}

function submitLogout(intent: LogoutIntent): Promise<boolean> {
  if (intent.request) return intent.request;
  const request = runAuthenticationMutation(API_BASE_URL, async ({ fetch: fetcher, assertCurrent }) => {
    // A retry queued in another tab must never revoke a newer login.
    if (!ownsLogout(intent)) return false;
    // The current site uses cookies. Older bearer-only clients can retry from
    // the tab holding the credential, without storing or substituting a token.
    if (intent.id.startsWith("bearer:") && !isBearerAccessToken(intent.token)) return false;
    try {
      const response = await apiRequest<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }, intent.token, fetcher);
      if (response?.ok !== true) return false;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const details = error.details as { committed?: boolean; operation?: string } | null;
      if (error.code === "SECURITY_VERSION_REFRESH_FAILED" && details?.committed === true && details.operation === "logout" && ownsLogout(intent)) {
        intent.revoked = true;
        writeBrowserStorage(authSyncKey, `logout-revoked:${intent.id}`);
      }
      // The protected endpoint also returns 401 for an already revoked cookie.
      if (error.status !== 401) return false;
    }
    assertCurrent();
    if (!ownsLogout(intent)) return false;
    // Publish while holding the same write lock as sign-in and registration.
    writeBrowserStorage(authSyncKey, `logout:${intent.id}`);
    logoutIntent = undefined;
    expireAuthSnapshot();
    return true;
  }).catch(() => false).finally(() => {
    if (logoutIntent !== intent) return;
    intent.request = undefined;
    publishAuthSnapshot();
  });
  intent.request = request;
  return request;
}

export function clearAuth(): Promise<boolean> {
  if (logoutIntent) {
    const request = submitLogout(logoutIntent);
    publishAuthSnapshot();
    return request;
  }
  if (authReady && !activeToken && !activeUser) return Promise.resolve(true);
  const id = `${isBearerAccessToken(activeToken) ? "bearer" : "cookie"}:${syncID()}`;
  const intent: LogoutIntent = { id, token: activeToken, revoked: false };
  logoutIntent = intent;
  // Reserve a place among cookie writers before publishing the local dismissal.
  const request = submitLogout(intent);
  // Only a non-secret intent ID crosses tabs or survives a reload.
  writeBrowserStorage(authSyncKey, `logout-pending:${intent.id}`);
  expireAuthSnapshot();
  return request;
}

export function useAuthSnapshot(): AuthSnapshot {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ ready: false, token: "", user: null });

  useEffect(() => subscribeAuthSnapshot(setSnapshot), []);

  useEffect(() => {
    const expiresAt = tokenExpiresAt(snapshot.token);
    if (!expiresAt) return;
    let timer = 0;
    const checkExpiration = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        if (activeToken === snapshot.token) expireAuthSnapshot();
        return;
      }
      timer = window.setTimeout(checkExpiration, Math.min(remaining, 2_147_000_000));
    };
    checkExpiration();
    return () => window.clearTimeout(timer);
  }, [snapshot.token]);

  return snapshot;
}

export function canAccessAdmin(user: AuthUser | null) {
  return hasPermission(user, "admin.access");
}

export function canAccessReviewQueue(user: AuthUser | null) {
  if (hasPermission(user, "content.review") || hasPermission(user, "project.review") || hasPermission(user, "project.review.*")) return true;
  return user?.permissionRules.some((rule) => {
    const code = rule.code.toLowerCase().trim();
    return code.startsWith("project.review.")
      && !/[<>*\[\]]/.test(code)
      && hasPermission(user, code);
  }) === true;
}

export function hasPermission(user: AuthUser | null | undefined, required: string) {
  if (!user) return false;
  let selected: AuthPermissionRule | undefined;
  let selectedSpecificity = -1;
  for (const rule of user.permissionRules ?? []) {
    const specificity = permissionSpecificity(rule.code, required);
    if (specificity < 0) continue;
    if (!selected || rule.priority > selected.priority
      || (rule.priority === selected.priority && specificity > selectedSpecificity)
      || (rule.priority === selected.priority && specificity === selectedSpecificity && !rule.allow && selected.allow)) {
      selected = rule;
      selectedSpecificity = specificity;
    }
  }
  return selected?.allow === true;
}

function permissionSpecificity(rule: string, required: string) {
  if (rule === "*" || rule === "admin.*") return 0;
  if (rule === required) return rule.length + 10_000;
  if (rule.endsWith(".*") && required.startsWith(rule.slice(0, -1))) return rule.length - 1;
  return -1;
}

export function retryAuthentication() {
  if (Date.now() < authRetryAt) return Promise.resolve(null);
  return bootstrapAuth(true);
}

async function bootstrapAuth(force = false) {
  if (logoutIntent) return null;
  if (activeUser && !force) return activeUser;
  if (bootstrapRequest) return bootstrapRequest;
  const generation = authGeneration;
  const request = backendFetch(`${API_BASE_URL}/api/v1/auth/me`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        if (generation !== authGeneration) return null;
        if (response.status === 401) {
          authError = "";
          authRetryAt = 0;
          activeToken = "";
          activeUser = null;
          rememberAuthorizationVersion();
        } else {
          authError = String(response.status);
          const retry = response.headers.get("retry-after") || "";
          const seconds = /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
          authRetryAt = Date.now() + (Number.isFinite(seconds) ? Math.min(seconds, Number.MAX_SAFE_INTEGER - Date.now()) : 0);
        }
        return null;
      }
      const envelope = (await response.json()) as { data?: AuthUser };
      if (!envelope.data || generation !== authGeneration) return null;
      authError = "";
      authRetryAt = 0;
      activeToken = cookieSessionToken;
      activeUser = normalizeAuthUser(envelope.data);
      rememberAuthorizationVersion(activeUser.permissionVersion, activeUser.rbacVersion);
      return activeUser;
    })
    .catch(() => { if (generation === authGeneration) authError = "network"; return null; })
    .finally(() => {
      if (bootstrapRequest === request) bootstrapRequest = null;
      if (generation === authGeneration) {
        authReady = !authError || Boolean(activeUser);
        publishAuthSnapshot();
      }
    });
  bootstrapRequest = request;
  return request;
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    roleCodes: Array.isArray(user.roleCodes) ? user.roleCodes : [],
    permissionRules: Array.isArray(user.permissionRules) ? user.permissionRules : [],
    permissionVersion: Number.isSafeInteger(user.permissionVersion) && user.permissionVersion > 0 ? user.permissionVersion : 1,
    rbacVersion: Number.isSafeInteger(user.rbacVersion) && user.rbacVersion > 0 ? user.rbacVersion : 1,
  };
}

function tokenExpiresAt(token: string): number | null {
  if (!isBearerAccessToken(token) || typeof window === "undefined") return null;
  const payload = token.split(".")[1];
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
