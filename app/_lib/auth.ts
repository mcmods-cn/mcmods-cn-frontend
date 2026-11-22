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

type SessionIdentity = AuthUser & { sessionMarker?: string };

export type AuthResult = {
  sessionMarker?: string;
  token?: string;
  user: AuthUser;
};

export type AuthSnapshot = {
  generation: number;
  ready: boolean;
  token: string;
  user: AuthUser | null;
  error?: string;
  retryAt?: number;
  logoutStatus?: "pending" | "checking" | "retry" | "revoked" | "check" | "choose" | "source";
};

export const cookieSessionToken = "cookie-session";

const authSyncKey = "mcmods-auth-sync";
const profileSyncKey = "mcmods-profile-update";

let activeToken = "";
let activeSessionMarker = "";
let activeUser: AuthUser | null = null;
let bootstrapRequest: Promise<AuthUser | null> | null = null;
let authGeneration = 0;
let authReady = false;
let authError = "";
let authRetryAt = 0;
type SavedLogout = { id: string; sessionMarker: string; state: "retry" | "revoked" | "check" };
type LogoutIntent = SavedLogout & { token: string; offerCurrent?: boolean; checking?: boolean; request?: Promise<boolean> };
let logoutIntent: LogoutIntent | undefined;
const authSubscribers = new Set<(snapshot: AuthSnapshot) => void>();
let authEventsInstalled = false;

function currentSnapshot(): AuthSnapshot {
  let logoutStatus: AuthSnapshot["logoutStatus"] = logoutIntent?.state;
  if (logoutIntent?.id.startsWith("bearer:") && !logoutIntent.token) logoutStatus = "source";
  if (logoutIntent?.offerCurrent) logoutStatus = "choose";
  if (logoutIntent?.request) logoutStatus = logoutIntent.checking ? "checking" : "pending";
  return { generation: authGeneration, ready: authReady, token: activeToken, user: activeUser, error: authError, retryAt: authRetryAt, logoutStatus };
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
  activeSessionMarker = "";
  activeUser = null;
  bootstrapRequest = null;
  authReady = true;
  rememberAuthorizationVersion();
  publishAuthSnapshot();
}

function readAuthSync() { return readBrowserStorage(authSyncKey, true); }
function writeAuthSync(value: string) { writeBrowserStorage(authSyncKey, value, true); }

// This digest identifies a session but cannot authenticate a request.
function validSessionMarker(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}

function pendingLogoutMarker(value: string | null): SavedLogout | undefined {
  if (!value || value.length > 512) return;
  const bound = /^signout-(retry|revoked|check):(-|[A-Za-z0-9_-]{43}):((?:cookie|bearer):.+)$/.exec(value);
  if (bound) return { state: bound[1] as SavedLogout["state"], sessionMarker: validSessionMarker(bound[2]), id: bound[3] };
  const old = /^logout-(pending|revoked):(.+)$/.exec(value);
  if (old) return { state: old[1] === "revoked" ? "revoked" : "check", sessionMarker: "", id: old[2] };
}

function storeLogout(intent: SavedLogout) {
  // Older clients ignore this prefix, so cannot replay our conditional intent
  // at their unconditional endpoint. No token or account data is persisted.
  writeAuthSync(`signout-${intent.state}:${intent.sessionMarker || "-"}:${intent.id}`);
}

export function hasUnconfirmedLogout() {
  return Boolean(logoutIntent || pendingLogoutMarker(readAuthSync()));
}

function syncLogoutIntent(marker: string | null) {
  const saved = pendingLogoutMarker(marker);
  if (!saved) return false;
  if (logoutIntent?.id === saved.id) Object.assign(logoutIntent, saved);
  else logoutIntent = { ...saved, token: "" };
  expireAuthSnapshot();
  return true;
}

function synchronizeAuthTabs(event: StorageEvent) {
  if (event.key === profileSyncKey && activeUser && event.newValue?.startsWith(`${activeUser.id}:`)) {
    void bootstrapAuth(true);
    return;
  }
  if (event.key !== authSyncKey || (event.storageArea && readAuthSync() !== event.newValue)) return;
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
    syncLogoutIntent(readAuthSync());
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
  activeSessionMarker = validSessionMarker(result.sessionMarker);
  activeUser = normalizeAuthUser(result.user);
  authReady = true;
  rememberAuthorizationVersion(activeUser.permissionVersion, activeUser.rbacVersion);
  writeAuthSync(`login:${syncID()}`);
  publishAuthSnapshot();
}

// The OAuth return page reads a cookie already set by the server callback.
// A bookmarked return URL alone is not evidence of a new credential write.
export async function acceptOAuthSession(isCurrent: () => boolean): Promise<AuthUser | null> {
  const marker = readAuthSync();
  const generation = authGeneration;
  if (logoutIntent || pendingLogoutMarker(marker)) return null;
  const { sessionMarker, ...user } = await apiRequest<SessionIdentity>("/api/v1/auth/me");
  if (!isCurrent() || generation !== authGeneration || readAuthSync() !== marker) return null;
  saveAuth({ token: cookieSessionToken, user, sessionMarker });
  return user;
}

export function updateAuthProfile(user: AuthUser, fields: Pick<AuthUser, "username" | "avatarUrl" | "signature">) {
  // A response to an edit cannot establish a session or update a new actor.
  if (user !== activeUser || logoutIntent) return;
  activeUser = { ...user, ...fields };
  writeBrowserStorage(profileSyncKey, `${user.id}:${syncID()}`);
  publishAuthSnapshot();
}

function ownsLogout(intent: LogoutIntent) {
  return logoutIntent === intent && pendingLogoutMarker(readAuthSync())?.id === intent.id;
}

function confirmLogout(intent: LogoutIntent) {
  if (!ownsLogout(intent)) return false;
  writeAuthSync(`logout:${intent.id}`);
  logoutIntent = undefined;
  expireAuthSnapshot();
  return true;
}

// An old or superseded intent may inspect the current cookie, never adopt it
// as the target of a retry. Keep the private UI closed on a read failure.
async function inspectCurrentSession(intent: LogoutIntent, assertCurrent: () => void) {
  try {
    const bearer = isBearerAccessToken(intent.token);
    const { sessionMarker, ...user } = await apiRequest<SessionIdentity>("/api/v1/auth/me", { cache: "no-store", credentials: bearer ? "omit" : "include" }, intent.token);
    assertCurrent();
    if (ownsLogout(intent) && user.id) saveAuth({ user, sessionMarker, token: bearer ? intent.token : undefined });
  } catch (error) {
    assertCurrent();
    if (error instanceof ApiError && error.status === 401) return confirmLogout(intent);
  }
  return false;
}

function submitLogout(intent: LogoutIntent, explicitCurrent = false): Promise<boolean> {
  if (intent.request) return intent.request;
  const bearer = isBearerAccessToken(intent.token);
  // A legacy bearer never survives a reload. Its original tab owns the retry.
  if (intent.id.startsWith("bearer:") && !bearer) return Promise.resolve(false);
  const checkOnly = !explicitCurrent && (intent.state === "check" || (!intent.sessionMarker && !bearer));
  intent.checking = checkOnly;
  intent.offerCurrent = false;
  const request = runAuthenticationMutation(API_BASE_URL, async ({ fetch: fetcher, assertCurrent }) => {
    if (!ownsLogout(intent)) return false;
    if (checkOnly) return inspectCurrentSession(intent, assertCurrent);
    try {
      const path = intent.sessionMarker ? "/api/v1/auth/logout/if-current" : "/api/v1/auth/logout";
      const response = await apiRequest<{ ok: boolean }>(path, {
        method: "POST",
        credentials: bearer ? "omit" : "include",
        body: intent.sessionMarker ? JSON.stringify({ sessionMarker: intent.sessionMarker }) : undefined,
      }, intent.token, fetcher);
      if (response?.ok !== true) return false;
    } catch (error) {
      assertCurrent();
      if (!(error instanceof ApiError) || !ownsLogout(intent)) return false;
      if (error.status === 401) return confirmLogout(intent);
      const details = error.details as { committed?: boolean; operation?: string } | null;
      if (error.code === "SECURITY_VERSION_REFRESH_FAILED" && details?.committed === true && details.operation === "logout") {
        intent.state = "revoked";
      } else if (intent.sessionMarker && error.status === 409 && error.code === "AUTH_SESSION_CHANGED") {
        intent.state = "check";
        storeLogout(intent);
        intent.checking = true;
        publishAuthSnapshot();
        return inspectCurrentSession(intent, assertCurrent);
      } else if (intent.sessionMarker && (error.status === 404 || error.status === 405)) {
        // An older replica cannot process a conditional write. Never downgrade it.
        intent.state = "check";
      }
      storeLogout(intent);
      return false;
    }
    assertCurrent();
    return confirmLogout(intent);
  }).catch(() => false).finally(() => {
    if (logoutIntent !== intent) return;
    intent.request = undefined;
    intent.checking = false;
    publishAuthSnapshot();
  });
  intent.request = request;
  return request;
}

export function signOutCurrentBrowserSession(): Promise<boolean> {
  const intent = logoutIntent;
  if (!intent?.offerCurrent || !ownsLogout(intent)) return Promise.resolve(false);
  const request = submitLogout(intent, true);
  publishAuthSnapshot();
  return request;
}

export function clearAuth(): Promise<boolean> {
  if (!logoutIntent) syncLogoutIntent(readAuthSync());
  if (logoutIntent) {
    const request = submitLogout(logoutIntent);
    publishAuthSnapshot();
    return request;
  }
  if (authReady && !activeToken && !activeUser) return Promise.resolve(true);
  const bearer = isBearerAccessToken(activeToken);
  const bound = Boolean(activeSessionMarker || bearer);
  const intent: LogoutIntent = {
    id: `${bearer ? "bearer" : "cookie"}:${syncID()}`,
    sessionMarker: activeSessionMarker,
    token: activeToken,
    state: bound ? "retry" : "check",
    offerCurrent: !bound && Boolean(activeUser),
  };
  logoutIntent = intent;
  storeLogout(intent);
  // Reserve the write before delivering the local dismissal to subscribers.
  const request = bound ? submitLogout(intent) : Promise.resolve(false);
  expireAuthSnapshot();
  return request;
}

export function useAuthSnapshot(): AuthSnapshot {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ generation: 0, ready: false, token: "", user: null });

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
          activeSessionMarker = "";
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
      const envelope = (await response.json()) as { data?: SessionIdentity };
      if (!envelope.data || generation !== authGeneration) return null;
      authError = "";
      authRetryAt = 0;
      activeToken = cookieSessionToken;
      const { sessionMarker, ...user } = envelope.data;
      activeSessionMarker = validSessionMarker(sessionMarker);
      activeUser = normalizeAuthUser(user);
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
