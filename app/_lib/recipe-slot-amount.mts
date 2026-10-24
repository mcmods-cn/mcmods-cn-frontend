export function recipeSlotAmountLabel(candidate: Record<string, unknown>): string {
  if (typeof candidate.amount_text === "string" && candidate.amount_text.trim()) return candidate.amount_text;
  const amount = typeof candidate.amount === "number" ? candidate.amount : candidate.count;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "";
  const unit = typeof candidate.unit === "string" ? candidate.unit : typeof candidate.amount_unit === "string" ? candidate.amount_unit : "";
  return amount === 1 && !unit ? "" : `${amount}${unit ? ` ${unit}` : ""}`;
}
