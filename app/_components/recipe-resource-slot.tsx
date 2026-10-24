import Image from "next/image";
import { FloatingTooltip } from "./floating-tooltip";

export { recipeSlotPresentation } from "../_lib/recipe-slot-geometry.mts";
import type { RecipeSlotPresentation } from "../_lib/recipe-slot-geometry.mts";

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
  const positionedVisual = <span className="pointer-events-none absolute block" style={presentation.visualStyle}>{visual}</span>;
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
