import { ModCatalogEntry, ModFeature } from "./mod-catalog-data";
import type { CreatorKind } from "./community-api";

type BackendModLink = { type: string; url: string; note: string };
export type BackendModAuthor = {
  creatorId?: string;
  kind?: CreatorKind;
  name: string;
  avatarUrl?: string;
  roleId?: string;
  role: string;
};
export type BackendModRelationship = {
  type: "dependency" | "extension" | "integration";
  relatedModId?: string;
  relatedModSiteId?: string;
  relatedModName: string;
  relatedModIdentifier?: string;
  notes: string;
};

export type BackendModRelationshipGroup = {
  label: string;
  loader: string;
  minecraftVersions: string[];
  modVersion: string;
  direction?: "outgoing" | "incoming";
  relationships: BackendModRelationship[];
};

export type BackendModCompatibility = { loader: string; versions: string[] };
export type BackendModIdentifier = {
  identifier: string;
  primary: boolean;
  minecraftVersionMin: string;
  minecraftVersionMax: string;
  minecraftVersions: string[];
};
export type BackendModLocalization = { locale: string; name: string; summary: string; contentMarkdown: string };
export type BackendModGalleryImage = {
  publicId?: string;
  fileId: string;
  name?: string;
  contentType?: string;
  sizeBytes?: number;
  url?: string;
};
export type MinecraftVersionConfig = {
  versions: Array<{ code: string; type: "release" | "snapshot" | "april_fools" | "legacy" }>;
  loaders: Array<{ code: string; name: string; versions: string[] }>;
  loaderSyncs?: Array<{
    code: string;
    sourceUrl: string;
    status: "synced" | "failed";
    lastSyncedAt?: string;
    versionCount: number;
    usedFallback?: boolean;
    error?: string;
  }>;
  sourceUrl?: string;
  lastSyncedAt?: string;
  latestRelease?: string;
  latestSnapshot?: string;
};

export type BackendModRecord = {
  id: string;
  uniqueId: string;
  siteId: string;
  primaryName: string;
  secondaryName: string;
  abbreviation: string;
  summary: string;
  modId: string;
  modIds: BackendModIdentifier[];
  defaultLocale: string;
  localizations: BackendModLocalization[];
  environment: ModCatalogEntry["environment"];
  primaryCategory: string;
  supportedVersions: string[];
  supportedLoaders: string[];
  compatibilities: BackendModCompatibility[];
  officialStatus: ModCatalogEntry["status"];
  sourceStatus: ModCatalogEntry["sourceStatus"];
  license: string;
  curseforgeProjectId: string;
  modrinthProjectId: string;
  githubProjectPath: string;
  iconUrl: string;
  bodyMarkdown: string;
  searchKeywords: string[];
  submissionMethod: "manual" | "modrinth" | "curseforge" | "github";
  reviewStatus: "pending" | "approved" | "rejected";
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedRevisionId?: string;
  tags: string[];
  authors: BackendModAuthor[];
  links: BackendModLink[];
  relationshipGroups: BackendModRelationshipGroup[];
  galleryImages: BackendModGalleryImage[];
};

export type BackendModList = { items: BackendModRecord[]; total: number };

export type CreateModPayload = Omit<BackendModRecord, "id" | "uniqueId" | "reviewStatus" | "createdBy" | "createdAt" | "updatedAt" | "publishedAt" | "publishedRevisionId">;

export type BackendModImportJob = {
  id: string;
  provider: "modrinth" | "curseforge" | "github";
  sourceUrl: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  result?: CreateModPayload;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type BackendModRevision = {
  id: string;
  modId: string;
  version: number;
  status: "pending" | "approved" | "rejected";
  snapshot: CreateModPayload;
  changeReason: string;
  submittedBy?: string;
  reviewedBy?: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt?: string;
  baseRevisionId?: string;
  changeRequestId: string;
  schemaVersion: number;
  snapshotHash: string;
};

export type BackendModRevisionList = { items: BackendModRevision[] };
export type BackendModRevisionComparison = { before: BackendModRevision; after: BackendModRevision; changedFields: string[] };

export type BackendModApplication = {
  id: string;
  modId: string;
  modSiteId: string;
  modName: string;
  userId: string;
  username: string;
  displayName: string;
  kind: "editor" | "developer";
  proof: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  attachments: Array<{ id: string; originalName: string; objectKey: string; sizeBytes: number }>;
  createdAt: string;
  reviewedAt?: string;
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

export function backendModToCatalogEntry(record: BackendModRecord): ModCatalogEntry {
  return {
    siteId: record.siteId,
    uniqueId: record.uniqueId,
    modId: record.modId,
    name: record.primaryName,
    localizedName: record.secondaryName || record.primaryName,
    abbreviation: record.abbreviation || record.primaryName,
    summary: record.summary,
    icon: record.iconUrl,
    primaryCategory: record.primaryCategory,
    tags: record.tags,
    keywords: record.searchKeywords,
    versions: record.supportedVersions,
    loaders: record.supportedLoaders,
    compatibilities: record.compatibilities,
    environment: record.environment,
    status: record.officialStatus,
    sourceStatus: record.sourceStatus,
    license: record.license,
    curseforgeProjectId: record.curseforgeProjectId,
    modrinthProjectId: record.modrinthProjectId,
    authors: record.authors.map((author) => author.name).filter(Boolean),
    updatedAt: record.updatedAt,
    collectedAt: record.createdAt,
    certified: false,
    claimed: false,
    features: { ...emptyFeatures, reviewed: record.reviewStatus === "approved", downloads: Boolean(record.modrinthProjectId || record.curseforgeProjectId) },
    bodyMarkdown: record.bodyMarkdown,
    reviewStatus: record.reviewStatus,
    createdBy: record.createdBy,
    links: record.links,
    relationshipGroups: record.relationshipGroups,
    galleryImages: record.galleryImages,
    stats: { downloads: 0, views: 0, favorites: 0, rating: 0, comments: 0, downloadSource: "Modrinth" },
  };
}
