export function toggleMinecraftVersionCodes(
  currentCodes: readonly string[],
  targetCodes: readonly string[],
  availableCodes: readonly string[],
  disabledCodes: ReadonlySet<string>,
): string[] {
  const availableSet = new Set(availableCodes);
  const mutableCodes = [...new Set(targetCodes)].filter((code) => availableSet.has(code) && !disabledCodes.has(code));
  if (mutableCodes.length === 0) return [...currentCodes];

  const selected = new Set(currentCodes);
  const allMutableSelected = mutableCodes.every((code) => selected.has(code));
  for (const code of mutableCodes) {
    if (allMutableSelected) selected.delete(code);
    else selected.add(code);
  }

  const ordered: string[] = [];
  const emitted = new Set<string>();
  for (const code of availableCodes) {
    if (selected.has(code) && !emitted.has(code)) {
      ordered.push(code);
      emitted.add(code);
    }
  }
  for (const code of currentCodes) {
    if (selected.has(code) && !emitted.has(code)) {
      ordered.push(code);
      emitted.add(code);
    }
  }
  return ordered;
}

export function minecraftLoaderCodeKey(value: string): string {
  return value.trim().toLowerCase();
}
