"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, isBearerAccessToken } from "./api";

export type AuthPermissionRule = {
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

export function saveAuth(result: AuthResult) {
  activeToken = result.token || cookieSessionToken;
  activeUser = result.user;
  broadcastAuthChange("login");
  window.dispatchEvent(new Event("mcmods-auth-change"));
}

export function clearAuth() {
  const logoutToken = activeToken;
  activeToken = "";
  activeUser = null;
  bootstrapRequest = null;
  broadcastAuthChange("logout");
  window.dispatchEvent(new Event("mcmods-auth-change"));

  const headers = new Headers();
  if (isBearerAccessToken(logoutToken)) headers.set("Authorization", `Bearer ${logoutToken}`);
  void fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers,
  }).catch(() => undefined);
}

export function useAuthSnapshot(): AuthSnapshot {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ ready: false, token: "", user: null });

  useEffect(() => {
    let cancelled = false;
    const publish = (ready = true) => {
      if (!cancelled) setSnapshot({ ready, token: activeToken, user: activeUser });
    };
    const refresh = () => {
      if (activeUser) {
        publish();
        return;
      }
      publish(false);
      void bootstrapAuth().then(() => publish());
    };
    const expire = () => {
      activeToken = "";
      activeUser = null;
      bootstrapRequest = null;
      publish();
    };
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== authSyncKey) return;
      if (event.newValue?.startsWith("logout:")) {
        expire();
        return;
      }
      activeToken = "";
      activeUser = null;
      bootstrapRequest = null;
      refresh();
    };

    refresh();
    window.addEventListener("storage", syncAcrossTabs);
    window.addEventListener("mcmods-auth-change", refresh);
    window.addEventListener("mcmods-auth-expired", expire);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", syncAcrossTabs);
      window.removeEventListener("mcmods-auth-change", refresh);
      window.removeEventListener("mcmods-auth-expired", expire);
    };
  }, []);

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

export function hasPermission(user: AuthUser | null | undefined, required: string) {
  if (!user) return false;
  let selected: AuthPermissionRule | undefined;
  let selectedSpecificity = -1;
  for (const rule of user.permissionRules) {
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

async function bootstrapAuth() {
  if (activeUser) return activeUser;
  if (bootstrapRequest) return bootstrapRequest;
  bootstrapRequest = fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const envelope = (await response.json()) as { data?: AuthUser };
      if (!envelope.data) return null;
      activeToken = cookieSessionToken;
      activeUser = envelope.data;
      return activeUser;
    })
    .catch(() => null)
    .finally(() => {
      bootstrapRequest = null;
    });
  return bootstrapRequest;
}

function broadcastAuthChange(kind: "login" | "logout") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(authSyncKey, `${kind}:${Date.now()}:${Math.random()}`);
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
