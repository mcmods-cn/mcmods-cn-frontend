export type ModEnvironment = "clientOnly" | "serverOnly" | "bothRequired" | "clientOptional" | "serverOptional";
export type ModMaintenanceStatus = "active" | "lowFrequency" | "discontinued" | "archived" | "development";
export type ModSourceStatus = "open" | "partial" | "closed" | "unknown";
export type ModFeature = "tutorials" | "items" | "gallery" | "downloads" | "reviewed" | "claimed" | "serverSupport" | "modpackAllowed" | "severeIssues";

export type ModTeamMember = {
  name: string;
  initials: string;
  roleKey: string;
};

export type ModRelationship = {
  type: "dependency" | "extension" | "integration";
  relatedModName: string;
  notes: string;
};

export type ModRelationshipGroup = {
  label: string;
  loader: string;
  minecraftVersions: string[];
  modVersion: string;
  direction?: "outgoing" | "incoming";
  relationships: ModRelationship[];
};

export type ModLoaderCompatibility = { loader: string; versions: string[] };

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
  team?: string;
  members?: ModTeamMember[];
  updatedAt: string;
  collectedAt: string;
  certified: boolean;
  claimed: boolean;
  features: Record<ModFeature, boolean>;
  bodyMarkdown?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  createdBy?: number;
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

export const commonVersions = ["1.21.1", "1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.7.10"];
export const releaseVersions = ["1.21.5", "1.21.4", "1.21.3", "1.21", "1.20.6", "1.20.4", "1.20.2", "1.19.4", "1.19.3", "1.18.1", "1.17.1", "1.15.2", "1.14.4", "1.10.2", "1.8.9"];
export const snapshotVersions = ["25w14craftmine", "24w14potato", "23w13a_or_b", "20w14∞"];
export const aprilFoolsVersions = ["3D Shareware v1.34", "Minecraft 2.0", "Love and Hugs Update"];

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
export const sortOptions: string[] = ["relevance", "updated", "collected", "downloads", "favorites", "rating", "views", "comments", "nameAsc", "nameDesc"];
