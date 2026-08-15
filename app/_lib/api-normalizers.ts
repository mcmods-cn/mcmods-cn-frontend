import type { CatalogResourceVersion } from "./editor-types";

export function apiRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function apiText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function apiStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function apiStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(apiRecord(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function normalizeCatalogResourceVersions(value: unknown): CatalogResourceVersion[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = apiRecord(entry);
    return {
      publicId: apiText(source.publicId),
      label: apiText(source.label),
      minecraftVersions: apiStringArray(source.minecraftVersions),
      loaders: apiStringArray(source.loaders),
      modVersion: apiText(source.modVersion),
      sourceKind: source.sourceKind === "manual" ? "manual" as const : "import" as const,
      hasDetail: source.hasDetail === true,
      revisionId: apiText(source.revisionId),
      registry: apiText(source.registry),
      iconPath: apiText(source.iconPath),
      previewPath: apiText(source.previewPath) || undefined,
      iconFileId: apiText(source.iconFileId) || undefined,
      renderFileId: apiText(source.renderFileId) || undefined,
      modSiteId: apiText(source.modSiteId),
      names: apiStringRecord(source.names),
      name: apiText(source.name) || undefined,
      iconUrl: apiText(source.iconUrl) || undefined,
      detailUrl: apiText(source.detailUrl) || undefined,
    };
  }).filter((entry) => entry.publicId);
}
