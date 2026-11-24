export type LootTableRecord = Record<string, unknown>;

export type LootEntryFamily =
  | "item"
  | "tag"
  | "loot_table"
  | "empty"
  | "alternatives"
  | "group"
  | "sequence"
  | "dynamic"
  | "custom";

const knownEntryFamilies = new Set<LootEntryFamily>([
  "item",
  "tag",
  "loot_table",
  "empty",
  "alternatives",
  "group",
  "sequence",
  "dynamic",
]);

export function lootTablePools(data: LootTableRecord) {
  if (Array.isArray(data.pools)) return records(data.pools);
  // Older exporter packages wrapped the vanilla document in `definition`.
  // Canonical website documents store pools directly.
  return records(record(data.definition).pools);
}

export function lootEntryFamily(entry: LootTableRecord): LootEntryFamily {
  // A mod can register its own entry with the same path as a vanilla type.
  const type = text(entry.type) || text(entry.entry_type) || text(entry.entry_kind);
  const family = type.toLowerCase().replace(/^minecraft:/, "") as LootEntryFamily;
  return knownEntryFamilies.has(family) ? family : "custom";
}

export function lootEntryIdentifier(entry: LootTableRecord, family = lootEntryFamily(entry)) {
  const fallback = text(entry.name) || text(entry.value);
  if (family === "item") return text(entry.item_id) || fallback;
  if (family === "tag") return (text(entry.tag_id) || fallback).replace(/^#/, "");
  if (family === "loot_table") {
    return text(entry.loot_table_id) || text(entry.loot_table) || text(entry.value) || text(entry.name);
  }
  return fallback.replace(/^#/, "");
}

type LootIdentifierFamily = "item" | "tag" | "loot_table" | "dynamic";
const identifierAliases: Record<LootIdentifierFamily, string> = {
  item: "item_id", tag: "tag_id", loot_table: "loot_table_id", dynamic: "dynamic_id",
};

export function withLootEntryIdentifier(entry: LootTableRecord, family: LootIdentifierFamily, identifier: string) {
  const next = { ...entry };
  if (family === "loot_table") {
    if ("name" in next) next.name = identifier;
    if ("value" in next || !("name" in next)) next.value = identifier;
    if (typeof next.loot_table === "string") next.loot_table = identifier;
  } else {
    next.name = identifier;
  }
  const alias = identifierAliases[family];
  if (alias in next) next[alias] = identifier;
  return next;
}

export function lootEntryItemID(entry: LootTableRecord) {
  return lootEntryFamily(entry) === "item" ? lootEntryIdentifier(entry, "item") : "";
}

export function lootEntryTagID(entry: LootTableRecord) {
  return lootEntryFamily(entry) === "tag" ? lootEntryIdentifier(entry, "tag") : "";
}

export function lootEntryReferenceID(entry: LootTableRecord) {
  return lootEntryFamily(entry) === "loot_table" ? lootEntryIdentifier(entry, "loot_table") : "";
}

export function lootEntryIdentity(entry: LootTableRecord) {
  return lootEntryItemID(entry)
    || lootEntryTagID(entry)
    || lootEntryReferenceID(entry)
    || text(entry.name)
    || text(entry.value)
    || text(entry.entry_type)
    || text(entry.type);
}

export function lootTableItemIDs(pools: readonly LootTableRecord[]) {
  return collectEntryIdentifiers(pools, lootEntryItemID);
}

export function lootTableReferenceIDs(pools: readonly LootTableRecord[]) {
  return collectEntryIdentifiers(pools, lootEntryReferenceID);
}

export function lootSetCountFunction(entry: LootTableRecord) {
  return records(entry.functions).find(isLootSetCountFunction);
}

export function isLootSetCountFunction(value: LootTableRecord) {
  const kind = text(value.function) || text(value.type);
  return kind === "minecraft:set_count" || kind === "set_count";
}

export function withLootEntryQuantity(entry: LootTableRecord, count: unknown): LootTableRecord {
  const functions = Array.isArray(entry.functions) ? [...entry.functions] : [];
  const index = functions.findIndex((value) => isLootSetCountFunction(record(value)));
  if (count === undefined) {
    if (index < 0) return entry;
    functions.splice(index, 1);
  } else if (index < 0) {
    functions.push({ function: "minecraft:set_count", count });
  } else {
    functions[index] = { ...record(functions[index]), count };
  }
  const next = { ...entry };
  if (functions.length) next.functions = functions;
  else delete next.functions;
  return next;
}

export function lootEntryQuantity(entry: LootTableRecord) {
  if (entry.count !== undefined) return formatLootNumber(entry.count);
  const setCount = lootSetCountFunction(entry);
  return setCount?.count !== undefined ? formatLootNumber(setCount.count) : "";
}

export function formatLootNumber(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (typeof value === "string") return value;
  const range = record(value);
  const min = range.min ?? range.minimum;
  const max = range.max ?? range.maximum;
  if (min !== undefined || max !== undefined) return `${String(min ?? max)}–${String(max ?? min)}`;
  return Object.keys(range).length ? JSON.stringify(range) : "-";
}

function collectEntryIdentifiers(
  pools: readonly LootTableRecord[],
  identifier: (entry: LootTableRecord) => string,
) {
  const values: string[] = [];
  const visit = (entries: LootTableRecord[]) => {
    for (const entry of entries) {
      const value = identifier(entry).trim();
      if (value) values.push(value);
      visit(records(entry.children));
    }
  };
  for (const pool of pools) visit(records(pool.entries));
  return [...new Set(values)];
}

function records(value: unknown): LootTableRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): LootTableRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LootTableRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
