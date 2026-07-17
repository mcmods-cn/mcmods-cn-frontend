import Image from "next/image";

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
  canvasWidth,
  fallback,
  name,
  presentation,
  resourceId,
  showVisual,
  src,
}: {
  canvasWidth: number;
  fallback: string;
  name: string;
  presentation: RecipeSlotPresentation;
  resourceId: string;
  showVisual: boolean;
  src: string;
}) {
  const { height, left, width } = presentation.style;
  const tooltipPosition = left < 96 ? "left-0" : canvasWidth - left - width < 96 ? "right-0" : "left-1/2 -translate-x-1/2";
  return <>
    {showVisual ? src ? presentation.tank
      ? <span aria-label={name} className="block h-full w-full [image-rendering:pixelated]" role="img" style={{
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundPosition: "left bottom",
        backgroundRepeat: "repeat",
        backgroundSize: `${Math.max(1, width)}px ${Math.max(1, width)}px`,
      }} />
      : <Image unoptimized alt={name} className="h-full w-full object-contain [image-rendering:pixelated]" height={Math.max(1, Math.round(height))} width={Math.max(1, Math.round(width))} src={src} />
      : <span className="grid h-full w-full place-items-center text-[10px] font-black">{fallback}</span>
      : null}
    {resourceId ? <span className={`pointer-events-none absolute top-full z-50 mt-1 hidden min-w-28 max-w-52 whitespace-nowrap rounded border border-white/15 bg-[#171717]/95 px-2 py-1 text-left text-white shadow-lg group-hover:block group-focus-visible:block group-focus-within:block ${tooltipPosition}`} role="tooltip">
      <strong className="block max-w-48 truncate text-[11px] font-bold leading-4">{name || resourceId}</strong>
      <code className="block max-w-48 truncate text-[9px] leading-3 text-white/70">{resourceId}</code>
    </span> : null}
  </>;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
