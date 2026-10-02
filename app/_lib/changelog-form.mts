/** A temporarily empty datetime-local input must remain editable, not throw. */
export function normalizeChangelogEventAt(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
