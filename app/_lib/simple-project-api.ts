import type { BackendModAuthor, BackendModGalleryImage, BackendModRecord } from "./mod-api";

export const simpleProjectTypes = ["plugin", "map", "resource_pack", "shader_pack", "datapack", "addon"] as const;
export type SimpleProjectType = (typeof simpleProjectTypes)[number];

export type SimpleProjectLocalization = {
  locale: string;
  name: string;
  summary: string;
  bodyMarkdown: string;
};

export type SimpleProjectParent = {
  publicId?: string;
  type: "mod" | "modpack" | SimpleProjectType;
  identifier?: string;
  name?: string;
  siteId?: string;
  iconUrl?: string;
  unresolved?: boolean;
};

export type SimpleProjectRecord = {
  id: string;
  projectType: SimpleProjectType;
  siteId: string;
  defaultLocale: string;
  localizations: SimpleProjectLocalization[];
  abbreviation: string;
  minecraftVersions: string[];
  loaders: string[];
  categories: string[];
  features: string[];
  resolution: string;
  performance: string;
  mapSize: string;
  officialStatus: "active" | "lowFrequency" | "discontinued" | "archived" | "development";
  sourceStatus: "open" | "partial" | "closed" | "unknown";
  license: string;
  curseforgeProjectId: string;
  modrinthProjectId: string;
  iconUrl: string;
  searchKeywords: string[];
  submissionMethod: "manual" | "modrinth" | "curseforge";
  authors: BackendModAuthor[];
  links: BackendModRecord["links"];
  galleryImages: BackendModGalleryImage[];
  parentProjects: SimpleProjectParent[];
  reviewStatus: "pending" | "approved" | "rejected";
  createdBy?: string;
  publishedRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  canEdit?: boolean;
};

export type SimpleProjectPayload = Omit<SimpleProjectRecord,
  "id" | "reviewStatus" | "createdBy" | "publishedRevisionId" | "createdAt" | "updatedAt" | "publishedAt" | "canEdit">;
export type SimpleProjectList = { items: SimpleProjectRecord[]; total: number };

export type SimpleProjectImportProvider = "modrinth" | "curseforge";
export type SimpleProjectImportJob = {
  id: string;
  projectType: SimpleProjectType;
  provider: SimpleProjectImportProvider;
  sourceUrl: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  result?: SimpleProjectPayload;
  error?: string;
};

export type SimpleProjectConfig = {
  type: SimpleProjectType;
  path: string;
  loaders: readonly string[];
  categories: readonly string[];
  features: readonly string[];
  selector?: "resolution" | "performance" | "mapSize";
  selectorOptions?: readonly string[];
};

const resourcePackCategories = ["combat", "cursed", "decoration", "modded", "realistic", "simplistic", "themed", "tweaks", "utility", "vanilla_like"] as const;
const resourcePackFeatures = ["audio", "blocks", "core_shaders", "entities", "environment", "equipment", "fonts", "gui", "items", "locale", "models"] as const;

export const simpleProjectConfigs: Record<SimpleProjectType, SimpleProjectConfig> = {
  plugin: {
    type: "plugin", path: "/plugins",
    loaders: ["bukkit", "spigot", "paper", "purpur", "folia", "sponge", "bungeecord", "waterfall", "velocity", "fabric", "forge", "neoforge"],
    categories: ["administration", "chat", "economy", "gameplay", "minigame", "permissions", "protection", "roleplay", "utility", "world_management"],
    features: [],
  },
  map: {
    type: "map", path: "/maps", loaders: [],
    categories: ["puzzle", "parkour", "survival", "redstone", "city", "rpg", "adventure", "pvp", "minigame", "horror", "creation", "story", "education"],
    features: [], selector: "mapSize", selectorOptions: ["tiny", "small", "medium", "large", "huge"],
  },
  resource_pack: {
    type: "resource_pack", path: "/resource-packs", loaders: [], categories: resourcePackCategories,
    features: resourcePackFeatures, selector: "resolution",
    selectorOptions: ["8x_or_lower", "16x", "32x", "48x", "64x", "128x", "256x", "512x_or_higher"],
  },
  shader_pack: {
    type: "shader_pack", path: "/shaders", loaders: ["optifine", "iris", "oculus", "canvas"],
    categories: ["cartoon", "semi_realistic", "realistic", "vanilla", "functional"],
    features: ["ambient_light", "bloom", "colored_lighting", "pbr", "reflection", "shadows"],
    selector: "performance", selectorOptions: ["potato", "low", "medium", "high", "cinematic", "supercomputer"],
  },
  datapack: {
    type: "datapack", path: "/datapacks", loaders: ["vanilla", "fabric", "forge", "neoforge", "quilt"],
    categories: ["adventure", "building", "decoration", "game_mechanics", "magic", "technology", "utility", "world_generation", "challenge", "optimization"],
    features: [],
  },
  addon: {
    type: "addon", path: "/addons", loaders: ["vanilla", "fabric", "forge", "neoforge", "quilt", "bukkit", "spigot", "paper"],
    categories: [], features: [],
  },
};

export const allLargeProjectTypes = ["mod", "modpack", ...simpleProjectTypes] as const;

export function simpleProjectConfig(type: SimpleProjectType) {
  return simpleProjectConfigs[type];
}

export function simpleProjectImportProviders(type: SimpleProjectType): readonly SimpleProjectImportProvider[] {
  return type === "map" ? ["curseforge"] : ["modrinth", "curseforge"];
}

export function largeProjectPath(type: string, siteId: string) {
  const paths: Record<string, string> = {
    mod: "/mods", modpack: "/modpacks", plugin: "/plugins", map: "/maps",
    resource_pack: "/resource-packs", shader_pack: "/shaders", datapack: "/datapacks", addon: "/addons",
  };
  return `${paths[type] || "/mods"}/${siteId}`;
}

export function localizedSimpleProject(record: Pick<SimpleProjectRecord, "defaultLocale" | "localizations">, locale: string) {
  return record.localizations.find((item) => item.locale === locale)
    || record.localizations.find((item) => item.locale.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()))
    || record.localizations.find((item) => item.locale === record.defaultLocale)
    || record.localizations[0]
    || { locale: record.defaultLocale, name: "", summary: "", bodyMarkdown: "" };
}

export function emptySimpleProject(type: SimpleProjectType): SimpleProjectPayload {
  const config = simpleProjectConfig(type);
  return {
    projectType: type, siteId: "", defaultLocale: "zh-CN",
    localizations: [{ locale: "zh-CN", name: "", summary: "", bodyMarkdown: "" }],
    abbreviation: "", minecraftVersions: [], loaders: config.loaders.length === 1 ? [config.loaders[0]] : [],
    categories: [], features: [], resolution: config.selector === "resolution" ? config.selectorOptions?.[0] || "" : "",
    performance: config.selector === "performance" ? config.selectorOptions?.[0] || "" : "",
    mapSize: config.selector === "mapSize" ? config.selectorOptions?.[0] || "" : "",
    officialStatus: "development", sourceStatus: "unknown", license: "Custom",
    curseforgeProjectId: "", modrinthProjectId: "", iconUrl: "", searchKeywords: [], submissionMethod: "manual",
    authors: [], links: [], galleryImages: [], parentProjects: [],
  };
}

export function isSimpleProjectType(value: string): value is SimpleProjectType {
  return (simpleProjectTypes as readonly string[]).includes(value);
}
