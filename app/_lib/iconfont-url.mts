const trustedIconfontHost = "at.alicdn.com";
const trustedIconfontSymbolPath = /^\/t\/c\/font_[a-z0-9_-]+\.js$/i;
const sha384Integrity = /^sha384-[a-z0-9+/]{64}$/i;

export type IconfontConfig = { symbolUrl: string; integrity: string };

export function normalizeIconfontURL(value?: string) {
  if (!value) return "";
  const candidate = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:"
      || url.hostname !== trustedIconfontHost
      || url.port !== ""
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || !trustedIconfontSymbolPath.test(url.pathname)
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeIconfontIntegrity(value?: string) {
  const candidate = value?.trim() ?? "";
  return sha384Integrity.test(candidate) ? candidate : "";
}

export function resolveIconfontConfig(symbolUrl?: string, integrity?: string): IconfontConfig | undefined {
  const hasSymbolURL = Boolean(symbolUrl?.trim());
  const hasIntegrity = Boolean(integrity?.trim());
  if (!hasSymbolURL && !hasIntegrity) return undefined;
  const normalizedURL = normalizeIconfontURL(symbolUrl);
  const normalizedIntegrity = normalizeIconfontIntegrity(integrity);
  if (!normalizedURL || !normalizedIntegrity) {
    throw new Error("Iconfont requires an official at.alicdn.com Symbol URL and one SHA-384 integrity value");
  }
  return { symbolUrl: normalizedURL, integrity: normalizedIntegrity };
}
