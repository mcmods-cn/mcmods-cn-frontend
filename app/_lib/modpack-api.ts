import { baseProjectCatalogEntry, emptyModFeatures, type ModCatalogEntry } from "./mod-catalog-data";
import type { BackendModAuthor, BackendModCompatibility, BackendModGalleryImage, BackendModRecord } from "./mod-api";
import { API_BASE_URL } from "./api";

export type BackendModpackMod = {
  modPublicId?: string;
  modSiteId?: string;
  modName: string;
  iconUrl?: string;
  provider: "manual" | "modrinth" | "curseforge" | "index";
  providerProjectId?: string;
  providerVersionId?: string;
  identifier?: string;
  fileName?: string;
  clientRequired: boolean;
  serverRequired: boolean;
  resolved: boolean;
};

export type BackendModpackRecord = {
  id: string;
  siteId: string;
  primaryName: string;
  secondaryName: string;
  abbreviation: string;
  summary: string;
  defaultLocale: string;
  environment: "clientOnly" | "serverOnly" | "bothRequired";
  primaryCategory: string;
  packType: "native" | "customized";
  packagingMethod: "curseforge" | "ftb" | "other_launcher" | "manual" | "atlauncher" | "modrinth" | "mcbbs" | "other";
  compatibilities: BackendModCompatibility[];
  tags: string[];
  searchKeywords: string[];
  authors: BackendModAuthor[];
  officialStatus: ModCatalogEntry["status"];
  sourceStatus: ModCatalogEntry["sourceStatus"];
  license: string;
  curseforgeProjectId: string;
  modrinthProjectId: string;
  iconUrl: string;
  bodyMarkdown: string;
  submissionMethod: "manual" | "modrinth" | "curseforge";
  links: BackendModRecord["links"];
  galleryImages: BackendModGalleryImage[];
  mods: BackendModpackMod[];
  reviewStatus: "pending" | "approved" | "rejected";
  submittedBy?: string;
  publishedRevisionId?: string;
  submissionRevisionId?: string;
  changeRequestId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  canEdit?: boolean;
};

export const modpackCategoryOptions = ["technology", "magic", "adventure", "building", "map", "quests", "optimization", "hardcore", "casual", "large", "lightweight", "story", "kitchen_sink", "skyblock", "pvp", "chinese"] as const;
export const modpackTypeOptions = ["native", "customized"] as const;
export const modpackPackagingMethodOptions = ["curseforge", "ftb", "other_launcher", "manual", "atlauncher", "modrinth", "mcbbs", "other"] as const;

export type BackendModpackList = { items: BackendModpackRecord[]; total: number };
export type CreateModpackPayload = Omit<BackendModpackRecord, "id" | "reviewStatus" | "submittedBy" | "publishedRevisionId" | "submissionRevisionId" | "changeRequestId" | "createdAt" | "updatedAt" | "publishedAt" | "canEdit">;
export type BackendModpackImportJob = {
  id: string;
  projectType: "modpack";
  provider: "modrinth" | "curseforge";
  sourceUrl: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  result?: CreateModpackPayload;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export function backendModpackToCatalogEntry(record: BackendModpackRecord): ModCatalogEntry {
  return {
    ...baseProjectCatalogEntry(record),
    uniqueId: record.id,
    modId: "",
    icon: modpackIconURL(record),
    features: { ...emptyModFeatures, reviewed: record.reviewStatus === "approved", downloads: true, gallery: record.galleryImages.length > 0 },
    relationshipGroups: [],
    stats: { downloads: 0, views: 0, favorites: 0, rating: 0, comments: 0, downloadSource: record.modrinthProjectId ? "Modrinth" : record.curseforgeProjectId ? "CurseForge" : "Internal" },
  };
}

export function modpackIconURL(record: Pick<BackendModpackRecord, "siteId" | "iconUrl">) {
  return record.iconUrl ? `${API_BASE_URL}/api/v1/modpacks/${encodeURIComponent(record.siteId)}/icon` : "";
}

export function modpackModIconURL(mod: BackendModpackMod) {
  return mod.resolved && mod.modSiteId
    ? `${API_BASE_URL}/api/v1/mods/${encodeURIComponent(mod.modSiteId)}/icon`
    : mod.iconUrl || "";
}
