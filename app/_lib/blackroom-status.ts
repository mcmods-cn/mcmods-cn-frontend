export type BlackroomStatus = "temporary" | "permanent" | "released" | "unknown";

export function normalizeBlackroomStatus(value: unknown): BlackroomStatus {
  if (value === "temporary" || value === "permanent" || value === "released") return value;
  return "unknown";
}
