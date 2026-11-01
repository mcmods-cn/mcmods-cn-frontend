import { reportBackendAvailability } from "./backend-status";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage.mts";
import { ApiError } from "./api-error.mts";
import { resolvePublicAPIBaseURL } from "./deployment-env.mts";
export { ApiError } from "./api-error.mts";

export const API_BASE_URL = resolvePublicAPIBaseURL(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

let observedAuthorizationVersion = "";
let authenticationGeneration = 0;

export function advanceAuthenticationGeneration() {
  authenticationGeneration += 1;
  observedAuthorizationVersion = "";
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
  fetcher?: typeof fetch,
): Promise<T> {
  const generation = authenticationGeneration;
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
  }, fetcher);

  // DELETE endpoints intentionally return an empty 204 response.
  if (response.status === 204) return undefined as T;

  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    // Invalid submitted credentials do not prove that an existing cookie
    // session has expired. Explicit invalid-auth headers are still observed by
    // backendFetch; protected reads and auth/me retain normal 401 handling.
    const credentialSubmission = path === "/api/v1/auth/login"
      || path === "/api/v1/auth/email-login"
      || path === "/api/v1/auth/register";
    if (response.status === 401 && !credentialSubmission && generation === authenticationGeneration && typeof window !== "undefined") {
      clearExpiredAuth();
    }
    throw new ApiError(envelope.error ?? "请求失败", response.status, envelope.code, envelope.retryAfter, envelope.details);
  }
  if (typeof envelope.data === "undefined") {
    throw new ApiError("API response is missing data", response.status, "API_RESPONSE_EMPTY");
  }
  return envelope.data;
}

export async function backendFetch(input: RequestInfo | URL, init?: RequestInit, fetcher: typeof fetch = fetch) {
  const generation = authenticationGeneration;
  try {
    const response = await fetcher(input, init);
    if (generation === authenticationGeneration) observeAuthenticationHeaders(response);
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
  const existing = readBrowserStorage(storageKey);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeBrowserStorage(storageKey, value);
  return value;
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
