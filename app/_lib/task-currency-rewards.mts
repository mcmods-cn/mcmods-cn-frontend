export type TaskCurrencyRewards = Readonly<Record<string, number>>;

export function canUseTaskRewardCurrency(
  rewards: TaskCurrencyRewards,
  currentCode: string,
  candidateCode: string,
) {
  return candidateCode === currentCode || !hasOwn(rewards, candidateCode);
}

export function renameTaskCurrencyReward(
  rewards: TaskCurrencyRewards,
  currentCode: string,
  nextCode: string,
): Record<string, number> | null {
  if (!hasOwn(rewards, currentCode) || !nextCode || !canUseTaskRewardCurrency(rewards, currentCode, nextCode)) return null;
  const next = { ...rewards };
  if (currentCode === nextCode) return next;
  const amount = next[currentCode];
  delete next[currentCode];
  next[nextCode] = amount;
  return next;
}

export function taskRewardCurrencyCodesAreUnique(rewards: TaskCurrencyRewards) {
  const normalized = new Set<string>();
  for (const code of Object.keys(rewards)) {
    const value = normalizeCurrencyCode(code);
    if (!value || normalized.has(value)) return false;
    normalized.add(value);
  }
  return true;
}

function normalizeCurrencyCode(value: string) {
  return value.trim().toLowerCase();
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
