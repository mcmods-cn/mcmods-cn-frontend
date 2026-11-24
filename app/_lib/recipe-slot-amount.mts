export function recipeSlotAmountLabel(candidate: Record<string, unknown>): string {
  if (typeof candidate.amount_text === "string" && candidate.amount_text.trim()) return candidate.amount_text;
  const amount = typeof candidate.amount === "number" ? candidate.amount : candidate.count;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return "";
  const unit = typeof candidate.unit === "string" ? candidate.unit : typeof candidate.amount_unit === "string" ? candidate.amount_unit : "";
  return amount === 1 && !unit ? "" : `${amount}${unit ? ` ${unit}` : ""}`;
}

export type RecipeMaterial = {
  id: string;
  name: string;
  amount: string;
  quantity?: number;
  unit?: string;
  href?: string;
  mergeKey?: string;
};

// Display hints may be ranges or other third-party text. Only the source's
// numeric quantity and exact unit can participate in ingredient totals.
export function recipeMaterialMeasure(candidate: Record<string, unknown>): Pick<RecipeMaterial, "amount" | "quantity" | "unit"> {
  if (typeof candidate.amount_text === "string" && candidate.amount_text.trim()) return { amount: candidate.amount_text };
  const raw = candidate.amount ?? candidate.count;
  if (typeof raw !== "number" && !(typeof raw === "string" && raw.trim())) return { amount: "" };
  const quantity = Number(raw);
  if (!Number.isFinite(quantity)) return { amount: "" };
  const unit = typeof candidate.unit === "string" ? candidate.unit : typeof candidate.amount_unit === "string" ? candidate.amount_unit : "";
  return { amount: `${quantity}${unit}`, quantity, unit };
}

export function mergeRecipeMaterials(materials: RecipeMaterial[]): RecipeMaterial[] {
  const rows: RecipeMaterial[] = [];
  const totals = new Map<string, RecipeMaterial>();
  for (const item of materials) {
    const identity = item.mergeKey || item.id;
    if (item.quantity === undefined || !identity || identity === "?") {
      rows.push(item);
      continue;
    }
    const unit = item.unit || "";
    const key = JSON.stringify([identity, unit]);
    const existing = totals.get(key);
    if (existing?.quantity !== undefined) {
      const sum = existing.quantity + item.quantity;
      if (Number.isFinite(sum)) {
        existing.quantity = sum;
        existing.amount = `${Number.isInteger(sum) ? sum : Number(sum.toPrecision(15))}${unit}`;
        continue;
      }
    }
    const row = { ...item };
    totals.set(key, row);
    rows.push(row);
  }
  return rows;
}
