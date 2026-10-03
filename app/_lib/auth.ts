"use client";

import { writeBrowserStorage } from "./browser-storage.mts";
import { useEffect, useState } from "react";
import { API_BASE_URL, backendFetch, isBearerAccessToken, rememberAuthorizationVersion } from "./api";

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
};

export const cookieSessionToken = "cookie-session";

const authSyncKey = "mcmods-auth-sync";

let activeToken = "";
let activeUser: AuthUser | null = null;
let bootstrapRequest: Promise<AuthUser | null> | null = null;
let authGeneration = 0;
let authReady = false;
const authSubscribers = new Set<(snapshot: AuthSnapshot) => void>();
let authEventsInstalled = false;

function publishAuthSnapshot() {
  const snapshot = { ready: authReady, token: activeToken, user: activeUser };
  for (const subscriber of authSubscribers) subscriber(snapshot);
}

function expireAuthSnapshot() {
  authGeneration += 1;
  activeToken = "";
  activeUser = null;
  bootstrapRequest = null;
  authReady = true;
  rememberAuthorizationVersion();
  publishAuthSnapshot();
}

function synchronizeAuthTabs(event: StorageEvent) {
  if (event.key !== authSyncKey) return;
  if (event.newValue?.startsWith("logout:")) {
    expireAuthSnapshot();
  } else if (event.newValue?.startsWith("login:")) {
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
    // One listener set belongs to the browser module for its window lifetime.
    // Hook subscriptions are removed independently on component unmount.
    window.addEventListener("storage", synchronizeAuthTabs);
    window.addEventListener("mcmods-auth-change", publishAuthSnapshot);
    window.addEventListener("mcmods-auth-expired", expireAuthSnapshot);
    window.addEventListener("mcmods-permissions-changed", refreshAuthPermissions);
  }
  subscriber({ ready: authReady, token: activeToken, user: activeUser });
  if (!authReady) void bootstrapAuth();
  return () => { authSubscribers.delete(subscriber); };
}

export function saveAuth(result: AuthResult) {
  authGeneration += 1;
  bootstrapRequest = null;
  activeToken = result.token || cookieSessionToken;
  activeUser = normalizeAuthUser(result.user);
  authReady = true;
  rememberAuthorizationVersion(activeUser.permissionVersion, activeUser.rbacVersion);
  broadcastAuthChange("login");
  window.dispatchEvent(new Event("mcmods-auth-change"));
}

export function clearAuth() {
  if (authReady && !activeToken && !activeUser) return;
  authGeneration += 1;
  const logoutToken = activeToken;
  activeToken = "";
  activeUser = null;
  authReady = true;
  rememberAuthorizationVersion();
  bootstrapRequest = null;
  broadcastAuthChange("logout");
  window.dispatchEvent(new Event("mcmods-auth-change"));

  const headers = new Headers();
  if (isBearerAccessToken(logoutToken)) headers.set("Authorization", `Bearer ${logoutToken}`);
  void backendFetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers,
  }).catch(() => undefined);
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
        clearAuth();
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
  if (hasPermission(user, "content.review") || hasPermission(user, "project.review")) return true;
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

async function bootstrapAuth(force = false) {
  if (activeUser && !force) return activeUser;
  if (bootstrapRequest) return bootstrapRequest;
  const generation = authGeneration;
  const request = backendFetch(`${API_BASE_URL}/api/v1/auth/me`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 401 && generation === authGeneration) {
          activeToken = "";
          activeUser = null;
          rememberAuthorizationVersion();
        }
        return null;
      }
      const envelope = (await response.json()) as { data?: AuthUser };
      if (!envelope.data || generation !== authGeneration) return null;
      activeToken = cookieSessionToken;
      activeUser = normalizeAuthUser(envelope.data);
      rememberAuthorizationVersion(activeUser.permissionVersion, activeUser.rbacVersion);
      return activeUser;
    })
    .catch(() => null)
    .finally(() => {
      if (bootstrapRequest === request) bootstrapRequest = null;
      if (generation === authGeneration) {
        authReady = true;
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

function broadcastAuthChange(kind: "login" | "logout") {
  if (typeof window === "undefined") return;
  writeBrowserStorage(authSyncKey, `${kind}:${Date.now()}:${Math.random()}`);
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
