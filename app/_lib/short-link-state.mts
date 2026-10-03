import { normalizeInternalPath } from "./navigation.ts";

export type ShortLinkState = "loading" | "not_found" | "error";

export function classifyShortLinkFailure(apiStatus?: number): Exclude<ShortLinkState, "loading"> {
  return apiStatus === 404 || apiStatus === 410 ? "not_found" : "error";
}

// Short codes navigate within the application; API strings never authorize
// arbitrary schemes, credentials or an external origin.
export function resolveSafeShortLinkTarget(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\\\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    if (!["http:", "https:"].includes(target.protocol) || target.origin !== base.origin || target.username || target.password) return undefined;
    if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return undefined;
    // A root-relative path must not turn into a scheme-relative redirect when
    // handed to a router, including repeated slashes after URL normalization.
    return normalizeInternalPath(`${target.pathname}${target.search}${target.hash}`) || undefined;
  } catch {
    return undefined;
  }
}
