import Image from "next/image";
import { FloatingTooltip } from "./floating-tooltip";

type UnknownRecord = Record<string, unknown>;

export type RecipeSlotPresentation = {
  tank: boolean;
  style: { left: number; top: number; width: number; height: number };
};

const tankIngredientMarkers = ["fluid", "chemical", "gas", "infuse", "pigment", "slurry"];

export function recipeSlotPresentation(slot: UnknownRecord, alternative: UnknownRecord, scale: number): RecipeSlotPresentation {
  const descriptor = [
    alternative.ingredient_kind,
    slot.ingredient_kind,
    alternative.kindCode,
    alternative.ingredient_type,
    slot.ingredient_type,
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  const tank = tankIngredientMarkers.some((marker) => descriptor.includes(marker));
  const rect = record(slot.rect);
  const visualRect = record(slot.visual_rect);
  const selectedRect = tank && numberValue(visualRect.width, 0) > 0 && numberValue(visualRect.height, 0) > 0 ? visualRect : rect;
  return {
    tank,
    style: {
      left: numberValue(selectedRect.x, numberValue(rect.x, 0)) * scale,
      top: numberValue(selectedRect.y, numberValue(rect.y, 0)) * scale,
      width: numberValue(selectedRect.width, numberValue(rect.width, 16)) * scale,
      height: numberValue(selectedRect.height, numberValue(rect.height, 16)) * scale,
    },
  };
}

export function RecipeResourceVisual({
  fallback,
  name,
  presentation,
  resourceId,
  showVisual,
  src,
}: {
  fallback: string;
  name: string;
  presentation: RecipeSlotPresentation;
  resourceId: string;
  showVisual: boolean;
  src: string;
}) {
  const { height, width } = presentation.style;
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
  if (!resourceId) return visual;
  return (
    <FloatingTooltip content={<>
      <strong className="block max-w-48 truncate text-[11px] font-bold leading-4">{name || resourceId}</strong>
      <code className="block max-w-48 truncate text-[9px] leading-3 text-white/70">{resourceId}</code>
    </>}>
      {visual}
    </FloatingTooltip>
  );
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
