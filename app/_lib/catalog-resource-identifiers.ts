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

export function catalogRegistryForKind(kindCode: string) {
  const normalized = kindCode.trim().toLowerCase();
  if (normalized.includes("block")) return "blocks";
  if (normalized.includes("item")) return "items";
  if (normalized.includes("entity")) return "entity_types";
  if (normalized.includes("fluid")) return "fluids";
  if (normalized.includes("mob_effect") || normalized.includes("effect")) return "mob_effects";
  if (normalized.includes("potion")) return "potions";
  if (normalized.includes("enchantment")) return "enchantments";
  if (normalized.includes("advancement")) return "advancements";
  if (normalized.includes("key_mapping")) return "key_mappings";
  if (normalized.includes("natural_generation")) return "natural_generation";
  if (normalized.includes("world_structure") || normalized.includes("structure")) return "world_structures";
  if (normalized.includes("dimension")) return "dimensions";
  if (normalized.includes("biome")) return "biomes";
  if (normalized.includes("loot_table")) return "loot_tables";
  return undefined;
}
