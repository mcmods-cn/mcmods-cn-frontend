// Private textures served by the configured API need the current HttpOnly
// session. Other providers and local blob/data previews remain anonymous.
export function skinTextureCrossOrigin(source: string, apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"): "anonymous" | "use-credentials" {
  try {
    const api = new URL(apiBaseURL);
    const target = new URL(source, api);
    return target.origin === api.origin ? "use-credentials" : "anonymous";
  } catch { return "anonymous"; }
}
