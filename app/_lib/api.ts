export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
  });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearExpiredAuth();
    }
    throw new ApiError(envelope.error ?? "请求失败", response.status);
  }
  if (typeof envelope.data === "undefined") {
    throw new ApiError("接口响应为空", response.status);
  }
  return envelope.data;
}

function clearExpiredAuth() {
  for (const key of ["mcmods-token", "mcmods-admin-token", "mcmods-user", "mcmods-admin-user"]) {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event("mcmods-auth-expired"));
}

export function isBearerAccessToken(token?: string) {
  return Boolean(token && token.split(".").length === 3);
}
