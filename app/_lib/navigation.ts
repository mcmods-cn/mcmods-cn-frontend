const INTERNAL_URL_ORIGIN = "https://mcmods.local";

export function normalizeInternalPath(value: unknown) {
  if (typeof value !== "string") return "";
  const path = value.trim();
  if (!path || path.length > 2048 || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "";
  try {
    const parsed = new URL(path, INTERNAL_URL_ORIGIN);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (parsed.origin !== INTERNAL_URL_ORIGIN || decodedPath.startsWith("//") || decodedPath.includes("\\")) return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}
