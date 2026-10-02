export type ShortLinkState = "loading" | "not_found" | "error";

export function classifyShortLinkFailure(apiStatus?: number): Exclude<ShortLinkState, "loading"> {
  return apiStatus === 404 || apiStatus === 410 ? "not_found" : "error";
}
