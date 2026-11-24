"use client";

import Link from "next/link";

import { mergeRecipeMaterials, type RecipeMaterial } from "../_lib/recipe-slot-amount.mts";
import { useI18n } from "../_lib/i18n-provider";

export function UnifiedRecipeCard({
  badge,
  materials,
  visual,
  note,
  recipeId,
  recipeType,
  recipeTypeHref,
  source,
  sourceHref,
  applicableVersions,
  technicalInfo,
  editAction,
}: {
  badge?: string;
  materials: RecipeMaterial[];
  visual: React.ReactNode;
  note?: string;
  recipeId: string;
  recipeType?: string;
  recipeTypeHref?: string;
  source?: string;
  sourceHref?: string;
  applicableVersions?: string[];
  technicalInfo: Record<string, string>;
  editAction?: React.ReactNode;
}) {
  const { t } = useI18n();
  const mergedMaterials = mergeRecipeMaterials(materials);
  return <article className="@container overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
      <div className="min-w-0">{badge ? <span className="inline-block rounded bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold">{badge}</span> : null}</div>
      <div className="flex shrink-0 items-center gap-2">{editAction}<span className="group relative"><button aria-label={t("globalCatalog.technicalInfo")} className="focus-ring grid h-7 w-7 place-items-center rounded-full border border-[var(--line)] text-xs font-black" type="button">i</button><span className="absolute right-0 top-full z-50 hidden w-80 pt-2 group-hover:block group-focus-within:block"><span className="block select-text rounded-md bg-[#242424] p-3 text-left text-xs text-white shadow-xl"><span className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 py-1"><strong>{t("globalCatalog.recipeIdLabel")}</strong><code className="break-all opacity-80">{recipeId || "-"}</code></span>{Object.entries(technicalInfo).map(([key, value]) => <span className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 py-1" key={key}><strong>{key}</strong><code className="break-all opacity-80">{value || "-"}</code></span>)}</span></span></span></div>
    </header>
    <div className="grid @min-[820px]:grid-cols-[minmax(170px,0.8fr)_minmax(400px,1.7fr)_minmax(150px,0.7fr)]">
      <aside className="min-w-0 border-b border-[var(--line)] p-4 @min-[820px]:border-b-0 @min-[820px]:border-r"><strong className="text-sm">{t("globalCatalog.materials")}</strong>{mergedMaterials.length ? <ul className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">{mergedMaterials.map((material, index) => <li className="min-w-0 text-sm" key={`${material.mergeKey || material.id}:${material.amount}:${index}`} title={material.id}>{material.href ? <Link className="block truncate font-bold text-[var(--accent)] hover:underline" href={material.href}>{material.name}{material.amount && <span className="ml-1 text-[var(--muted)]">× {material.amount}</span>}</Link> : <span className="block truncate font-bold">{material.name}{material.amount && <span className="ml-1 text-[var(--muted)]">× {material.amount}</span>}</span>}<code className="block truncate text-[10px] text-[var(--muted)]">{material.id}</code></li>)}</ul> : <span className="mt-3 block text-sm text-[var(--muted)]">-</span>}</aside>
      <div className="min-w-0 overflow-auto bg-[#c6c6c6] p-4">{visual}</div>
      <aside className="min-w-0 border-t border-[var(--line)] p-4 @min-[820px]:border-l @min-[820px]:border-t-0"><strong className="text-sm">{t("globalCatalog.recipeNote")}</strong><p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm text-[var(--muted)]">{note || t("globalCatalog.noNote")}</p></aside>
    </div>
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] px-4 py-3 text-xs">
      {recipeType ? <span><strong className="mr-2 text-[var(--muted)]">{t("globalCatalog.recipeTypeLabel")}</strong>{recipeTypeHref ? <Link className="font-mono font-bold text-[var(--accent)] hover:underline" href={recipeTypeHref}>{recipeType}</Link> : <code>{recipeType}</code>}</span> : null}
      {source ? <span><strong className="mr-2 text-[var(--muted)]">{t("globalCatalog.sourceLabel")}</strong>{sourceHref ? <Link className="font-mono font-bold text-[var(--accent)] hover:underline" href={sourceHref}>{source}</Link> : <code>{source}</code>}</span> : null}
      {applicableVersions?.length ? <span><strong className="mr-2 text-[var(--muted)]">{t("catalogEditor.applicableVersions")}</strong><span className="font-mono font-bold">{applicableVersions.join(" / ")}</span></span> : null}
    </footer>
  </article>;
}

export function recipeIngredientMergeKey(slot: Record<string, unknown>, selected: Record<string, unknown>) {
  const tag = firstRecipeIdentityString(slot.tag, slot.item_tag_equivalent, selected.tag);
  if (tag) {
    const registry = firstRecipeIdentityString(
      slot.tagRegistry,
      slot.tag_registry,
      selected.tagRegistry,
      selected.sourceRegistry,
      selected.kindCode,
      selected.ingredient_kind,
      selected.ingredient_type,
    );
    return `tag|${registry}|${tag}`;
  }
  const alternatives = Array.isArray(slot.alternatives)
    ? slot.alternatives.map(recipeIdentityRecord)
    : [];
  const candidates = alternatives.length ? alternatives : [selected];
  const identities = candidates.map(recipeAlternativeIdentity).sort();
  return `alternatives|${identities.join("||")}`;
}

function recipeAlternativeIdentity(value: Record<string, unknown>) {
  const kind = firstRecipeIdentityString(
    value.kind,
    value.kindCode,
    value.sourceRegistry,
    value.ingredient_kind,
    value.ingredient_type,
  );
  const resource = firstRecipeIdentityString(
    value.id,
    value.item,
    value.resource_location,
    value.unique_id,
  );
  const nbt = firstRecipeIdentityString(value.nbt_snbt);
  const variant = stableRecipeIdentityValue(value.components ?? value.component_data ?? value.metadata ?? value.damage);
  return `${kind}|${resource}|${nbt}|${variant}`;
}

function recipeIdentityRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstRecipeIdentityString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stableRecipeIdentityValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return `[${value.map(stableRecipeIdentityValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${key}:${stableRecipeIdentityValue(nested)}`)
      .join(",")}}`;
  }
  return String(value);
}
