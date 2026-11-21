type RecordValue = Record<string, unknown>;

const comparators: Record<string, string> = {
  exact: "", less_than: "<", greater_than: ">", less_than_or_equal: "≤", greater_than_or_equal: "≥",
};

function finiteValue(value: unknown) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

// The API projects probabilities onto individual alternatives. Older layouts
// put them on the slot. A candidate that explicitly reports unknown wins.
export function recipeCandidateChance(candidate: RecordValue, slot: RecordValue, language: string, locale: string) {
  const role = slot.role || slot.semantic_role;
  if (role !== "output" && role !== "byproduct") return null;
  const candidateHasChance = ["chance_available", "chance", "chance_percent", "probability", "byproduct", "chance_text", "chance_texts"]
    .some((key) => Object.hasOwn(candidate, key));
  const source = candidateHasChance ? candidate : slot;
  if (source.chance_available === false) return null;

  const fraction = finiteValue(source.chance ?? source.probability);
  const percent = finiteValue(source.chance_percent) ?? (fraction === undefined ? undefined : fraction * 100);
  const comparator = typeof source.chance_comparator === "string" ? source.chance_comparator : "";
  const prefix = comparator && Object.hasOwn(comparators, comparator) ? comparators[comparator] : "";
  const numeric = percent !== undefined && percent >= 0 && percent <= 100
    ? `${prefix}${percent.toLocaleString(locale, { maximumSignificantDigits: 6 })}%`
    : "";
  const texts = source.chance_texts;
  const translated = texts && typeof texts === "object" ? (texts as RecordValue)[language] : undefined;
  const title = (typeof translated === "string" && translated.trim())
    || (typeof source.chance_text === "string" && source.chance_text.trim()) || numeric;
  return title ? { label: numeric || title, title } : null;
}
