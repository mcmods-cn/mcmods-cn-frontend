import { baseProjectCatalogEntry, emptyModFeatures, ModCatalogEntry } from "./mod-catalog-data";
import type { CreatorKind } from "./community-api";
import { API_BASE_URL } from "./api";

type BackendModLink = { type: string; url: string; note: string };
export type BackendCreatorIdentity = {
  creatorId?: string;
  kind?: CreatorKind;
  name: string;
  avatarUrl?: string;
  roleId?: string;
  role: string;
  title?: string;
};
export type BackendModAuthor = BackendCreatorIdentity & {
  members?: BackendCreatorIdentity[];
};
export type BackendModRelationship = {
  type: "dependency" | "integration" | "conflict";
  relatedModId?: string;
  relatedModSiteId?: string;
  relatedModName: string;
  relatedModIdentifier?: string;
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
  versions: Array<{ code: string; type: "release" | "snapshot" | "pre_release" | "release_candidate" | "april_fools" | "legacy" }>;
  commonVersions?: string[];
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
  modIds: BackendModIdentifier[];
  defaultLocale: string;
  localizations: BackendModLocalization[];
  environment: ModCatalogEntry["environment"];
  primaryCategory: string;
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
  submissionRevisionId?: string;
  changeRequestId?: string;
  tags: string[];
  authors: BackendModAuthor[];
  links: BackendModLink[];
  relationshipGroups: BackendModRelationshipGroup[];
  galleryImages: BackendModGalleryImage[];
};

export type BackendModList = { items: BackendModRecord[]; total: number };

export type CreateModPayload = Omit<BackendModRecord, "id" | "uniqueId" | "reviewStatus" | "createdBy" | "createdAt" | "updatedAt" | "publishedAt" | "publishedRevisionId" | "submissionRevisionId" | "changeRequestId">;

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
  submittedByName: string;
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
  kind: "editor" | "developer";
  proof: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  attachments: Array<{ id: string; originalName: string; objectKey: string; sizeBytes: number }>;
  createdAt: string;
  reviewedAt?: string;
};

export function backendModToCatalogEntry(record: BackendModRecord): ModCatalogEntry {
  return {
    ...baseProjectCatalogEntry(record),
    uniqueId: record.uniqueId,
    modId: record.modIds.find((identifier) => identifier.primary)?.identifier ?? record.modIds[0]?.identifier ?? "",
    icon: record.iconUrl ? `${API_BASE_URL}/api/v1/mods/${encodeURIComponent(record.siteId)}/icon` : "",
    features: { ...emptyModFeatures, reviewed: record.reviewStatus === "approved", downloads: Boolean(record.modrinthProjectId || record.curseforgeProjectId), gallery: record.galleryImages.length > 0 },
    relationshipGroups: record.relationshipGroups,
    stats: { downloads: 0, views: 0, favorites: 0, rating: 0, comments: 0, downloadSource: "Modrinth" },
  };
}
