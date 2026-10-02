"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuthSnapshot } from "../_lib/auth";
import { localizedCatalogResourceName } from "../_lib/content-language";
import {
  formatLootNumber,
  lootEntryIdentity,
  lootEntryItemID,
  lootEntryQuantity,
  lootEntryReferenceID,
  lootEntryTagID,
  lootTableItemIDs,
  lootTablePools,
  lootTableReferenceIDs,
} from "../_lib/loot-table-model";
import { minecraftLocale, modExportAssetURL } from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import type { ModContentEntryField, ModContentEntryType } from "../_lib/mod-content-api";
import { RecipeResourceVisual, recipeSlotPresentation } from "./recipe-resource-slot";
import {
  recipeIngredientMergeKey,
  UnifiedRecipeCard,
  type UnifiedRecipeMaterial,
} from "./unified-recipe-card";
import { RecipeEditLink } from "./recipe-edit-link";
import { useRotatingValue } from "./rotating-resource";

export function ModResourceProperties({
  data,
  entryType,
  registry,
}: {
  data: Record<string, unknown>;
  entryType?: ModContentEntryType;
  registry: string;
}) {
  const { locale, t } = useI18n();
  if (entryType) return <SchemaResourceProperties data={data} entryType={entryType} locale={locale} />;
  const attributeModifiers = arrayRecords(data.attributeModifiers);
  const placement = record(data.placement);
  const isNaturalGeneration = registry === "natural_generation";
  const isWorldStructure = registry === "world_structures";
  const isDimension = registry === "dimensions";
  const isBiome = registry === "biomes";
  const isBlock = registry === "blocks";
  const isEntity = registry === "entity_types";
  const isEnchantment = registry === "enchantments" || [data.minimumLevel, data.maximumLevel, data.supportedItemsTag].some(hasValue);
  const isMobEffect = registry === "mob_effects" || [data.colorRGB, data.effectAttributeModifiers].some(hasValue);
  const isFluid = registry === "fluids" || (registry === "ingredients" && data.ingredientKind === "fluid") || [data.bucketItemId, data.fluidTags].some(hasValue);
  const isAdvancement = registry === "advancements" || [data.parentId, data.childrenIds, data.criteria, data.requirements].some(hasValue);
  const isKeyMapping = registry === "key_mappings" || [data.defaultKey, data.categoryTranslationKey].some(hasValue);
  const hasBlockProperties = isBlock || [
    data.hardness, data.explosionResistance, data.requiresCorrectTool, data.blockTags,
    data.friction, data.lightLevel, data.lootTable,
  ].some(hasValue);
  const hasItemProperties = registry === "items"
    || [data.durability, data.tierId, data.attackDamageModifier, data.enchantable].some(hasValue)
    || attributeModifiers.length > 0
    || Array.isArray(data.itemTypes);
  const blockRows: PropertyRow[] = hasBlockProperties ? [
    property("hardness", data.hardness), property("explosionResistance", data.explosionResistance),
    property("requiresCorrectTool", data.requiresCorrectTool), property("preferredTools", data.preferredTools),
    property("requiredTier", data.requiredTier), property("requiredMiningLevel", data.miningLevel),
    tagProperty("miningTags", data.miningTags, "minecraft:block"), tagProperty("tierTags", data.tierTags, "minecraft:block"),
    tagProperty("blockTags", data.blockTags, "minecraft:block"), property("friction", data.friction),
    property("speedFactor", data.speedFactor), property("jumpFactor", data.jumpFactor),
    property("lightEmission", data.lightLevel), property("solid", data.solid), property("liquid", data.liquid),
    property("occlusion", data.canOcclude ?? data.occlusion), property("blocksMotion", data.blocksMotion),
    property("renderShape", data.renderShape), property("hasBlockEntity", data.hasBlockEntity),
    property("randomlyTicking", data.randomlyTicking), property("pistonReaction", data.pistonReaction),
    lootProperty("lootTable", data.lootTable, data.resourceSources),
  ].filter(hasPropertyValue) : [];
  const toolRows: PropertyRow[] = hasItemProperties ? [
    property("damageable", data.damageable), property("maxDamage", data.durability),
    property("maxStackSize", data.maxStackSize), property("primaryType", data.primaryType), property("itemTypes", data.itemTypes),
    property("tierId", data.tierId), property("miningLevel", data.miningLevel), property("tierDurability", data.tierDurability),
    property("miningSpeed", data.miningSpeed), property("attackDamageBonus", data.attackDamageBonus),
    property("enchantmentValue", data.enchantmentValue), resourceProperty("repairItems", data.repairItems, data.resourceSources),
    tagProperty("repairTag", data.repairTag, "minecraft:item"),
    tagProperty("incorrectBlocksForDrops", data.incorrectBlocksForDrops, "minecraft:block"),
    property("attackDamage", data.attackDamage), property("attackSpeed", data.attackSpeed),
    property("attackDamageModifier", data.attackDamageModifier), property("attackSpeedModifier", data.attackSpeedModifier),
    property("enchantable", data.enchantable), property("enchantingPower", data.enchantability),
    resourceProperty("compatibleEnchantments", data.compatibleEnchantments, data.resourceSources), tagProperty("itemTags", data.itemTags, "minecraft:item"),
  ].filter(hasPropertyValue) : [];
  const entityRows: PropertyRow[] = isEntity ? [
    property("maxHealth", data.maxHealth), property("armorValue", data.armorValue),
    property("width", data.width), property("height", data.height), property("eyeHeight", data.eyeHeight),
    property("maxAirSupply", data.maxAirSupply), property("category", data.category), property("mobType", data.mobType),
    property("living", data.living), property("mob", data.mob), property("animal", data.animal), property("hostile", data.hostile),
    property("tamable", data.tamable), property("ageable", data.ageable), property("waterAnimal", data.waterAnimal),
    property("fireImmune", data.fireImmune), property("canSummon", data.canSummon), property("canSerialize", data.canSerialize),
    property("trackingRange", data.trackingRange), property("updateInterval", data.updateInterval),
    property("runtimePropertiesAvailable", data.runtimePropertiesAvailable), property("spawnEggCount", data.spawnEggCount),
    lootProperty("defaultLootTable", data.defaultLootTable, data.resourceSources),
    resourceProperty("spawnEggs", data.spawnEggs, data.resourceSources), resourceProperty("breedingMaterials", data.breedingMaterials, data.resourceSources),
    property("defaultEquipment", data.defaultEquipment),
  ].filter(hasPropertyValue) : [];
  const naturalRows: PropertyRow[] = isNaturalGeneration ? [
    property("entryKind", data.entryKind), property("category", data.category),
    property("featureType", data.featureType ?? data.carverType), itemProperty("outputs", arrayRecords(data.outputs).map((output) => output.block_id).filter(Boolean)),
    itemProperty("targets", data.targets), property("size", data.size),
    property("count", placement.count), property("distribution", placement.distribution), property("minY", placement.min_y), property("maxY", placement.max_y),
    property("probability", data.probability), itemProperty("generationSteps", data.generationSteps), itemProperty("biomeSelectors", data.biomeSelectors),
    resourceProperty("resolvedBiomes", data.resolvedBiomeIds, data.resourceSources), resourceProperty("dimensions", data.dimensionIds, data.resourceSources),
    property("normalizationStatus", data.normalizationStatus),
  ].filter(hasPropertyValue) : [];
  const structureRows: PropertyRow[] = isWorldStructure ? [
    property("structureType", data.structureType), tagProperty("biomeTag", data.biomeTag, "minecraft:worldgen/biome"),
    resourceProperty("biomes", data.biomeIds, data.resourceSources),
    property("generationStep", data.generationStep), property("terrainAdaptation", data.terrainAdaptation),
    property("startPool", data.startPool), property("jigsawSize", data.jigsawSize), property("startHeight", data.startHeight),
    property("maxDistance", data.maxDistanceFromCenter), itemProperty("structureSets", data.structureSetIds), property("definitionSource", data.definitionSource),
  ].filter(hasPropertyValue) : [];
  const dimensionRows: PropertyRow[] = isDimension ? [
    property("dimensionType", data.dimensionType), property("generatorType", data.generatorType),
    property("generatorSettings", data.generatorSettings), property("biomeSource", data.biomeSource),
    resourceProperty("biomes", data.biomeIds, data.resourceSources), property("ambientLight", data.ambientLight),
    property("coordinateScale", data.coordinateScale), property("minimumY", data.minimumY), property("height", data.height),
    property("logicalHeight", data.logicalHeight), property("natural", data.natural), property("ultrawarm", data.ultrawarm),
    property("hasSkylight", data.hasSkylight), property("hasCeiling", data.hasCeiling), property("bedWorks", data.bedWorks),
    property("respawnAnchorWorks", data.respawnAnchorWorks), property("hasRaids", data.hasRaids),
    tagProperty("infiniburnTag", data.infiniburnTag, "minecraft:block"),
  ].filter(hasPropertyValue) : [];
  const biomeRows: PropertyRow[] = isBiome ? [
    property("hasPrecipitation", data.hasPrecipitation), property("temperature", data.temperature), property("downfall", data.downfall),
    property("creatureSpawnProbability", data.creatureSpawnProbability), property("effects", data.effects), property("spawnData", data.spawnData),
    resourceProperty("spawnedEntities", data.spawnedEntityIds, data.resourceSources),
    resourceProperty("naturalGeneration", data.featureIds, data.resourceSources),
    resourceProperty("carvers", data.carverIds, data.resourceSources),
    resourceProperty("dimensions", data.dimensionIds, data.resourceSources),
  ].filter(hasPropertyValue) : [];
  const enchantmentRows: PropertyRow[] = isEnchantment ? [
    property("minimumLevel", data.minimumLevel), property("maximumLevel", data.maximumLevel), property("rarity", data.rarity),
    property("rarityWeight", data.rarityWeight), property("anvilCost", data.anvilCost), property("treasureOnly", data.treasureOnly),
    property("curse", data.curse), property("tradeable", data.tradeable), property("discoverable", data.discoverable), property("slots", data.slots),
    tagProperty("supportedItemsTag", data.supportedItemsTag, "minecraft:item"),
    resourceProperty("supportedItems", data.supportedItems, data.resourceSources),
    resourceProperty("exclusiveWith", data.exclusiveWith, data.resourceSources),
    property("costs", data.costs), property("effectComponentCount", data.effectComponentCount),
  ].filter(hasPropertyValue) : [];
  const mobEffectRows: PropertyRow[] = isMobEffect ? [
    property("category", data.category), property("colorRGB", data.colorRGB), property("beneficial", data.beneficial),
    property("instant", data.instant), property("attributeModifiers", data.effectAttributeModifiers),
  ].filter(hasPropertyValue) : [];
  const fluidRows: PropertyRow[] = isFluid ? [
    property("ingredientKind", data.ingredientKind), property("source", data.source), property("amount", data.amount),
    resourceProperty("bucketItem", data.bucketItemId, data.resourceSources), tagProperty("fluidTags", data.fluidTags, "minecraft:fluid"),
    property("density", data.density), property("temperature", data.temperature), property("viscosity", data.viscosity),
    property("luminosity", data.luminosity), property("gaseous", data.gaseous),
  ].filter(hasPropertyValue) : [];
  const advancementDisplay = record(data.display);
  const advancementRows: PropertyRow[] = isAdvancement ? [
    resourceProperty("parent", data.parentId, data.resourceSources), resourceProperty("children", data.childrenIds, data.resourceSources),
    property("description", localizedRecordValue(advancementDisplay.description_names, minecraftLocale(locale))),
    resourceProperty("icon", data.iconItemId ?? record(advancementDisplay.icon).item, data.resourceSources), property("frame", advancementDisplay.frame),
    property("positionX", advancementDisplay.x), property("positionY", advancementDisplay.y), property("hidden", advancementDisplay.hidden),
    property("showToast", advancementDisplay.show_toast), property("announceChat", advancementDisplay.announce_chat), property("background", advancementDisplay.background),
    property("criteria", data.criteria), property("requirements", data.requirements), property("maximumCriteriaRequired", data.maximumCriteriaRequired),
    property("rewards", data.rewards), property("sendsTelemetryEvent", data.sendsTelemetryEvent),
  ].filter(hasPropertyValue) : [];
  const keyMappingRows: PropertyRow[] = isKeyMapping ? [
    property("sourceModId", data.sourceModId), property("sourceDetection", data.sourceDetection),
    property("category", localizedRecordValue(data.categoryNames, minecraftLocale(locale)) || data.categoryTranslationKey),
    property("categoryTranslationKey", data.categoryTranslationKey), property("defaultKey", data.defaultKey), property("boundKey", data.boundKey),
    property("defaultBinding", data.defaultBinding), property("unbound", data.unbound),
  ].filter(hasPropertyValue) : [];

  if (!blockRows.length
    && !toolRows.length
    && !entityRows.length
    && !naturalRows.length
    && !structureRows.length
    && !dimensionRows.length
    && !biomeRows.length
    && !enchantmentRows.length
    && !mobEffectRows.length
    && !fluidRows.length
    && !advancementRows.length
    && !keyMappingRows.length
    && !attributeModifiers.length) return null;

  return <div className="mt-4 space-y-4">
    {naturalRows.length ? <PropertyGroup namespace="naturalGenerationProperties" title={t("mods.exportImport.entry.naturalGenerationProperties.title")} rows={naturalRows} /> : null}
    {structureRows.length ? <PropertyGroup namespace="worldStructureProperties" title={t("mods.exportImport.entry.worldStructureProperties.title")} rows={structureRows} /> : null}
    {dimensionRows.length ? <PropertyGroup namespace="dimensionProperties" title={t("mods.exportImport.entry.dimensionProperties.title")} rows={dimensionRows} /> : null}
    {biomeRows.length ? <PropertyGroup namespace="biomeProperties" title={t("mods.exportImport.entry.biomeProperties.title")} rows={biomeRows} /> : null}
    {enchantmentRows.length ? <PropertyGroup namespace="enchantmentProperties" title={t("mods.exportImport.entry.enchantmentProperties.title")} rows={enchantmentRows} /> : null}
    {mobEffectRows.length ? <PropertyGroup namespace="mobEffectProperties" title={t("mods.exportImport.entry.mobEffectProperties.title")} rows={mobEffectRows} /> : null}
    {fluidRows.length ? <PropertyGroup namespace="fluidProperties" title={t("mods.exportImport.entry.fluidProperties.title")} rows={fluidRows} /> : null}
    {advancementRows.length ? <PropertyGroup namespace="advancementProperties" title={t("mods.exportImport.entry.advancementProperties.title")} rows={advancementRows} /> : null}
    {keyMappingRows.length ? <PropertyGroup namespace="keyMappingProperties" title={t("mods.exportImport.entry.keyMappingProperties.title")} rows={keyMappingRows} /> : null}
    {blockRows.length ? <PropertyGroup namespace="blockProperties" title={t("mods.exportImport.entry.blockProperties.title")} rows={blockRows} /> : null}
    {toolRows.length ? <PropertyGroup namespace="toolProperties" title={t("mods.exportImport.entry.toolProperties.title")} rows={toolRows} /> : null}
    {entityRows.length ? <PropertyGroup namespace="entityProperties" title={t("mods.exportImport.entry.entityProperties.title")} rows={entityRows} /> : null}
    {attributeModifiers.length ? <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{t("mods.exportImport.entry.toolProperties.attributeModifiers")}</h2>
      <div className="divide-y divide-[var(--line)]">{attributeModifiers.map((slot, index) => <AttributeSlot key={index} slot={slot} />)}</div>
    </section> : null}
  </div>;
}

type PropertyRow = {
  key: string;
  label?: string;
  value: unknown;
  kind?: "tag" | "loot" | "item" | "resource" | "health" | "armor" | "range";
  registry?: string;
  href?: string;
  resourceSources?: unknown;
};

function SchemaResourceProperties({ data, entryType, locale }: { data: Record<string, unknown>; entryType: ModContentEntryType; locale: string }) {
  const groups = entryType.groups.map((group) => ({
    code: group.code,
    title: schemaLocalizedName(group.names, locale, schemaLocalizedName(entryType.names, locale, entryType.code)),
    rows: group.fields.map((field) => schemaPropertyRow(field, data, locale)).filter(hasPropertyValue),
  })).filter((group) => group.rows.length);
  if (!groups.length) return null;
  return <div className="mt-4 space-y-4">{groups.map((group) => <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]" key={group.code}>
    <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{group.title}</h2>
    <dl className="divide-y divide-[var(--line)]">{group.rows.map((row) => <div className="px-4 py-3" key={row.key}>
      <dt className="text-xs font-bold text-[var(--muted)]">{row.label || row.key}</dt>
      <dd className="mt-1 break-words text-sm font-semibold"><PropertyValue row={row} /></dd>
    </div>)}</dl>
  </section>)}</div>;
}

function schemaPropertyRow(field: ModContentEntryField, data: Record<string, unknown>, locale: string): PropertyRow {
  const row: PropertyRow = {
    key: field.code,
    label: schemaLocalizedName(field.names, locale, field.code),
    value: data[field.code],
  };
  if (field.format === "health" || field.format === "armor" || field.format === "range") row.kind = field.format;
  if (field.type === "reference" || field.type === "reference-list") {
    if (field.referenceKind === "tag" || field.format === "tag") {
      row.kind = "tag";
      row.registry = field.referenceRegistry || "minecraft:item";
    } else {
      row.kind = "resource";
      row.resourceSources = data.resourceSources;
    }
  }
  return row;
}

function schemaLocalizedName(names: Record<string, string>, locale: string, fallback: string) {
  const normalized = locale.replaceAll("_", "-");
  const language = normalized.split("-")[0].toLowerCase();
  return names[locale]
    || names[normalized]
    || Object.entries(names).find(([key]) => key.toLowerCase().split("-")[0] === language)?.[1]
    || names["zh-CN"]
    || names["en-US"]
    || Object.values(names).find(Boolean)
    || fallback;
}

function SchemaNumericIcons({ kind, value }: { kind: "health" | "armor"; value: number }) {
  const normalized = Math.max(0, Math.trunc(value));
  const fullCount = Math.floor(normalized / 2);
  const hasHalf = normalized % 2 === 1;
  const source = (variant: "full" | "half") => `/mc-icons/icon-${kind}-${variant}.svg`;
  if (fullCount > 10) return <span className="inline-flex items-center gap-1" title={String(value)}><Image unoptimized alt="" height={18} src={source("full")} width={18} /><span>× {normalized / 2}</span></span>;
  return <span className="inline-flex flex-wrap gap-0.5" title={String(value)}>{Array.from({ length: fullCount }, (_, index) => <Image unoptimized alt="" height={18} key={index} src={source("full")} width={18} />)}{hasHalf ? <Image unoptimized alt="" height={18} src={source("half")} width={18} /> : null}</span>;
}

function property(key: string, value: unknown): PropertyRow {
  return { key, value };
}

function tagProperty(key: string, value: unknown, registry: string): PropertyRow {
  return { key, value, kind: "tag", registry };
}

function itemProperty(key: string, value: unknown): PropertyRow {
  return { key, value, kind: "item" };
}

function resourceProperty(key: string, value: unknown, resourceSources: unknown): PropertyRow {
  return { key, value, kind: "resource", resourceSources };
}

function lootProperty(key: string, value: unknown, resourceSources: unknown): PropertyRow {
  const id = stringValue(value);
  const source = record(record(resourceSources)[id]);
  return { key, value, kind: "loot", href: resourceSourceHref(source) };
}

function hasPropertyValue(row: PropertyRow) {
	return hasValue(row.value);
}

function hasValue(value: unknown) {
	return value !== undefined
		&& value !== null
		&& value !== ""
		&& (!Array.isArray(value) || value.length > 0);
}

function PropertyGroup({
  title,
  rows,
  namespace,
}: {
  title: string;
  rows: PropertyRow[];
  namespace: "blockProperties" | "toolProperties" | "entityProperties" | "naturalGenerationProperties" | "worldStructureProperties" | "dimensionProperties" | "biomeProperties" | "enchantmentProperties" | "mobEffectProperties" | "fluidProperties" | "advancementProperties" | "keyMappingProperties";
}) {
  const { t } = useI18n();
  return <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{title}</h2>
    <dl className="divide-y divide-[var(--line)]">{rows.map((row) => <div className="px-4 py-3" key={row.key}>
      <dt className="text-xs font-bold text-[var(--muted)]">{row.label || t(`mods.exportImport.entry.${namespace}.${row.key}`)}</dt>
      <dd className="mt-1 break-words text-sm font-semibold"><PropertyValue row={row} /></dd>
    </div>)}</dl>
  </section>;
}

function PropertyValue({ row }: { row: PropertyRow }) {
  const { locale, t } = useI18n();
  if (row.kind === "loot" && row.href) {
    return <Link className="text-[var(--accent)] hover:underline" href={row.href} target="_blank" rel="noopener noreferrer">{String(row.value)}</Link>;
  }
  if (row.kind === "tag") {
    const values = Array.isArray(row.value) ? row.value.map(String) : [String(row.value)];
    return <span className="flex flex-wrap gap-1">{values.map((raw) => {
      const value = raw.replace(/^#/, "");
      return <Link className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent)] hover:underline" href={`/mods-tag?registry=${encodeURIComponent(row.registry || "minecraft:item")}&tagId=${encodeURIComponent(value)}`} target="_blank" rel="noopener noreferrer" key={raw}>#{value}</Link>;
    })}</span>;
  }
  if (row.kind === "resource") {
    const values = Array.isArray(row.value) ? row.value.map(String) : [String(row.value)];
    const sources = record(row.resourceSources);
    return <span className="flex flex-wrap gap-1">{values.map((value) => {
      const source = record(sources[value]);
      const href = resourceSourceHref(source);
      const label = localizedRecordValue(source.names, minecraftLocale(locale)) || value;
      return href
        ? <Link className="rounded bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent)] hover:underline" href={href} key={value} rel="noopener noreferrer" target="_blank" title={value}>{label}</Link>
        : <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs" key={value}>{label}</code>;
    })}</span>;
  }
  if (row.kind === "item" && Array.isArray(row.value)) {
    return <span className="flex flex-wrap gap-1">{row.value.map(String).map((value) => <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs" key={value}>{value}</code>)}</span>;
  }
  if ((row.kind === "health" || row.kind === "armor") && typeof row.value === "number") {
    return <SchemaNumericIcons kind={row.kind} value={row.value} />;
  }
  if (row.kind === "range" && Array.isArray(row.value) && row.value.length === 2) {
    return <>{String(row.value[0])} – {String(row.value[1])}</>;
  }
  return <>{formatExportProperty(row.value, t)}</>;
}

function AttributeSlot({ slot }: { slot: Record<string, unknown> }) {
  const modifiers = arrayRecords(slot.modifiers);
  return <div className="px-4 py-3">
    <strong className="text-sm">{stringValue(slot.slot) || "any"}</strong>
    <div className="mt-2 grid gap-2">{modifiers.map((modifier, index) => <div className="rounded bg-[var(--panel-subtle)] p-2 text-xs" key={index}>
      <code className="break-all">{stringValue(modifier.attribute) || stringValue(modifier.name)}</code>
      <span className="mt-1 block text-[var(--muted)]">{String(modifier.amount ?? 0)} · {String(modifier.operation ?? modifier.operation_id ?? "add")}</span>
    </div>)}</div>
  </div>;
}

export function ModLootTableView({ data }: { data: Record<string, unknown> }) {
  const { locale, t } = useI18n();
  const definition = record(data.definition);
  const pools = lootTablePools(data);
  const sources = record(data.resourceSources);
  const category = lootCategory(data);
  const possibleItemIDs = uniqueStrings([
    ...stringArray(data.possibleItemIds),
    ...lootTableItemIDs(pools),
  ]);
  const referencedLootTables = uniqueStrings([
    ...stringArray(data.referencedLootTables),
    ...lootTableReferenceIDs(pools),
  ]);
  const definitionAvailable = data.definitionAvailable === true
    || Object.keys(definition).length > 0
    || pools.length > 0;
  const visibleItems = possibleItemIDs.slice(0, 24);

  return <section className="mt-7 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-5 py-4">
      <div>
        <h2 className="text-xl font-black">{t("mods.exportImport.entry.loot.title")}</h2>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loot.poolCount", { count: pools.length })}</p>
      </div>
      <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-black text-[var(--accent)]">{t(`mods.exportImport.entry.loot.categories.${category}`)}</span>
    </header>

    {possibleItemIDs.length ? <div className="border-b border-[var(--line)] p-5">
      <h3 className="text-sm font-black">{t("mods.exportImport.entry.loot.possibleContents")}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((itemID) => <LootResourceChip id={itemID} key={itemID} locale={locale} source={record(sources[itemID])} />)}
      </div>
      {possibleItemIDs.length > visibleItems.length ? <p className="mt-3 text-xs font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loot.moreContents", { count: possibleItemIDs.length - visibleItems.length })}</p> : null}
    </div> : null}

    {!definitionAvailable ? <div className="m-5 rounded-lg border border-dashed border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_7%,transparent)] p-4">
      <strong className="block text-[var(--warning)]">{t("mods.exportImport.entry.loot.definitionUnavailable")}</strong>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("mods.exportImport.entry.loot.definitionUnavailableHint")}</p>
    </div> : <div className="space-y-4 p-5">
      {pools.map((pool, index) => <LootPool key={`${index}:${String(pool.pool_index ?? "")}`} number={index + 1} pool={pool} sources={sources} />)}
    </div>}

    {referencedLootTables.length ? <div className="border-t border-[var(--line)] p-5">
      <h3 className="text-sm font-black">{t("mods.exportImport.entry.loot.references")}</h3>
      <div className="mt-3 flex flex-wrap gap-2">{referencedLootTables.map((referenceID) => {
        const source = record(sources[referenceID]);
        const href = stringValue(source.detailUrl);
        return href
          ? <Link className="rounded bg-[var(--accent-soft)] px-2.5 py-1.5 font-mono text-xs font-bold text-[var(--accent)] hover:underline" href={href} key={referenceID} rel="noopener noreferrer" target="_blank">{referenceID}</Link>
          : <code className="rounded bg-[var(--panel-subtle)] px-2.5 py-1.5 text-xs" key={referenceID}>{referenceID}</code>;
      })}</div>
    </div> : null}
  </section>;
}

function LootPool({
  number,
  pool,
  sources,
}: {
  number: number;
  pool: Record<string, unknown>;
  sources: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const entries = arrayRecords(pool.entries);
  const conditions = lootRuleNames(pool.conditions ?? pool.condition_types);
  const functions = lootRuleNames(pool.functions ?? pool.function_types);
  return <article className="overflow-hidden rounded-lg border border-[var(--line)]">
    <header className="flex flex-wrap items-start justify-between gap-3 bg-[var(--panel-subtle)] px-4 py-3">
      <div><h3 className="font-black">{t("mods.exportImport.entry.loot.pool", { number })}</h3><span className="mt-1 block text-xs font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loot.entryCount", { count: numberValue(pool.entry_count, entries.length) })}</span></div>
      <dl className="flex flex-wrap gap-2 text-xs">
        <div className="rounded bg-[var(--panel)] px-2 py-1"><dt className="inline font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loot.rolls")}: </dt><dd className="inline font-black">{formatLootNumber(pool.rolls)}</dd></div>
        {pool.bonus_rolls !== undefined ? <div className="rounded bg-[var(--panel)] px-2 py-1"><dt className="inline font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loot.bonusRolls")}: </dt><dd className="inline font-black">{formatLootNumber(pool.bonus_rolls)}</dd></div> : null}
      </dl>
    </header>
    {conditions.length || functions.length ? <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-3">
      <LootRuleChips label={t("mods.exportImport.entry.loot.condition")} rules={conditions} />
      <LootRuleChips label={t("mods.exportImport.entry.loot.function")} rules={functions} />
    </div> : null}
    {entries.length ? <div className="grid gap-2 border-t border-[var(--line)] p-3 sm:grid-cols-2">{entries.map((entry, index) => <LootEntryCard entry={entry} key={`${index}:${lootEntryIdentity(entry)}`} sources={sources} />)}</div> : <p className="border-t border-[var(--line)] p-4 text-sm text-[var(--muted)]">{t("mods.exportImport.entry.loot.noEntries")}</p>}
  </article>;
}

function LootEntryCard({
  entry,
  sources,
}: {
  entry: Record<string, unknown>;
  sources: Record<string, unknown>;
}) {
  const { locale, t } = useI18n();
  const type = stringValue(entry.entry_type) || stringValue(entry.type);
  const kind = stringValue(entry.entry_kind);
  const rawName = stringValue(entry.name) || stringValue(entry.value);
  const itemID = lootEntryItemID(entry);
  const tagID = lootEntryTagID(entry);
  const referenceID = lootEntryReferenceID(entry);
  const sourceID = itemID || referenceID;
  const source = record(sources[sourceID]);
  const href = tagID
    ? `/mods-tag?registry=minecraft:item&tagId=${encodeURIComponent(tagID)}`
    : stringValue(source.detailUrl);
  const title = localizedRecordValue(source.names, minecraftLocale(locale))
    || (tagID ? `#${tagID}` : sourceID || rawName || type || kind || "?");
  const iconPath = stringValue(source.iconPath);
  const sourceRevisionID = stringValue(source.sourceRevisionId);
  const iconURL = iconPath && sourceRevisionID ? modExportAssetURL(sourceRevisionID, iconPath) : "";
  const conditions = lootRuleNames(entry.conditions ?? entry.condition_types);
  const functions = lootRuleNames(entry.functions ?? entry.function_types);
  const children = arrayRecords(entry.children);
  const quantity = lootEntryQuantity(entry);
  const content = <div className="flex min-w-0 items-center gap-3">
    {iconURL ? <Image unoptimized alt="" className="h-12 w-12 shrink-0 object-contain [image-rendering:pixelated]" height={48} src={iconURL} width={48} /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-sm font-black text-[var(--muted)]">{tagID ? "#" : referenceID ? "↗" : type.includes("empty") ? "∅" : "?"}</span>}
    <span className="min-w-0 flex-1"><strong className="block truncate">{title}</strong><code className="mt-1 block truncate text-[10px] text-[var(--muted)]">{tagID ? `#${tagID}` : sourceID || type}</code></span>
  </div>;
  return <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
    {href ? <Link className="focus-ring block rounded hover:text-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{content}</Link> : content}
    <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-bold text-[var(--muted)]">
      {entry.weight !== undefined ? <span className="rounded bg-[var(--panel-subtle)] px-1.5 py-1">{t("mods.exportImport.entry.loot.weight")}: {String(entry.weight)}</span> : null}
      {entry.quality !== undefined ? <span className="rounded bg-[var(--panel-subtle)] px-1.5 py-1">{t("mods.exportImport.entry.loot.quality")}: {String(entry.quality)}</span> : null}
      {quantity ? <span className="rounded bg-[var(--panel-subtle)] px-1.5 py-1">× {quantity}</span> : null}
      {conditions.map((rule) => <span className="rounded bg-[var(--accent-soft)] px-1.5 py-1 text-[var(--accent)]" key={`c:${rule}`}>{t("mods.exportImport.entry.loot.condition")}: {rule}</span>)}
      {functions.map((rule) => <span className="rounded bg-[var(--panel-subtle)] px-1.5 py-1" key={`f:${rule}`}>{t("mods.exportImport.entry.loot.function")}: {rule}</span>)}
    </div>
    {children.length ? <div className="mt-3 grid gap-2 border-l-2 border-[var(--accent)] pl-2">{children.map((child, index) => <LootEntryCard entry={child} key={`${index}:${lootEntryIdentity(child)}`} sources={sources} />)}</div> : null}
  </article>;
}

function LootResourceChip({
  id,
  locale,
  source,
}: {
  id: string;
  locale: string;
  source: Record<string, unknown>;
}) {
  const name = localizedRecordValue(source.names, minecraftLocale(locale)) || id;
  const iconPath = stringValue(source.iconPath);
  const revisionID = stringValue(source.sourceRevisionId);
  const iconURL = iconPath && revisionID ? modExportAssetURL(revisionID, iconPath) : "";
  const href = stringValue(source.detailUrl);
  const content = <><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--panel-subtle)]">{iconURL ? <Image unoptimized alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" height={36} src={iconURL} width={36} /> : <span className="text-xs font-black text-[var(--muted)]">?</span>}</span><span className="min-w-0"><strong className="block truncate text-sm">{name}</strong><code className="block truncate text-[10px] text-[var(--muted)]">{id}</code></span></>;
  return href
    ? <Link className="focus-ring flex min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2 hover:border-[var(--accent)]" href={href} rel="noopener noreferrer" target="_blank">{content}</Link>
    : <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] p-2">{content}</div>;
}

function LootRuleChips({ label, rules }: { label: string; rules: string[] }) {
  return <>{rules.map((rule) => <span className="rounded bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--accent)]" key={`${label}:${rule}`}>{label}: {rule}</span>)}</>;
}

export function ModRecipeGallery({
  title,
  recipes,
  revisionId,
}: {
  title: string;
  recipes: Record<string, unknown>[];
  revisionId: string;
}) {
  return <section className="mt-8 border-t border-[var(--line)] pt-5">
    <h2 className="text-xl font-black">{title}</h2>
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">{recipes.map((recipe, index) => <RecipeLayoutCard key={`${String(recipe.id)}:${index}`} recipe={recipe} revisionId={revisionId} />)}</div>
  </section>;
}

function RecipeLayoutCard({ recipe, revisionId }: { recipe: Record<string, unknown>; revisionId: string }) {
  const { locale, t } = useI18n();
  const { user } = useAuthSnapshot();
  const layout = record(recipe.jeiLayout);
  const background = typeof layout.background === "string" ? layout.background : "";
  const canvas = record(layout.canvas);
  const displayScale = 2;
  const width = numberValue(canvas.width, 185) * displayScale;
  const height = numberValue(canvas.height, 93) * displayScale;
  const slots = Array.isArray(layout.slots)
    ? layout.slots.map(record).filter((slot) => slot.ingredient_present !== false && slot.coordinates_available !== false)
    : [];
  const containsIngredients = layout.background_contains_ingredients === true;
  const layoutKind = stringValue(layout.layout_kind) || "unknown";
  const sourceMod = stringValue(layout.source_mod_id);
  const sourceVersion = stringValue(layout.source_mod_version);
  const materials: UnifiedRecipeMaterial[] = slots.filter((slot) => slot.role === "input").map((slot) => {
    const item = record((Array.isArray(slot.alternatives) ? slot.alternatives : [])[0]);
    const id = stringValue(item.item)
      || stringValue(item.resource_location)
      || (stringValue(slot.tag) ? `#${stringValue(slot.tag)}` : "?");
    return {
      id,
      name: localizedRecordValue(item.names, minecraftLocale(locale)) || id,
      amount: recipeMaterialAmount(item),
      href: modRecipeMaterialHref(slot, item),
      mergeKey: recipeIngredientMergeKey(slot, item),
    };
  });
  const sourceData = record(layout.source_data);
  const recipeID = stringValue(recipe.recipeId)
    || stringValue(sourceData.recipe_id)
    || stringValue(recipe.sourceRecipeId)
    || stringValue(recipe.id)
    || stringValue(recipe.type);
  const recipeType = stringValue(layout.underlying_recipe_type_id) || stringValue(recipe.type);
  const recipePublicID = stringValue(recipe.publicId) || stringValue(recipe.entityId);
  const sourceSiteID = stringValue(recipe.modSiteId);
  const visual = background
    ? <div className="relative mx-auto" style={{ width, height }}>
      <Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={modExportAssetURL(revisionId, background)} />
      {slots.map((value, index) => <ModRecipeSlot key={index} locale={locale} scale={displayScale} showVisual={!containsIngredients} slot={value} />)}
    </div>
    : <div className="grid min-h-32 place-items-center p-4 text-sm text-slate-700">{String(recipe.type || "Recipe")}</div>;
  const editHref = user && recipePublicID && recipeType
    ? `/recipe-types?editor=recipe-edit&id=${encodeURIComponent(recipeType)}&recipePublicId=${encodeURIComponent(recipePublicID)}`
    : "";
  return <UnifiedRecipeCard
    badge={t(`globalCatalog.recipeLayoutKinds.${layoutKind}`)}
    editAction={editHref ? <RecipeEditLink className="button-secondary focus-ring px-3 py-1.5 text-sm" href={editHref}>{t("common.edit")}</RecipeEditLink> : undefined}
    labels={{
      materials: t("globalCatalog.materials"),
      note: t("globalCatalog.recipeNote"),
      noNote: t("globalCatalog.noNote"),
      technical: t("globalCatalog.technicalInfo"),
      recipeId: t("globalCatalog.recipeIdLabel"),
      recipeType: t("globalCatalog.recipeTypeLabel"),
      source: t("globalCatalog.sourceLabel"),
    }}
    materials={materials}
    note={stringValue(recipe.note)}
    recipeId={recipeID}
    recipeType={recipeType}
    recipeTypeHref={recipeType ? `/recipe-types?id=${encodeURIComponent(recipeType)}` : undefined}
    source={sourceMod ? `${sourceMod}${sourceVersion ? `@${sourceVersion}` : ""}` : ""}
    sourceHref={sourceSiteID ? `/mods/${encodeURIComponent(sourceSiteID)}` : undefined}
    technicalInfo={{
      entityId: stringValue(recipe.entityId) || stringValue(recipe.id),
      templateId: stringValue(layout.template_id),
      layoutKind,
      revisionId,
    }}
    visual={visual}
  />;
}

function recipeMaterialAmount(item: Record<string, unknown>) {
  if (typeof item.amount_text === "string" && item.amount_text) return item.amount_text;
  const amount = numberValue(item.amount ?? item.count, 1);
  const unit = stringValue(item.unit) || stringValue(item.amount_unit);
  return `${amount}${unit}`;
}

function ModRecipeCandidateChanceLabel({
  candidate,
  slot,
  locale,
}: {
  candidate: Record<string, unknown>;
  slot: Record<string, unknown>;
  locale: string;
}) {
  const role = stringValue(slot.role) || stringValue(slot.semantic_role);
  if (role !== "output" && role !== "byproduct") return null;
  const candidateHasChance = candidate.chance_available === true
    || candidate.chance !== undefined
    || candidate.chance_percent !== undefined
    || candidate.probability !== undefined
    || candidate.byproduct !== undefined;
  const source = candidateHasChance ? candidate : slot;
  if (source.chance_available === false) return null;
  const text = localizedRecipeChance(source, locale);
  if (!text) return null;
  const percent = numberValue(
    source.chance_percent,
    numberValue(source.chance ?? source.probability, Number.NaN) * 100,
  );
  const badgeText = Number.isFinite(percent)
    ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`
    : text;
  return <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#242424] px-1 py-0.5 text-[9px] font-black leading-none text-white shadow" title={text}>{badgeText}</span>;
}

function localizedRecipeChance(slot: Record<string, unknown>, locale: string) {
  const normalized = minecraftLocale(locale);
  const texts = record(slot.chance_texts);
  if (typeof texts[normalized] === "string") return texts[normalized] as string;
  if (typeof slot.chance_text === "string" && slot.chance_text) return slot.chance_text;
  const percent = numberValue(slot.chance_percent, numberValue(slot.chance, Number.NaN) * 100);
  return Number.isFinite(percent)
    ? `${percent.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`
    : "";
}

function ModRecipeSlot({
  slot,
  scale,
  locale,
  showVisual,
}: {
  slot: Record<string, unknown>;
  scale: number;
  locale: string;
  showVisual: boolean;
}) {
  const item = record(useRotatingValue(Array.isArray(slot.alternatives) ? slot.alternatives : []));
  if (slot.ingredient_present === false || slot.coordinates_available === false) return null;
  const itemId = stringValue(item.item) || stringValue(item.resource_location);
  const tagId = stringValue(slot.tag) || stringValue(item.tag);
  // Imported recipe layouts still use tagEntityId; its value is the canonical
  // public ID. Normalize it at this external-format boundary.
  const tagPublicId = stringValue(slot.tagPublicId) || stringValue(slot.tagEntityId);
  const sourceRevisionId = stringValue(item.sourceRevisionId);
  const sourceSiteId = stringValue(item.sourceModSiteId);
  const sourcePublicId = stringValue(item.publicId);
  const iconPath = stringValue(item.iconPath);
  const resourceId = tagId ? `#${tagId}` : itemId;
  const displayName = localizedRecordValue(item.names, minecraftLocale(locale)) || resourceId;
  const tooltipResourceId = tagId && itemId ? `${itemId} · ${resourceId}` : resourceId;
  const presentation = recipeSlotPresentation(slot, item, scale);
  const src = iconPath && sourceRevisionId ? modExportAssetURL(sourceRevisionId, iconPath) : "";
  const content = <>
    <RecipeResourceVisual
      fallback={tagId ? "#" : "?"}
      name={displayName}
      presentation={presentation}
      resourceId={tooltipResourceId}
      showVisual={showVisual}
      src={src}
    />
    <ModRecipeCandidateChanceLabel candidate={item} locale={locale} slot={slot} />
  </>;
  const label = `${displayName || resourceId} (${tooltipResourceId})`;
  const slotClass = "group focus-ring absolute z-10 hover:z-40 focus-visible:z-40";
  if (tagId && tagPublicId) {
    return <Link
      aria-label={label}
      className={slotClass}
      href={`/mods-tag?publicId=${encodeURIComponent(tagPublicId)}`}
      style={presentation.style}
    >{content}</Link>;
  }
  if (itemId) {
    const href = stringValue(item.detailUrl)
      || canonicalImportedResourceHref(
        sourceSiteId,
        stringValue(item.sourceVersionPublicId),
        sourcePublicId,
      );
    if (href) {
      return <Link aria-label={label} className={slotClass} href={href} style={presentation.style} target="_blank" rel="noopener noreferrer">{content}</Link>;
    }
  }
  return <span aria-label={label} className="group absolute z-10 hover:z-40 focus-visible:z-40" style={presentation.style} tabIndex={resourceId ? 0 : undefined}>{content}</span>;
}

function modRecipeMaterialHref(slot: Record<string, unknown>, item: Record<string, unknown>) {
  const tagId = stringValue(slot.tag) || stringValue(item.tag);
  if (tagId) {
    const tagPublicId = stringValue(slot.tagPublicId) || stringValue(slot.tagEntityId);
    return tagPublicId ? `/mods-tag?publicId=${encodeURIComponent(tagPublicId)}` : undefined;
  }
  const itemId = stringValue(item.item) || stringValue(item.resource_location);
  const sourceSiteId = stringValue(item.sourceModSiteId);
  if (!itemId) return undefined;
  return stringValue(item.detailUrl)
    || canonicalImportedResourceHref(
      sourceSiteId,
      stringValue(item.sourceVersionPublicId),
      stringValue(item.publicId),
    )
    || undefined;
}

function canonicalImportedResourceHref(
  siteId: string,
  versionPublicId: string,
  resourcePublicId: string,
) {
  if (!siteId || !versionPublicId || !resourcePublicId) return "";
  return `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourcePublicId)}?version=${encodeURIComponent(versionPublicId)}`;
}

function resourceSourceHref(source: Record<string, unknown>) {
  return stringValue(source.detailUrl)
    || canonicalImportedResourceHref(
      stringValue(source.sourceModSiteId),
      stringValue(source.sourceVersionPublicId),
      stringValue(source.publicId),
    );
}

function localizedRecordValue(value: unknown, locale: string) {
  const names = Object.fromEntries(
    Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return localizedCatalogResourceName({ id: "", names }, locale, "", "en-US");
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function lootCategory(data: Record<string, unknown>) {
  const category = stringValue(data.category).toLowerCase();
  const path = (stringValue(data.path) || stringValue(data.id).split(":").slice(1).join(":")).toLowerCase();
  if (category === "block" || category === "blocks" || path.startsWith("blocks/")) return "blocks";
  if (category === "chest" || category === "chests" || path.startsWith("chests/")) return "chests";
  if (category === "entity" || category === "entities" || path.startsWith("entities/")) return "entities";
  if (category === "fishing" || path.startsWith("gameplay/fishing") || path.startsWith("fishing/")) return "fishing";
  if (category === "archaeology" || path.startsWith("archaeology/")) return "archaeology";
  if (category === "equipment" || path.startsWith("equipment/")) return "equipment";
  if (category === "gameplay" || path.startsWith("gameplay/")) return "gameplay";
  return "other";
}

function lootRuleNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((rule) => {
    if (typeof rule === "string") return rule;
    const item = record(rule);
    return stringValue(item.condition)
      || stringValue(item.function)
      || stringValue(item.type)
      || stringValue(item.predicate);
  }));
}

function formatExportProperty(
  value: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (typeof value === "boolean") return t(value ? "common.yes" : "common.no");
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
