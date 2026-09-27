export type SimpleProjectParentFacet = { key: string; label: string };

export type SimpleProjectParentFacetPage = {
  hasMore: boolean;
  items: SimpleProjectParentFacet[];
  nextCursor: string;
  selectedItems: SimpleProjectParentFacet[];
};

export function simpleProjectParentFacetPagePath(
  projectType: string,
  cursor: string,
  selected: string[],
  limit = 50,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid parent facet page size");
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (selected.length) params.set("selected", selected.join(","));
  return `/api/v1/content-projects/${encodeURIComponent(projectType)}/facets/parents?${params}`;
}

export function normalizeSimpleProjectParentFacetPage(value: unknown): SimpleProjectParentFacetPage {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.selectedItems)
    || typeof value.hasMore !== "boolean" || typeof value.nextCursor !== "string") {
    throw new Error("Invalid parent facet response");
  }
  const items = value.items.map(normalizeParentFacet);
  const selectedItems = value.selectedItems.map(normalizeParentFacet);
  if (items.length > 100 || selectedItems.length > 20 || value.hasMore !== Boolean(value.nextCursor)) {
    throw new Error("Invalid parent facet response");
  }
  return { hasMore: value.hasMore, items, nextCursor: value.nextCursor, selectedItems };
}

export function mergeSimpleProjectParentFacets(
  current: SimpleProjectParentFacet[],
  incoming: SimpleProjectParentFacet[],
) {
  const merged = new Map(current.map((item) => [item.key, item]));
  for (const item of incoming) merged.set(item.key, item);
  return [...merged.values()];
}

function normalizeParentFacet(value: unknown): SimpleProjectParentFacet {
  if (!isRecord(value) || typeof value.key !== "string" || !value.key.trim()
    || typeof value.label !== "string" || !value.label.trim()) {
    throw new Error("Invalid parent facet response");
  }
  return { key: value.key, label: value.label };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
