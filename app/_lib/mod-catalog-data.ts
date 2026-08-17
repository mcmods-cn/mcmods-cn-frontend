export type ModEnvironment = "clientOnly" | "serverOnly" | "bothRequired" | "clientOptional" | "serverOptional";
export type ModMaintenanceStatus = "active" | "lowFrequency" | "discontinued" | "archived" | "development";
export type ModSourceStatus = "open" | "partial" | "closed" | "unknown";
export type ModFeature = "tutorials" | "items" | "gallery" | "downloads" | "reviewed" | "claimed" | "serverSupport" | "modpackAllowed" | "severeIssues";

type ModTeamMember = {
  name: string;
  initials: string;
  roleKey: string;
};

type ModRelationship = {
  type: "dependency" | "integration" | "conflict";
  relatedModId?: string;
  relatedModSiteId?: string;
  relatedModName: string;
  relatedModIdentifier?: string;
};

type ModCreatorIdentity = {
  creatorId?: string;
  kind?: "author" | "team";
  name: string;
  avatarUrl?: string;
  roleId?: string;
  role: string;
  title?: string;
  members?: ModCreatorIdentity[];
};

type ModRelationshipGroup = {
  label: string;
  loader: string;
  minecraftVersions: string[];
  modVersion: string;
  direction?: "outgoing" | "incoming";
  relationships: ModRelationship[];
};

type ModLoaderCompatibility = { loader: string; versions: string[] };

export type ModCatalogEntry = {
  siteId: string;
  uniqueId: string;
  modId: string;
  name: string;
  localizedName: string;
  abbreviation: string;
  descriptionKey?: string;
  summary?: string;
  icon: string;
  primaryCategory: string;
  tags: string[];
  keywords: string[];
  versions: string[];
  loaders: string[];
  compatibilities?: ModLoaderCompatibility[];
  environment: ModEnvironment;
  status: ModMaintenanceStatus;
  sourceStatus: ModSourceStatus;
  license: string;
  curseforgeProjectId?: string;
  modrinthProjectId?: string;
  authors: string[];
  authorDetails?: ModCreatorIdentity[];
  team?: string;
  members?: ModTeamMember[];
  updatedAt: string;
  collectedAt: string;
  certified: boolean;
  claimed: boolean;
  features: Record<ModFeature, boolean>;
  bodyMarkdown?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  createdBy?: string;
  links?: Array<{ type: string; url: string; note: string }>;
  relationshipGroups?: ModRelationshipGroup[];
  galleryImages?: Array<{ publicId?: string; name?: string; url?: string }>;
  stats: {
    downloads: number;
    views: number;
    favorites: number;
    rating: number;
    comments: number;
    downloadSource: "Modrinth" | "CurseForge" | "Internal";
  };
};

type BaseCatalogProjectSource = {
  siteId: string;
  primaryName: string;
  secondaryName: string;
  abbreviation: string;
  summary: string;
  primaryCategory: string;
  tags: string[];
  searchKeywords: string[];
  compatibilities: ModLoaderCompatibility[];
  environment: ModEnvironment;
  officialStatus: ModMaintenanceStatus;
  sourceStatus: ModSourceStatus;
  license: string;
  curseforgeProjectId?: string;
  modrinthProjectId?: string;
  authors: ModCreatorIdentity[];
  updatedAt: string;
  createdAt: string;
  bodyMarkdown?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  createdBy?: string;
  links?: ModCatalogEntry["links"];
  galleryImages?: ModCatalogEntry["galleryImages"];
};

type BaseCatalogProjectEntry = Omit<ModCatalogEntry, "uniqueId" | "modId" | "icon" | "features" | "relationshipGroups" | "stats">;

export const emptyModFeatures: Record<ModFeature, boolean> = {
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

export function baseProjectCatalogEntry(record: BaseCatalogProjectSource): BaseCatalogProjectEntry {
  return {
    siteId: record.siteId,
    name: record.primaryName,
    localizedName: record.secondaryName || record.primaryName,
    abbreviation: record.abbreviation || record.primaryName,
    summary: record.summary,
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
    bodyMarkdown: record.bodyMarkdown,
    reviewStatus: record.reviewStatus,
    createdBy: record.createdBy,
    links: record.links,
    galleryImages: record.galleryImages,
  };
}

export const loaderOptions = [
  "Fabric", "Forge", "NeoForge", "Babric", "BTA (Babric)", "Java Agent", "Legacy Fabric",
  "LiteLoader", "Risugami's ModLoader", "NilLoader", "Ornithe", "Quilt", "Rift",
] as const;

export const primaryCategoryOptions = ["technology", "magic", "adventure", "agriculture", "decoration", "utility", "assistance", "customization", "library"] as const;
export const tagOptions = [
  "building", "creatures", "worldGeneration", "biomes", "structures", "weapons", "tools", "storage",
  "logistics", "energy", "redstone", "automation", "optimization", "assistance", "modpackSupport",
  "adventure", "economy", "equipment", "gameMechanics", "management", "minigames", "social", "transportation",
] as const;
export const environmentOptions: ModEnvironment[] = ["clientOnly", "serverOnly", "bothRequired", "clientOptional", "serverOptional"];
export const maintenanceOptions: ModMaintenanceStatus[] = ["active", "lowFrequency", "discontinued", "archived", "development"];
export const sourceOptions: ModSourceStatus[] = ["open", "partial", "closed", "unknown"];
export const licenseOptions = ["MIT", "GPL-3.0", "LGPL-3.0", "Apache-2.0", "ARR", "Custom"] as const;
export const updatedOptions = ["all", "week", "month", "quarter", "year", "stale"] as const;
export const advancedOptions: ModFeature[] = ["tutorials", "items", "gallery", "downloads", "reviewed", "claimed", "serverSupport", "modpackAllowed", "severeIssues"];
