import { apiRequest } from "./api";
import type { CatalogEditorLocalization } from "./catalog-editor-api";

// These codes are the canonical values produced by the backend importer and
// catalog identity layer. The editor still accepts extension codes typed by
// users, but should never suggest short aliases such as `item` or `block`.
export const catalogResourceKindCodes = [
  "minecraft.item",
  "minecraft.block",
  "minecraft.fluid",
  "minecraft.entity_type",
  "minecraft.mob_effect",
  "minecraft.enchantment",
  "minecraft.biome",
  "minecraft.dimension",
  "minecraft.key_mapping",
  "minecraft.advancement",
  "minecraft.loot_table",
  "minecraft.structure",
  "mekanism.gas",
  "mekanism.infusion",
  "mekanism.pigment",
  "mekanism.slurry",
  "jei.ingredient",
  "import.document",
] as const;

export type CatalogResourceEditorDocument = {
  publicId: string;
  kindCode: string;
  canonicalId: string;
  defaultLocale: string;
  publishedRevisionId?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  localizations: CatalogEditorLocalization[];
  definition: Record<string, unknown>;
  iconFileId?: string;
  renderFileId?: string;
  iconUrl?: string;
  renderUrl?: string;
};

const resourcesPath = "/api/v1/catalog/resources";

export async function loadCatalogResourceForEditing(publicId: string, token: string) {
  const value = await apiRequest<unknown>(`${resourcesPath}/${encodeURIComponent(publicId)}`, {}, token);
  return normalizeResourceDocument(value);
}

function normalizeResourceDocument(value: unknown): CatalogResourceEditorDocument {
  const source = record(value);
  const publicId = text(source.publicId);
  const iconFileId = text(source.iconFileId) || undefined;
  const renderFileId = text(source.renderFileId) || undefined;
  return {
    publicId,
    kindCode: text(source.kindCode),
    canonicalId: text(source.canonicalId),
    defaultLocale: text(source.defaultLocale) || "en-US",
    publishedRevisionId: text(source.publishedRevisionId) || undefined,
    reviewStatus: reviewStatus(source.reviewStatus),
    localizations: localizations(source.localizations),
    definition: record(source.definition),
    iconFileId,
    renderFileId,
    iconUrl: text(source.iconUrl) || (iconFileId ? `${resourcesPath}/${encodeURIComponent(publicId)}/icon` : undefined),
    renderUrl: text(source.renderUrl) || (renderFileId ? `${resourcesPath}/${encodeURIComponent(publicId)}/render` : undefined),
  };
}

function localizations(value: unknown): CatalogEditorLocalization[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry): CatalogEditorLocalization => {
    const source = record(entry);
    const provenance = source.provenance;
    return {
      locale: text(source.locale),
      fields: {
        name: text(source.name),
        summary: text(source.summary),
        contentMarkdown: text(source.contentMarkdown),
      },
      revisionId: text(source.publishedRevisionId) || undefined,
      provenance: provenance === "ai" || provenance === "human_corrected" || provenance === "import" ? provenance : "human",
      reviewStatus: reviewStatus(source.reviewStatus) ?? "approved",
      generatedFromLocale: text(source.sourceLocale) || undefined,
      editable: source.editable !== false,
      updatedAt: text(source.updatedAt) || undefined,
    };
  }).filter((entry) => entry.locale);
}

function reviewStatus(value: unknown) {
  return value === "pending" || value === "approved" || value === "rejected" ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
