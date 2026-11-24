export function namespaceFromIdentifier(identifier: string) {
  const separator = identifier.indexOf(":");
  return separator > 0 ? identifier.slice(0, separator) : "";
}

// Template schemas historically used both short family names and namespaced
// kind codes. Normalize that persisted schema boundary before catalog queries.
export function normalizeCatalogResourceKind(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "enchantment") return "minecraft.enchantment";
  if (normalized === "item") return "minecraft.item";
  if (normalized === "block") return "minecraft.block";
  if (normalized === "entity" || normalized === "entity_type") return "minecraft.entity_type";
  return normalized;
}

const registryFamilies = new Map<string, string>([
  ["minecraft.item", "items"],
  ["minecraft.block", "blocks"],
  ["minecraft.fluid", "fluids"],
  ["minecraft.entity_type", "entity_types"],
  ["minecraft.mob_effect", "mob_effects"],
  ["minecraft.potion", "potions"],
  ["minecraft.enchantment", "enchantments"],
  ["minecraft.advancement", "advancements"],
  ["minecraft.key_mapping", "key_mappings"],
  ["minecraft.natural_generation", "natural_generation"],
  ["minecraft.structure", "world_structures"],
  ["minecraft.dimension", "dimensions"],
  ["minecraft.biome", "biomes"],
  ["minecraft.loot_table", "loot_tables"],
  ["minecraft.game_setting", "game_settings"],
]);

export function catalogRegistryForKind(kindCode: string) {
  const normalized = normalizeCatalogResourceKind(kindCode);
  return registryFamilies.get(normalized.includes(".") ? normalized : "minecraft." + normalized);
}
