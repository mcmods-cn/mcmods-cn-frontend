"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuthSnapshot } from "../_lib/auth";
import { catalogAssetURL, type GlobalRecipe, localizedCatalogName } from "../_lib/global-catalog-api";
import { useI18n } from "../_lib/i18n-provider";
import { RecipeEditLink } from "./recipe-edit-link";
import { recipeMaterialMeasure, type RecipeMaterial } from "../_lib/recipe-slot-amount.mts";
import { RecipeCandidateChanceLabel, RecipeResourceVisual, recipeSlotAmountLabel, recipeSlotPresentation } from "./recipe-resource-slot";
import { useRotatingValue } from "./rotating-resource";
import { recipeIngredientMergeKey, UnifiedRecipeCard } from "./unified-recipe-card";

export function GlobalRecipeCard({ recipe, editHref }: { recipe: GlobalRecipe; editHref?: string }) {
  const { locale, t } = useI18n();
  const { user } = useAuthSnapshot();
  const layout = recipe.layout || {};
  const slots = Array.isArray(layout.slots) ? layout.slots.map(record).filter((slot) => slot.ingredient_present !== false && slot.coordinates_available !== false) : [];
  const background = typeof layout.background === "string" ? layout.background : "";
  const canvas = record(layout.canvas);
  const displayScale = 2;
  const width = numberValue(canvas.width, 185) * displayScale;
  const height = numberValue(canvas.height, 93) * displayScale;
  const contains = layout.background_contains_ingredients === true;
  const sourceMod = typeof layout.source_mod_id === "string" ? layout.source_mod_id : "";
  const sourceVersion = typeof layout.source_mod_version === "string" ? layout.source_mod_version : "";
  const inputs = slots.filter((slot) => slot.role === "input");
  const materials: RecipeMaterial[] = inputs.map((slot) => {
    const item = record((Array.isArray(slot.alternatives) ? slot.alternatives : [])[0]);
    const id = String(item.id || slot.tag || "?");
    return {
      id: typeof slot.tag === "string" ? `#${slot.tag}` : id,
      name: localizedCatalogName(recordStrings(item.names), locale, id),
      ...recipeMaterialMeasure(item),
      href: globalRecipeMaterialHref(slot, item),
      mergeKey: recipeIngredientMergeKey(slot, item),
    };
  });
  const layoutKind = typeof layout.layout_kind === "string" ? layout.layout_kind : "unknown";
  const recipeType = typeof layout.underlying_recipe_type_id === "string" ? layout.underlying_recipe_type_id : "";
  const templateID = typeof layout.template_id === "string" ? layout.template_id : "";
  const visual = <div className="relative mx-auto" style={{ width, height }}>{background ? <Image unoptimized fill alt="" className="object-contain [image-rendering:pixelated]" sizes={`${width}px`} src={catalogAssetURL(recipe.revisionId, background)} /> : null}{slots.map((slot, index) => <RecipeSlot key={index} locale={locale} scale={displayScale} showVisual={!contains} slot={slot} />)}</div>;
  return <UnifiedRecipeCard badge={t(`globalCatalog.recipeLayoutKinds.${layoutKind}`)} editAction={user && editHref ? <RecipeEditLink className="button-secondary focus-ring px-3 py-1.5 text-sm" href={editHref}>{t("common.edit")}</RecipeEditLink> : undefined} materials={materials} note={recipe.note} recipeId={recipe.recipeId} recipeType={recipeType} recipeTypeHref={recipe.recipeTypePublicId ? `/recipe-types?publicId=${encodeURIComponent(recipe.recipeTypePublicId)}` : undefined} source={sourceMod ? `${sourceMod}${sourceVersion ? `@${sourceVersion}` : ""}` : ""} sourceHref={recipe.modSiteId ? `/mods/${encodeURIComponent(recipe.modSiteId)}` : undefined} technicalInfo={{ recipeIdSource: recipe.recipeIdSource, templateId: templateID, fingerprint: recipe.semanticFingerprint }} visual={visual} />;
}

function RecipeSlot({ slot, scale, locale, showVisual }: { slot: Record<string, unknown>; scale: number; locale: string; showVisual: boolean }) {
  const item = record(useRotatingValue(Array.isArray(slot.alternatives) ? slot.alternatives : []));
  if (!Object.keys(item).length) return null;
  const itemId = String(item.id || "");
  const tagId = typeof slot.tag === "string" ? slot.tag : typeof item.tag === "string" ? item.tag : "";
  const sourceRevisionId = typeof item.sourceRevisionId === "string" ? item.sourceRevisionId : "";
  const iconPath = typeof item.iconPath === "string" ? item.iconPath : "";
  const tagPublicId = typeof slot.tagPublicId === "string" ? slot.tagPublicId : "";
  const resourceId = tagId ? `#${tagId}` : itemId;
  const displayName = localizedCatalogName(recordStrings(item.names), locale, itemId || resourceId);
  const tooltipResourceId = tagId && itemId ? `${itemId} · ${resourceId}` : resourceId;
  const presentation = recipeSlotPresentation(slot, item, scale);
  const src = iconPath && sourceRevisionId ? catalogAssetURL(sourceRevisionId, iconPath) : "";
  const content = <><RecipeResourceVisual amountLabel={recipeSlotAmountLabel(item)} fallback={tagId ? "#" : "?"} name={displayName} presentation={presentation} resourceId={tooltipResourceId} showVisual={showVisual} src={src} /><RecipeCandidateChanceLabel candidate={item} locale={locale} slot={slot} /></>;
  const label = `${displayName || resourceId} (${tooltipResourceId})`;
  const slotClass = "group focus-ring absolute z-10 hover:z-40 focus-visible:z-40";
  if (tagId && tagPublicId) return <Link aria-label={label} className={slotClass} href={`/mods-tag?publicId=${encodeURIComponent(tagPublicId)}`} style={presentation.style}>{content}</Link>;
  const detailUrl = canonicalRecipeResourceHref(item);
  if (itemId && detailUrl) return <Link aria-label={label} className={slotClass} href={detailUrl} target="_blank" rel="noopener noreferrer" style={presentation.style}>{content}</Link>;
  return <span aria-label={label} className="group absolute z-10 hover:z-40 focus-visible:z-40" style={presentation.style} tabIndex={resourceId ? 0 : undefined}>{content}</span>;
}

function globalRecipeMaterialHref(slot: Record<string, unknown>, item: Record<string, unknown>) {
  const tagId = typeof slot.tag === "string" ? slot.tag : typeof item.tag === "string" ? item.tag : "";
  if (tagId) {
    const tagPublicId = typeof slot.tagPublicId === "string" ? slot.tagPublicId : "";
    return tagPublicId ? `/mods-tag?publicId=${encodeURIComponent(tagPublicId)}` : undefined;
  }
  const itemId = String(item.id || "");
  if (!itemId) return undefined;
  return canonicalRecipeResourceHref(item) || undefined;
}

function canonicalRecipeResourceHref(item: Record<string, unknown>) {
  if (typeof item.detailUrl === "string" && item.detailUrl) return item.detailUrl;
  const siteId = typeof item.sourceModSiteId === "string" ? item.sourceModSiteId : "";
  const versionId = typeof item.sourceVersionPublicId === "string" ? item.sourceVersionPublicId : "";
  const resourceId = typeof item.publicId === "string" ? item.publicId : "";
  if (!siteId || !versionId || !resourceId) return "";
  return `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(versionId)}`;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function recordStrings(value: unknown): Record<string, string> { const source = record(value); return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string")); }
function numberValue(value: unknown, fallback: number) { if (value === null || value === undefined || value === "") return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
