import { normalizeInternalPath } from "./navigation.ts";

export const oauthProviders = [
  { key: "wechat", label: "WeChat" },
  { key: "qq", label: "QQ" },
  { key: "google", label: "Google" },
  { key: "github", label: "GitHub" },
] as const;

export function oauthProviderStartPath(provider: string, returnTo: unknown) {
  if (!oauthProviders.some(item => item.key === provider)) return "";
  const query = new URLSearchParams({ provider });
  const next = normalizeInternalPath(returnTo);
  if (next) query.set("next", next);
  return `/login/provider?${query}`;
}

export function oauthProviderRedirect(apiBaseURL: string, provider: unknown, returnTo: unknown) {
  if (typeof provider !== "string" || !oauthProviders.some(item => item.key === provider)) return "";
  const next = normalizeInternalPath(returnTo);
  return `${apiBaseURL}/api/v1/auth/oauth/${provider}/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
}
