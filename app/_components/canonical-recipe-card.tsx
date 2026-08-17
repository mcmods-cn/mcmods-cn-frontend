"use client";

/* eslint-disable @next/next/no-img-element */

import { catalogResourceIconURL } from "../_lib/editor-api";
import { localizedCatalogName } from "../_lib/global-catalog-api";
import { useI18n } from "../_lib/i18n-provider";
import type { RecipeCandidate, RecipeRecord, RecipeTemplateRecord, RecipeTemplateSlot } from "../_lib/recipe-editor-types";
import { useRotatingValue } from "./rotating-resource";
import { UnifiedRecipeCard, type UnifiedRecipeMaterial } from "./unified-recipe-card";

export function CanonicalRecipeCard({ recipe, template }: { recipe: RecipeRecord; template: RecipeTemplateRecord }) {
  const { locale, t } = useI18n();
  const inputs = template.slots.filter((slot) => slot.role === "input");
  const materials: UnifiedRecipeMaterial[] = inputs.flatMap((slot) => {
    const candidates = recipe.bindings[slot.slotKey]?.candidates ?? [];
    const candidate = candidates[0];
    if (!candidate) return [];
    return [{
      id: candidate.resource.id || candidate.resource.rawIdentifier || candidate.resource.publicId,
      name: localizedCatalogName(candidate.resource.names, locale, candidate.resource.id || candidate.resource.rawIdentifier || "?"),
      amount: String(candidate.amount),
      mergeKey: candidate.resource.publicId || candidate.resource.id || candidate.resource.rawIdentifier,
    }];
  });
  const localization = recipe.localizations?.find((item) => item.locale === locale)
    ?? recipe.localizations?.find((item) => item.locale === recipe.defaultLocale)
    ?? recipe.localizations?.[0];
  const scale = 2;
  const width = Math.max(1, template.canvas.width) * scale;
  const height = Math.max(1, template.canvas.height) * scale;
  const visual = <div className="relative mx-auto bg-[#8b8b8b] bg-contain bg-center bg-no-repeat [image-rendering:pixelated]" style={{ width, height, backgroundImage: template.backgroundUrl ? `url(${JSON.stringify(template.backgroundUrl)})` : undefined }}>{template.slots.map((slot) => <CanonicalRecipeSlot binding={recipe.bindings[slot.slotKey]?.candidates ?? []} key={slot.slotKey} scale={scale} slot={slot} />)}</div>;
  return <UnifiedRecipeCard applicableVersions={recipe.applicableVersionIds} badge={t("globalCatalog.recipeLayoutKinds.manual")} labels={{ materials: t("globalCatalog.materials"), note: t("globalCatalog.recipeNote"), noNote: t("globalCatalog.noNote"), technical: t("globalCatalog.technicalInfo"), recipeId: t("globalCatalog.recipeIdLabel"), recipeType: t("globalCatalog.recipeTypeLabel"), source: t("globalCatalog.sourceLabel") }} materials={materials} note={localization?.fields.contentMarkdown} recipeId={recipe.canonicalSourceId} recipeType={recipe.recipeTypePublicId} recipeTypeHref={`/recipe-types?publicId=${encodeURIComponent(recipe.recipeTypePublicId)}`} source={recipe.sourceVersion?.modName || ""} sourceHref={recipe.sourceVersion?.modSiteId ? `/mods/${encodeURIComponent(recipe.sourceVersion.modSiteId)}` : undefined} technicalInfo={{ templateId: template.publicId || template.templateKey, publicId: recipe.publicId || "" }} visual={visual} />;
}

function CanonicalRecipeSlot({ binding, scale, slot }: { binding: RecipeCandidate[]; scale: number; slot: RecipeTemplateSlot }) {
  const candidate = useRotatingValue(binding);
  if (!candidate) return null;
  const resource = candidate.resource;
  const icon = catalogResourceIconURL(resource.iconUrl);
  const left = slot.rect.x * scale;
  const top = slot.rect.y * scale;
  const width = slot.rect.width * scale;
  const height = slot.rect.height * scale;
  const name = resource.id || resource.rawIdentifier || resource.publicId;
  const content = <>{icon ? <img alt="" className="h-full w-full object-contain [image-rendering:pixelated]" src={icon} /> : <span className="grid h-full w-full place-items-center font-black text-black/60">?</span>}{candidate.amount !== 1 ? <span className="absolute bottom-0 right-0 rounded bg-black/75 px-1 text-[10px] font-black text-white">{candidate.amount}</span> : null}{slot.role === "output" && candidate.probability !== undefined ? <span className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-black text-white">{Math.round(candidate.probability * 10000) / 100}%</span> : null}</>;
  const style = { left, top, width, height };
  return <span className="absolute z-10" style={style} title={name}>{content}</span>;
}
