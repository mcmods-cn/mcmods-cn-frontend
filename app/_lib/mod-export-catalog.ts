import type { ModExportRevision } from "./mod-export-api";

export type ModExportCategory = {
  key: string;
  registries: string[];
  count: number;
  icon: string;
  tone: string;
  documentKind?: "advancements" | "key_mappings" | "biomes" | "dimensions" | "natural_generation" | "world_structures" | "loot_tables" | "ingredients" | "worldgen_data";
};

const definitions: ReadonlyArray<Omit<ModExportCategory, "count">> = [
  { key: "itemsBlocks", registries: ["items", "blocks"], icon: "cube", tone: "text-emerald-600 bg-emerald-500/10" },
  { key: "entities", registries: ["entity_types"], icon: "entity", tone: "text-blue-600 bg-blue-500/10" },
  { key: "enchantments", registries: ["enchantments"], icon: "enchantment", tone: "text-violet-600 bg-violet-500/10" },
  { key: "buffs", registries: ["mob_effects", "potions"], icon: "effect", tone: "text-rose-600 bg-rose-500/10" },
  { key: "biomes", registries: [], icon: "biome", tone: "text-lime-700 bg-lime-500/10", documentKind: "biomes" },
  { key: "dimensions", registries: [], icon: "database", tone: "text-indigo-700 bg-indigo-500/10", documentKind: "dimensions" },
  { key: "naturalGeneration", registries: [], icon: "biome", tone: "text-green-700 bg-green-500/10", documentKind: "natural_generation" },
  { key: "worldStructures", registries: [], icon: "structure", tone: "text-amber-700 bg-amber-500/10", documentKind: "world_structures" },
  { key: "lootTables", registries: [], icon: "database", tone: "text-yellow-700 bg-yellow-500/10", documentKind: "loot_tables" },
  { key: "fluids", registries: ["fluids"], icon: "fluid", tone: "text-cyan-700 bg-cyan-500/10" },
  { key: "keybinds", registries: [], icon: "keyboard", tone: "text-sky-700 bg-sky-500/10", documentKind: "key_mappings" },
  { key: "achievements", registries: [], icon: "achievement", tone: "text-yellow-700 bg-yellow-500/10", documentKind: "advancements" },
];

// These registries are imported to derive classifications and relationships.
// They are implementation data, not standalone documentation categories.
const internalRegistries = new Set(["block_entity_types", "creative_tabs", "ingredients", "menu_types", "worldgen_data"]);

export function modExportCategories(revision?: ModExportRevision): ModExportCategory[] {
  if (!revision) return [];
  const claimed = new Set<string>();
  const result: ModExportCategory[] = [];
  for (const definition of definitions) {
    const count = definition.documentKind === "advancements"
        ? revision.advancementCount
        : definition.documentKind === "key_mappings"
          ? revision.keyMappingCount
          : definition.documentKind
            ? (revision.documentCounts?.[definition.documentKind] ?? 0)
        : definition.registries.reduce((sum, registry) => sum + (revision.registryCounts[registry] ?? 0), 0);
    definition.registries.forEach((registry) => claimed.add(registry));
    if (definition.documentKind) claimed.add(definition.documentKind);
    if (count > 0) result.push({ ...definition, registries: [...definition.registries], count });
  }
  for (const [registry, count] of Object.entries(revision.registryCounts)) {
    if (count > 0 && !claimed.has(registry) && !internalRegistries.has(registry)) {
      result.push({ key: `registry:${registry}`, registries: [registry], count, icon: "database", tone: "text-slate-700 bg-slate-500/10" });
    }
  }
  return result;
}

export function modExportCategoryTitle(category: ModExportCategory, t: (key: string, values?: Record<string, string | number>) => string) {
  if (category.key.startsWith("registry:")) return category.registries[0];
  return t(`mods.detail.dataCategories.${category.key}`);
}
