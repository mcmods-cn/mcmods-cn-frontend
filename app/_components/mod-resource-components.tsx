"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuthSnapshot } from "../_lib/auth";
import { localizedCatalogResourceName } from "../_lib/content-language";
import { minecraftLocale, modExportAssetURL } from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";
import { RecipeResourceVisual, recipeSlotPresentation } from "./recipe-resource-slot";
import {
  recipeIngredientMergeKey,
  UnifiedRecipeCard,
  type UnifiedRecipeMaterial,
} from "./unified-recipe-card";

export function ModResourceProperties({
  data,
  registry,
}: {
  data: Record<string, unknown>;
  registry: string;
}) {
  const { t } = useI18n();
  const durability = record(data.durability);
  const tool = record(data.tool);
  const tier = record(tool.tier);
  const combat = record(data.combat);
  const enchanting = record(data.enchanting);
  const attributeModifiers = arrayRecords(data.attribute_modifiers);
  const entityAttributes = arrayRecords(data.default_attributes);
  const placement = record(data.placement);
  const isNaturalGeneration = registry === "natural_generation";
  const isWorldStructure = registry === "world_structures";
  const isBlock = registry === "blocks";
  const isEntity = registry === "entity_types";
  const hasItemProperties = registry === "items"
    || Object.keys(tool).length > 0
    || Object.keys(combat).length > 0
    || Object.keys(enchanting).length > 0
    || attributeModifiers.length > 0
    || Array.isArray(data.item_types);
  const blockRows: PropertyRow[] = isBlock ? [
    property("hardness", data.hardness), property("explosionResistance", data.explosion_resistance),
    property("requiresCorrectTool", data.requires_correct_tool), property("preferredTools", data.preferred_tools),
    property("requiredTier", data.required_tier), property("requiredMiningLevel", data.required_mining_level),
    tagProperty("miningTags", data.mining_tags, "minecraft:block"), tagProperty("tierTags", data.tier_tags, "minecraft:block"),
    tagProperty("blockTags", data.block_tags, "minecraft:block"), property("friction", data.friction),
    property("speedFactor", data.speed_factor), property("jumpFactor", data.jump_factor),
    property("lightEmission", data.light_emission), property("solid", data.solid), property("liquid", data.liquid),
    property("occlusion", data.can_occlude ?? data.occlusion), property("blocksMotion", data.blocks_motion),
    property("renderShape", data.render_shape), property("hasBlockEntity", data.has_block_entity),
    property("randomlyTicking", data.randomly_ticking), property("pistonReaction", data.piston_reaction),
    lootProperty("lootTable", data.loot_table, data.resourceSources),
  ].filter(hasPropertyValue) : [];
  const toolRows: PropertyRow[] = hasItemProperties ? [
    property("damageable", durability.damageable ?? data.damageable), property("maxDamage", data.max_damage ?? durability.max_damage),
    property("maxStackSize", data.max_stack_size), property("primaryType", data.primary_type), property("itemTypes", data.item_types),
    property("tierId", tier.id), property("miningLevel", tier.mining_level ?? tool.mining_level), property("tierDurability", tier.durability),
    property("miningSpeed", tier.mining_speed ?? tool.mining_speed), property("attackDamageBonus", tier.attack_damage_bonus ?? tool.attack_damage),
    property("enchantmentValue", tier.enchantment_value ?? data.enchantment_value), itemProperty("repairItems", tier.repair_items ?? data.repair_items),
    tagProperty("incorrectBlocksForDrops", tier.incorrect_blocks_for_drops ?? data.incorrect_blocks_for_drops, "minecraft:block"),
    property("attackDamage", combat.attack_damage), property("attackSpeed", combat.attack_speed),
    property("attackDamageModifier", combat.attack_damage_modifier), property("attackSpeedModifier", combat.attack_speed_modifier),
    property("enchantable", enchanting.enchantable), property("enchantingPower", enchanting.enchantment_value),
    property("compatibleEnchantments", enchanting.compatible_enchantments), tagProperty("itemTags", data.item_tags, "minecraft:item"),
  ].filter(hasPropertyValue) : [];
  const entityRows: PropertyRow[] = isEntity ? [
    property("maxHealth", data.max_health), property("armorValue", data.armor_value),
    property("width", data.width), property("height", data.height), property("eyeHeight", data.eye_height),
    property("maxAirSupply", data.max_air_supply), property("category", data.category), property("mobType", data.mob_type),
    property("living", data.living), property("mob", data.mob), property("animal", data.animal), property("hostile", data.hostile),
    property("tamable", data.tamable), property("ageable", data.ageable), property("waterAnimal", data.water_animal),
    property("fireImmune", data.fire_immune), property("canSummon", data.can_summon), property("canSerialize", data.can_serialize),
    property("trackingRange", data.client_tracking_range), property("updateInterval", data.update_interval),
    property("runtimePropertiesAvailable", data.runtime_properties_available), property("spawnEggCount", data.spawn_egg_count),
    lootProperty("defaultLootTable", data.default_loot_table, data.resourceSources),
    itemProperty("spawnEggs", data.spawn_eggs), itemProperty("breedingMaterials", data.breeding_materials ?? data.breed_items),
    property("defaultEquipment", data.default_equipment),
  ].filter(hasPropertyValue) : [];
  const naturalRows: PropertyRow[] = isNaturalGeneration ? [
    property("entryKind", data.entry_kind), property("category", data.category),
    property("featureType", data.feature_type ?? data.carver_type), itemProperty("outputs", arrayRecords(data.outputs).map((output) => output.block_id).filter(Boolean)),
    itemProperty("targets", data.targets), property("size", data.size), property("discardChance", data.discard_chance_on_air_exposure),
    property("count", placement.count), property("distribution", placement.distribution), property("minY", placement.min_y), property("maxY", placement.max_y),
    property("probability", data.probability), itemProperty("generationSteps", data.generation_steps), itemProperty("biomeSelectors", data.biome_selectors),
    itemProperty("resolvedBiomes", data.resolved_biome_ids), itemProperty("dimensions", data.dimension_ids), property("dimensionResolution", data.dimension_resolution),
    property("normalizationStatus", data.normalization_status),
  ].filter(hasPropertyValue) : [];
  const structureRows: PropertyRow[] = isWorldStructure ? [
    property("structureType", data.structure_type), itemProperty("biomes", Array.isArray(data.biomes) ? data.biomes : data.biomes ? [data.biomes] : []),
    property("generationStep", data.generation_step), property("terrainAdaptation", data.terrain_adaptation),
    property("startPool", data.start_pool), property("jigsawSize", data.jigsaw_size), property("startHeight", data.start_height),
    property("maxDistance", data.max_distance_from_center), itemProperty("structureSets", data.structure_set_ids), property("definitionSource", data.definition_source),
  ].filter(hasPropertyValue) : [];

  if (!blockRows.length
    && !toolRows.length
    && !entityRows.length
    && !naturalRows.length
    && !structureRows.length
    && !attributeModifiers.length
    && !entityAttributes.length) return null;

  return <div className="mt-4 space-y-4">
    {naturalRows.length ? <PropertyGroup namespace="naturalGenerationProperties" title={t("mods.exportImport.entry.naturalGenerationProperties.title")} rows={naturalRows} /> : null}
    {structureRows.length ? <PropertyGroup namespace="worldStructureProperties" title={t("mods.exportImport.entry.worldStructureProperties.title")} rows={structureRows} /> : null}
    {blockRows.length ? <PropertyGroup namespace="blockProperties" title={t("mods.exportImport.entry.blockProperties.title")} rows={blockRows} /> : null}
    {toolRows.length ? <PropertyGroup namespace="toolProperties" title={t("mods.exportImport.entry.toolProperties.title")} rows={toolRows} /> : null}
    {entityRows.length ? <PropertyGroup namespace="entityProperties" title={t("mods.exportImport.entry.entityProperties.title")} rows={entityRows} /> : null}
    {entityAttributes.length ? <EntityAttributes attributes={entityAttributes} /> : null}
    {attributeModifiers.length ? <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{t("mods.exportImport.entry.toolProperties.attributeModifiers")}</h2>
      <div className="divide-y divide-[var(--line)]">{attributeModifiers.map((slot, index) => <AttributeSlot key={index} slot={slot} />)}</div>
    </section> : null}
  </div>;
}

type PropertyRow = {
  key: string;
  value: unknown;
  kind?: "tag" | "loot" | "item";
  registry?: string;
  href?: string;
};

function property(key: string, value: unknown): PropertyRow {
  return { key, value };
}

function tagProperty(key: string, value: unknown, registry: string): PropertyRow {
  return { key, value, kind: "tag", registry };
}

function itemProperty(key: string, value: unknown): PropertyRow {
  return { key, value, kind: "item" };
}

function lootProperty(key: string, value: unknown, resourceSources: unknown): PropertyRow {
  const id = stringValue(value);
  const source = record(record(resourceSources)[id]);
  const href = stringValue(source.detailUrl)
    || canonicalImportedResourceHref(
      stringValue(source.sourceModSiteId),
      stringValue(source.sourceVersionPublicId),
      stringValue(source.entityId),
    );
  return { key, value, kind: "loot", href };
}

function hasPropertyValue(row: PropertyRow) {
  const value = row.value;
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
  namespace: "blockProperties" | "toolProperties" | "entityProperties" | "naturalGenerationProperties" | "worldStructureProperties";
}) {
  const { t } = useI18n();
  return <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{title}</h2>
    <dl className="divide-y divide-[var(--line)]">{rows.map((row) => <div className="px-4 py-3" key={row.key}>
      <dt className="text-xs font-bold text-[var(--muted)]">{t(`mods.exportImport.entry.${namespace}.${row.key}`)}</dt>
      <dd className="mt-1 break-words text-sm font-semibold"><PropertyValue row={row} /></dd>
    </div>)}</dl>
  </section>;
}

function EntityAttributes({ attributes }: { attributes: Record<string, unknown>[] }) {
  const { t } = useI18n();
  return <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <h2 className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 font-black">{t("mods.exportImport.entry.entityProperties.defaultAttributes")}</h2>
    <dl className="divide-y divide-[var(--line)]">{attributes.map((attribute, index) => <div className="px-4 py-3" key={`${stringValue(attribute.attribute)}-${index}`}>
      <dt><code className="break-all text-xs font-bold text-[var(--accent)]">{stringValue(attribute.attribute) || "-"}</code></dt>
      <dd className="mt-1 text-sm text-[var(--muted)]">{t("mods.exportImport.entry.entityProperties.baseValue")}: {String(attribute.base_value ?? "-")} / {t("mods.exportImport.entry.entityProperties.defaultValue")}: {String(attribute.default_value ?? "-")}</dd>
    </div>)}</dl>
  </section>;
}

function PropertyValue({ row }: { row: PropertyRow }) {
  const { t } = useI18n();
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
  if (row.kind === "item" && Array.isArray(row.value)) {
    return <span className="flex flex-wrap gap-1">{row.value.map(String).map((value) => <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs" key={value}>{value}</code>)}</span>;
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
      {slots.map((value, index) => <ModRecipeSlot canvasWidth={width} key={index} locale={locale} scale={displayScale} showVisual={!containsIngredients} slot={value} />)}
    </div>
    : <div className="grid min-h-32 place-items-center p-4 text-sm text-slate-700">{String(recipe.type || "Recipe")}</div>;
  const editHref = user && recipePublicID && recipeType
    ? `/recipe-types?editor=recipe-edit&id=${encodeURIComponent(recipeType)}&recipePublicId=${encodeURIComponent(recipePublicID)}`
    : "";
  return <UnifiedRecipeCard
    badge={t(`globalCatalog.recipeLayoutKinds.${layoutKind}`)}
    editAction={editHref ? <Link className="button-secondary focus-ring px-3 py-1.5 text-sm" href={editHref}>{t("common.edit")}</Link> : undefined}
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
  canvasWidth,
  showVisual,
}: {
  slot: Record<string, unknown>;
  scale: number;
  locale: string;
  canvasWidth: number;
  showVisual: boolean;
}) {
  if (slot.ingredient_present === false || slot.coordinates_available === false) return null;
  const alternatives = Array.isArray(slot.alternatives) ? slot.alternatives : [];
  const item = record(alternatives[0]);
  const itemId = stringValue(item.item) || stringValue(item.resource_location);
  const tagId = stringValue(slot.tag) || stringValue(item.tag);
  const tagEntityId = stringValue(slot.tagEntityId);
  const sourceRevisionId = stringValue(item.sourceRevisionId);
  const sourceSiteId = stringValue(item.sourceModSiteId);
  const sourceEntityId = stringValue(item.entityId);
  const iconPath = stringValue(item.iconPath);
  const resourceId = tagId ? `#${tagId}` : itemId;
  const displayName = localizedRecordValue(item.names, minecraftLocale(locale)) || resourceId;
  const tooltipResourceId = tagId && itemId ? `${itemId} · ${resourceId}` : resourceId;
  const presentation = recipeSlotPresentation(slot, item, scale);
  const src = iconPath && sourceRevisionId ? modExportAssetURL(sourceRevisionId, iconPath) : "";
  const content = <>
    <RecipeResourceVisual
      canvasWidth={canvasWidth}
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
  if (tagId) {
    return <Link
      aria-label={label}
      className={slotClass}
      href={`/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`}
      style={presentation.style}
    >{content}</Link>;
  }
  if (itemId) {
    const href = stringValue(item.detailUrl)
      || canonicalImportedResourceHref(
        sourceSiteId,
        stringValue(item.sourceVersionPublicId),
        sourceEntityId,
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
    const tagEntityId = stringValue(slot.tagEntityId);
    return `/mods-tag?entityId=${encodeURIComponent(tagEntityId)}&registry=minecraft:item&tagId=${encodeURIComponent(tagId)}`;
  }
  const itemId = stringValue(item.item) || stringValue(item.resource_location);
  const sourceSiteId = stringValue(item.sourceModSiteId);
  if (!itemId) return undefined;
  return stringValue(item.detailUrl)
    || canonicalImportedResourceHref(
      sourceSiteId,
      stringValue(item.sourceVersionPublicId),
      stringValue(item.entityId),
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

function localizedRecordValue(value: unknown, locale: string) {
  const names = Object.fromEntries(
    Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return localizedCatalogResourceName({ id: "", names }, locale, "", "en-US");
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
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
