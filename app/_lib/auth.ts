"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  permissions: string[];
  avatarUrl?: string;
  signature?: string;
};

export type AuthResult = {
  token: string;
  user: AuthUser;
};

export type AuthSnapshot = {
  ready: boolean;
  token: string;
  user: AuthUser | null;
};

const tokenKeys = ["mcmods-token", "mcmods-admin-token"] as const;
const userKeys = ["mcmods-user", "mcmods-admin-user"] as const;

export function saveAuth(result: AuthResult) {
  const userJson = JSON.stringify(result.user);
  for (const key of tokenKeys) {
    window.localStorage.setItem(key, result.token);
  }
  for (const key of userKeys) {
    window.localStorage.setItem(key, userJson);
  }
  window.dispatchEvent(new Event("mcmods-auth-change"));
}

export function clearAuth() {
  let changed = false;
  for (const key of tokenKeys) {
    changed ||= window.localStorage.getItem(key) !== null;
    window.localStorage.removeItem(key);
  }
  for (const key of userKeys) {
    changed ||= window.localStorage.getItem(key) !== null;
    window.localStorage.removeItem(key);
  }
  if (changed) {
    window.dispatchEvent(new Event("mcmods-auth-change"));
  }
}

function readAuthSnapshot() {
  const token = readFirst(tokenKeys);
  const savedUser = readFirst(userKeys);
  return {
    token,
    user: token && !isTokenExpired(token) ? parseStoredUser(savedUser) : null,
  };
}

export function useAuthSnapshot(): AuthSnapshot {
  const serialized = useSyncExternalStore(subscribeAuth, readSerializedAuth, () => "");
  const snapshot = useMemo(() => parseSerializedAuth(serialized), [serialized]);

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
  if (!user) {
    return false;
  }
  return (
    user.permissions.includes("admin.access") ||
    user.permissions.includes("admin.*") ||
    user.roles.includes("super_admin") ||
    user.roles.includes("admin")
  );
}

function readFirst(keys: readonly string[]) {
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }
  return "";
}

function subscribeAuth(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("mcmods-auth-change", onStoreChange);
  queueMicrotask(onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("mcmods-auth-change", onStoreChange);
  };
}

function readSerializedAuth() {
  const { token, user } = readAuthSnapshot();
  return JSON.stringify({ token, user });
}

function parseSerializedAuth(serialized: string): AuthSnapshot {
  if (!serialized) {
    return { ready: false, token: "", user: null };
  }
  try {
    const snapshot = JSON.parse(serialized) as Omit<AuthSnapshot, "ready">;
    return { ready: true, token: snapshot.token ?? "", user: snapshot.user ?? null };
  } catch {
    return { ready: true, token: "", user: null };
  }
}

function parseStoredUser(savedUser: string) {
  if (!savedUser) {
    return null;
  }
  try {
    return JSON.parse(savedUser) as AuthUser;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string) {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt <= Date.now();
}

function tokenExpiresAt(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload || typeof window === "undefined") return null;
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
