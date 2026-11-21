export function recipeSlotAmountLabel(candidate: Record<string, unknown>): string {
  if (typeof candidate.amount_text === "string" && candidate.amount_text.trim()) return candidate.amount_text;
  const amount = typeof candidate.amount === "number" ? candidate.amount : candidate.count;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "";
  const unit = typeof candidate.unit === "string" ? candidate.unit : typeof candidate.amount_unit === "string" ? candidate.amount_unit : "";
  return amount === 1 && !unit ? "" : `${amount}${unit ? ` ${unit}` : ""}`;
}

// The materials list always spells out a known quantity, including one and
// zero. A missing quantity stays empty and cannot be summed with another slot.
export function recipeMaterialAmount(candidate: Record<string, unknown>): string {
  if (typeof candidate.amount_text === "string" && candidate.amount_text.trim()) return candidate.amount_text;
  const raw = candidate.amount ?? candidate.count;
  if (typeof raw !== "number" && !(typeof raw === "string" && raw.trim())) return "";
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return "";
  const unit = typeof candidate.unit === "string" ? candidate.unit : typeof candidate.amount_unit === "string" ? candidate.amount_unit : "";
  return `${amount}${unit}`;
}
