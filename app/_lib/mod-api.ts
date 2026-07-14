import { ModCatalogEntry, ModFeature } from "./mod-catalog-data";

export type BackendModLink = { type: string; url: string };
export type BackendModAuthor = { name: string; role: string };
export type BackendModRelationship = {
  type: "dependency" | "extension" | "integration";
  relatedModId?: number;
  relatedModName: string;
  notes: string;
};

export type BackendModRelationshipGroup = {
  label: string;
  loader: string;
  minecraftVersions: string[];
  modVersion: string;
  relationships: BackendModRelationship[];
};

export type BackendModCompatibility = { loader: string; versions: string[] };
export type MinecraftVersionConfig = {
  versions: Array<{ code: string; type: "release" | "snapshot" | "april_fools" | "legacy" }>;
  loaders: Array<{ code: string; name: string; versions: string[] }>;
};

export type BackendModRecord = {
  id: number;
  uniqueId: string;
  siteId: string;
  primaryName: string;
  secondaryName: string;
  abbreviation: string;
  summary: string;
  modId: string;
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
  iconUrl: string;
  bodyMarkdown: string;
  searchKeywords: string[];
  submissionMethod: "manual" | "modrinth" | "curseforge" | "github";
  reviewStatus: "pending" | "approved" | "rejected";
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedRevisionId?: number;
  tags: string[];
  authors: BackendModAuthor[];
  links: BackendModLink[];
  relationshipGroups: BackendModRelationshipGroup[];
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
  id: number;
  modId: number;
  version: number;
  status: "pending" | "approved" | "rejected";
  snapshot: CreateModPayload;
  changeReason: string;
  submittedBy?: number;
  reviewedBy?: number;
  reviewNote: string;
  createdAt: string;
  reviewedAt?: string;
  baseRevisionId?: number;
  changeRequestId: number;
  schemaVersion: number;
  snapshotHash: string;
};

export type BackendModRevisionList = { items: BackendModRevision[] };
export type BackendModRevisionComparison = { before: BackendModRevision; after: BackendModRevision; changedFields: string[] };

export type BackendModApplication = {
  id: number;
  modId: number;
  modSiteId: string;
  modName: string;
  userId: number;
  username: string;
  displayName: string;
  kind: "editor" | "developer";
  proof: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  attachments: Array<{ id: number; originalName: string; objectKey: string; sizeBytes: number }>;
  createdAt: string;
  reviewedAt?: string;
};

export type BackendModComment = {
  id: number;
  parentId?: number;
  rootId?: number;
  body: string;
  author: { id: number; username: string; displayName: string; avatarUrl: string; projectRole?: "owner" | "editor" };
  reactions: Record<string, number>;
  userReactions: string[];
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
    authors: record.authors.map((author) => author.name),
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
    stats: { downloads: 0, views: 0, favorites: 0, rating: 0, comments: 0, downloadSource: "Modrinth" },
  };
}
