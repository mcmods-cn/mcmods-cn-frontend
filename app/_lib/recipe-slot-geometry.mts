type UnknownRecord = Record<string, unknown>;

export type RecipeSlotPresentation = {
  tank: boolean;
  style: { left: number; top: number; width: number; height: number };
  visualStyle: { left: number; top: number; width: number; height: number };
};

const tankIngredientMarkers = ["fluid", "chemical", "gas", "infuse", "pigment", "slurry"];

export function recipeSlotPresentation(slot: UnknownRecord, alternative: UnknownRecord, scale: number): RecipeSlotPresentation {
  const descriptor = [
    alternative.ingredient_kind,
    slot.ingredient_kind,
    alternative.kind,
    alternative.kindCode,
    alternative.ingredient_type,
    slot.ingredient_type,
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  const tank = tankIngredientMarkers.some((marker) => descriptor.includes(marker));
  const rect = record(slot.rect);
  const visualRect = record(slot.visual_rect);
  const selectedRect = numberValue(visualRect.width, 0) > 0 && numberValue(visualRect.height, 0) > 0 ? visualRect : rect;
  return {
    tank,
    style: {
      left: numberValue(rect.x, 0) * scale,
      top: numberValue(rect.y, 0) * scale,
      width: numberValue(rect.width, 16) * scale,
      height: numberValue(rect.height, 16) * scale,
    },
    visualStyle: {
      left: (numberValue(selectedRect.x, numberValue(rect.x, 0)) - numberValue(rect.x, 0)) * scale,
      top: (numberValue(selectedRect.y, numberValue(rect.y, 0)) - numberValue(rect.y, 0)) * scale,
      width: numberValue(selectedRect.width, numberValue(rect.width, 16)) * scale,
      height: numberValue(selectedRect.height, numberValue(rect.height, 16)) * scale,
    },
  };
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
