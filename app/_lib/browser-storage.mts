// Browser preferences and cross-tab hints are best effort. Denied storage
// must not prevent authenticated requests or in-tab locale changes.
const transientValues = new Map<string, string>();
const pendingWrites = new Set<string>();

export function readBrowserStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (pendingWrites.has(key)) return transientValues.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) transientValues.delete(key);
    else transientValues.set(key, value);
    return value;
  } catch {
    return transientValues.get(key) ?? null;
  }
}

export function writeBrowserStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  transientValues.set(key, value);
  pendingWrites.add(key);
  try {
    window.localStorage.setItem(key, value);
    pendingWrites.delete(key);
    return true;
  } catch {
    // The current tab still has the value; persistence and cross-tab delivery
    // resume when a later write succeeds.
    return false;
  }
}
