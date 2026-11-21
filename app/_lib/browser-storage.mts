// Browser preferences and cross-tab hints are best effort. Denied storage
// must not prevent authenticated requests or in-tab locale changes.
const transientValues = new Map<string, string>();
const pendingWrites = new Set<string>();

type TabBackup = { value: string; previous: string | null };
function readTabBackup(key: string): TabBackup | undefined {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) || "null") as TabBackup | null;
    if (saved && typeof saved.value === "string" && (saved.previous === null || typeof saved.previous === "string")) return saved;
  } catch { /* Session storage can also be denied. */ }
}

function removeTabBackup(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* Shared storage has the current value. */ }
}

export function readBrowserStorage(key: string, tabFallback = false): string | null {
  if (typeof window === "undefined") return null;
  const backup = tabFallback ? readTabBackup(key) : undefined;
  if (pendingWrites.has(key) && !backup) return transientValues.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (backup) {
      if (value === backup.previous) return backup.value;
      removeTabBackup(key); // Another tab published a newer value.
      pendingWrites.delete(key);
    }
    if (value === null) transientValues.delete(key);
    else transientValues.set(key, value);
    return value;
  } catch {
    return backup?.value ?? transientValues.get(key) ?? null;
  }
}

export function writeBrowserStorage(key: string, value: string, tabFallback = false): boolean {
  if (typeof window === "undefined") return false;
  transientValues.set(key, value);
  pendingWrites.add(key);
  try {
    window.localStorage.setItem(key, value);
    pendingWrites.delete(key);
    if (tabFallback) removeTabBackup(key);
    return true;
  } catch {
    if (tabFallback) {
      let previous = null;
      try { previous = window.localStorage.getItem(key); } catch { /* Neither read nor write is available. */ }
      try { window.sessionStorage.setItem(key, JSON.stringify({ previous, value })); } catch { /* Keep the in-memory copy. */ }
    }
    return false;
  }
}
