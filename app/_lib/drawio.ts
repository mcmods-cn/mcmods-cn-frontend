export const DRAWIO_ORIGIN = "https://embed.diagrams.net";

export function parseDrawioMessage<T extends object>(raw: unknown): T | null {
  if (typeof raw === "object" && raw !== null) {
    return raw as T;
  }
  if (typeof raw !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}
