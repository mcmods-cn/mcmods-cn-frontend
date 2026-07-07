"use client";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type AuthResult = {
  token: string;
  user: AuthUser;
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
  for (const key of tokenKeys) {
    window.localStorage.removeItem(key);
  }
  for (const key of userKeys) {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event("mcmods-auth-change"));
}

export function readAuthSnapshot() {
  const token = readFirst(tokenKeys);
  const savedUser = readFirst(userKeys);
  return {
    token,
    user: parseStoredUser(savedUser),
  };
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
