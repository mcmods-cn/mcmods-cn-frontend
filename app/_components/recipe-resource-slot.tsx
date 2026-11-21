import Image from "next/image";
import { minecraftLocale } from "../_lib/mod-export-api";
import { recipeCandidateChance } from "../_lib/recipe-slot-chance.mts";
import { FloatingTooltip } from "./floating-tooltip";

export { recipeSlotAmountLabel } from "../_lib/recipe-slot-amount.mts";
export { recipeSlotPresentation } from "../_lib/recipe-slot-geometry.mts";
import type { RecipeSlotPresentation } from "../_lib/recipe-slot-geometry.mts";

export function RecipeResourceVisual({
  fallback,
  amountLabel,
  name,
  presentation,
  resourceId,
  showVisual,
  src,
}: {
  fallback: string;
  amountLabel?: string;
  name: string;
  presentation: RecipeSlotPresentation;
  resourceId: string;
  showVisual: boolean;
  src: string;
}) {
  const { height, width } = presentation.visualStyle;
  const visual = showVisual ? src ? presentation.tank
      ? <span aria-label={name} className="block h-full w-full [image-rendering:pixelated]" role="img" style={{
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundPosition: "left bottom",
        backgroundRepeat: "repeat",
        backgroundSize: `${Math.max(1, width)}px ${Math.max(1, width)}px`,
      }} />
      : <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={Math.max(1, Math.round(height))} width={Math.max(1, Math.round(width))} src={src} />
      : <span className="grid h-full w-full place-items-center text-[10px] font-black">{fallback}</span>
      : null;
  const positionedVisual = <span className="pointer-events-none absolute block" style={presentation.visualStyle}>{visual}{showVisual && amountLabel ? <span className="pointer-events-none absolute bottom-0 right-0 z-20 rounded bg-black/75 px-0.5 text-[10px] font-black leading-none text-white">{amountLabel}</span> : null}</span>;
  if (!resourceId) return positionedVisual;
  return (
    <FloatingTooltip content={<>
      <strong className="block max-w-48 truncate text-[11px] font-bold leading-4">{name || resourceId}</strong>
      <code className="block max-w-48 truncate text-[9px] leading-3 text-white/70">{resourceId}</code>
    </>}>
      {positionedVisual}
    </FloatingTooltip>
  );
}

export function RecipeCandidateChanceLabel({ candidate, slot, locale }: {
  candidate: Record<string, unknown>;
  slot: Record<string, unknown>;
  locale: string;
}) {
  const chance = recipeCandidateChance(candidate, slot, minecraftLocale(locale), locale);
  if (!chance) return null;
  return <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#242424] px-1 py-0.5 text-[9px] font-black leading-none text-white shadow" title={chance.title}>{chance.label}</span>;
}
