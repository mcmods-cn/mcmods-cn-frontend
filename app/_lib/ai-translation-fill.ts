import { hasCompatibleInterpolationParameters } from "./i18n-provider";

/** A delayed AI result may only fill a still-missing field from the same source snapshot. */
export function safeMissingTranslation(sourceSnapshot: string, currentSource: string, currentTarget: string, translated: unknown) {
  if (sourceSnapshot !== currentSource || currentTarget.trim() || typeof translated !== "string") return undefined;
  const value = translated.trim();
  return value && hasCompatibleInterpolationParameters(sourceSnapshot, value) ? value : undefined;
}
