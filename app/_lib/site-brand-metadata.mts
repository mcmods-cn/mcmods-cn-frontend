export const defaultMetadataSiteName = "Mcmods-cn";

export function normalizeMetadataSiteName(value: unknown) {
  if (typeof value !== "string") return defaultMetadataSiteName;
  const normalized = value.trim().replaceAll("%s", "% s");
  return normalized || defaultMetadataSiteName;
}

export async function loadMetadataSiteName() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
    const endpoint = new URL("/api/v1/site/config", apiBaseURL).toString();
    const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return defaultMetadataSiteName;
    const envelope = await response.json() as { data?: { siteName?: unknown } };
    return normalizeMetadataSiteName(envelope.data?.siteName);
  } catch {
    return defaultMetadataSiteName;
  } finally {
    clearTimeout(timer);
  }
}
