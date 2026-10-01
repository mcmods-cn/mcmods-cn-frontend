import { reportBackendAvailability } from "./backend-status";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

let observedAuthorizationVersion = "";
let transientClientID = "";

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number;
  details?: unknown;

  constructor(message: string, status: number, code = "", retryAfter = 0, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  code?: string;
  retryAfter?: number;
  details?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (isBearerAccessToken(token)) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof window !== "undefined" && isMutation(options.method)) {
    headers.set("X-Client-ID", browserClientID());
    if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}`);
  }

  const response = await backendFetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
  });

  // Deletes such as project unfollow deliberately return no JSON body.
  // Keep requiring an envelope for other successful status codes.
  if (response.status === 204) return undefined as T;

  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearExpiredAuth();
    }
    throw new ApiError(envelope.error ?? "请求失败", response.status, envelope.code, envelope.retryAfter, envelope.details);
  }
  if (typeof envelope.data === "undefined") {
    throw new ApiError("接口响应为空", response.status);
  }
  return envelope.data;
}

export async function backendFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    observeAuthenticationHeaders(response);
    // A structured JSON 502/503/504 is an API response from our backend, not
    // proof that the whole backend is offline. Optional dependencies (OSS,
    // mail, NATS, import providers, and others) deliberately use these status
    // codes while the synchronous API remains healthy. Infrastructure gateway
    // errors normally have no MCMods JSON response, so only those should raise
    // the global outage banner. The feature that failed still receives and
    // displays its ApiError below.
    reportBackendAvailability(!isUnstructuredGatewayFailure(response));
    return response;
  } catch (error) {
    // Effect cleanup and route changes intentionally abort obsolete requests.
    // An AbortError says nothing about backend health and must not raise the
    // global outage banner.
    if (!isAbortError(error)) {
      reportBackendAvailability(false);
    }
    throw error;
  }
}

function observeAuthenticationHeaders(response: Response) {
  if (typeof window === "undefined") return;
  if (response.headers.get("x-mcmods-auth-state") === "invalid") {
    window.dispatchEvent(new Event("mcmods-auth-expired"));
    return;
  }
  const permissionVersion = response.headers.get("x-mcmods-permission-version")?.trim() ?? "";
  const rbacVersion = response.headers.get("x-mcmods-rbac-version")?.trim() ?? "";
  if (!/^\d+$/.test(permissionVersion) || !/^\d+$/.test(rbacVersion)) return;
  const version = `${permissionVersion}:${rbacVersion}`;
  if (observedAuthorizationVersion && observedAuthorizationVersion !== version) {
    window.dispatchEvent(new CustomEvent("mcmods-permissions-changed", {
      detail: { permissionVersion, rbacVersion },
    }));
  }
  observedAuthorizationVersion = version;
}

export function rememberAuthorizationVersion(permissionVersion?: number, rbacVersion?: number) {
  observedAuthorizationVersion = Number.isSafeInteger(permissionVersion) && Number(permissionVersion) > 0
    && Number.isSafeInteger(rbacVersion) && Number(rbacVersion) > 0
    ? `${permissionVersion}:${rbacVersion}`
    : "";
}

export function isUnstructuredGatewayFailure(response: Pick<Response, "status" | "headers">) {
  if (![502, 503, 504].includes(response.status)) return false;
  if (response.headers.get("x-mcmods-api-response") === "1") return false;
  // Keep the JSON fallback during rolling deployments while older backend
  // instances may not have the explicit response marker yet.
  return !response.headers.get("content-type")?.toLowerCase().includes("application/json");
}

function isMutation(method?: string) {
  return Boolean(method && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()));
}

function browserClientID() {
  const storageKey = "mcmods-client-id";
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
  } catch {
    // Browser privacy settings may block storage while cookie auth still works.
  }
  transientClientID ||= globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(storageKey, transientClientID);
  } catch {
    // Keep the same identifier for this page lifetime without requiring storage.
  }
  return transientClientID;
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function clearExpiredAuth() {
  window.dispatchEvent(new Event("mcmods-auth-expired"));
}

export function isBearerAccessToken(token?: string) {
  return Boolean(token && token.split(".").length === 3);
}
