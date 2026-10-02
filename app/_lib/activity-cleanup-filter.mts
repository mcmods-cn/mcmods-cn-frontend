export type ActivityCleanupObject = { type: string; id: string };

// A malformed typed filter must never silently become an unrestricted filter.
export function parseActivityCleanupObjects(value: string): {
  objects: ActivityCleanupObject[];
  invalidEntries: string[];
} {
  const objects: ActivityCleanupObject[] = [];
  const invalidEntries: string[] = [];
  for (const entry of value.split(/\r?\n|,/).map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf(":");
    const type = separator > 0 ? entry.slice(0, separator).trim() : "";
    const id = separator > 0 ? entry.slice(separator + 1).trim() : "";
    if (!type || !id) invalidEntries.push(entry);
    else objects.push({ type, id });
  }
  return { objects, invalidEntries };
}
