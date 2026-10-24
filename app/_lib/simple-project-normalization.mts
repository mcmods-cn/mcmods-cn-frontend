// Network responses and older drafts can contain null collections.
// Preserve valid arrays and every non-collection business field.
const collections = ["localizations", "minecraftVersions", "loaders", "categories", "features", "searchKeywords", "authors", "links", "galleryImages", "parentProjects"] as const;
export function normalizeSimpleProjectCollections<T extends object>(value: T): T {
  const result = { ...value } as T & Record<string, unknown>;
  for (const key of collections) if (!Array.isArray(result[key])) Object.assign(result, { [key]: [] });
  return result;
}
