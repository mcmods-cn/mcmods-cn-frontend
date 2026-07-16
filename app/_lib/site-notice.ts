export type SiteNoticeTone = "danger" | "success" | "info";

export function notifySite(message: string, title?: string, tone: SiteNoticeTone = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mcmods-site-notice", { detail: { message, title, tone } }));
}
