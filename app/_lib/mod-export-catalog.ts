import type { ModExportRevision } from "./mod-export-api";

export type ModExportCategory = {
  key: string;
  registries: string[];
  count: number;
  icon: string;
  tone: string;
  structures?: boolean;
  documentKind?: "advancements" | "key_mappings";
};

const definitions: ReadonlyArray<Omit<ModExportCategory, "count">> = [
  { key: "itemsBlocks", registries: ["items", "blocks"], icon: "cube", tone: "text-emerald-600 bg-emerald-500/10" },
  { key: "entities", registries: ["entity_types"], icon: "entity", tone: "text-blue-600 bg-blue-500/10" },
  { key: "enchantments", registries: ["enchantments"], icon: "enchantment", tone: "text-violet-600 bg-violet-500/10" },
  { key: "buffs", registries: ["mob_effects", "potions"], icon: "effect", tone: "text-rose-600 bg-rose-500/10" },
  { key: "biomes", registries: ["biomes"], icon: "biome", tone: "text-lime-700 bg-lime-500/10" },
  { key: "fluids", registries: ["fluids"], icon: "fluid", tone: "text-cyan-700 bg-cyan-500/10" },
  { key: "keybinds", registries: [], icon: "keyboard", tone: "text-sky-700 bg-sky-500/10", documentKind: "key_mappings" },
  { key: "achievements", registries: [], icon: "achievement", tone: "text-yellow-700 bg-yellow-500/10", documentKind: "advancements" },
  { key: "multiblocks", registries: [], icon: "structure", tone: "text-amber-700 bg-amber-500/10", structures: true },
];

export function modExportCategories(revision?: ModExportRevision): ModExportCategory[] {
  if (!revision) return [];
  const claimed = new Set<string>();
  const result: ModExportCategory[] = [];
  for (const definition of definitions) {
    const count = definition.structures
      ? revision.structureCount
      : definition.documentKind === "advancements"
        ? revision.advancementCount
        : definition.documentKind === "key_mappings"
          ? revision.keyMappingCount
          : definition.registries.reduce((sum, registry) => sum + (revision.registryCounts[registry] ?? 0), 0);
    definition.registries.forEach((registry) => claimed.add(registry));
    if (count > 0) result.push({ ...definition, registries: [...definition.registries], count });
  }
  for (const [registry, count] of Object.entries(revision.registryCounts)) {
    if (count > 0 && !claimed.has(registry)) {
      result.push({ key: `registry:${registry}`, registries: [registry], count, icon: "database", tone: "text-slate-700 bg-slate-500/10" });
    }
  }
  return result;
}

export function findModExportCategory(revision: ModExportRevision | undefined, key: string) {
  return modExportCategories(revision).find((category) => category.key === key);
}

export function modExportCategoryTitle(category: ModExportCategory, t: (key: string, values?: Record<string, string | number>) => string) {
  if (category.key.startsWith("registry:")) return category.registries[0];
  return t(`mods.detail.dataCategories.${category.key}`);
}
