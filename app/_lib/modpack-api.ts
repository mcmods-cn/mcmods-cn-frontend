import type { ModCatalogEntry, ModFeature } from "./mod-catalog-data";
import type { BackendModAuthor, BackendModCompatibility, BackendModGalleryImage, BackendModRecord } from "./mod-api";

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
  createdBy?: string;
  publishedRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  canEdit?: boolean;
};

export const modpackCategoryOptions = ["technology", "magic", "adventure", "building", "map", "quests", "optimization", "hardcore", "casual", "large", "lightweight", "story", "kitchen_sink", "skyblock", "pvp", "chinese"] as const;
export const modpackTypeOptions = ["native", "customized"] as const;
export const modpackPackagingMethodOptions = ["curseforge", "ftb", "other_launcher", "manual", "atlauncher", "modrinth", "mcbbs", "other"] as const;

export type BackendModpackList = { items: BackendModpackRecord[]; total: number };
export type CreateModpackPayload = Omit<BackendModpackRecord, "id" | "reviewStatus" | "createdBy" | "publishedRevisionId" | "createdAt" | "updatedAt" | "publishedAt" | "canEdit">;
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

const emptyFeatures: Record<ModFeature, boolean> = {
  tutorials: false,
  items: false,
  gallery: false,
  downloads: false,
  reviewed: false,
  claimed: false,
  serverSupport: false,
  modpackAllowed: false,
  severeIssues: false,
};

export function backendModpackToCatalogEntry(record: BackendModpackRecord): ModCatalogEntry {
  return {
    siteId: record.siteId,
    uniqueId: record.id,
    modId: "",
    name: record.primaryName,
    localizedName: record.secondaryName || record.primaryName,
    abbreviation: record.abbreviation || record.primaryName,
    summary: record.summary,
    icon: record.iconUrl,
    primaryCategory: record.primaryCategory,
    tags: record.tags,
    keywords: record.searchKeywords,
    versions: [...new Set(record.compatibilities.flatMap((compatibility) => compatibility.versions))],
    loaders: record.compatibilities.map((compatibility) => compatibility.loader),
    compatibilities: record.compatibilities,
    environment: record.environment,
    status: record.officialStatus,
    sourceStatus: record.sourceStatus,
    license: record.license,
    curseforgeProjectId: record.curseforgeProjectId,
    modrinthProjectId: record.modrinthProjectId,
    authors: record.authors.map((author) => author.name).filter(Boolean),
    authorDetails: record.authors,
    team: record.authors.find((author) => author.kind === "team")?.name,
    updatedAt: record.updatedAt,
    collectedAt: record.createdAt,
    certified: false,
    claimed: false,
    features: { ...emptyFeatures, reviewed: record.reviewStatus === "approved", downloads: true, gallery: record.galleryImages.length > 0 },
    bodyMarkdown: record.bodyMarkdown,
    reviewStatus: record.reviewStatus,
    createdBy: record.createdBy,
    links: record.links,
    relationshipGroups: [],
    galleryImages: record.galleryImages,
    stats: { downloads: 0, views: 0, favorites: 0, rating: 0, comments: 0, downloadSource: record.modrinthProjectId ? "Modrinth" : record.curseforgeProjectId ? "CurseForge" : "Internal" },
  };
}
