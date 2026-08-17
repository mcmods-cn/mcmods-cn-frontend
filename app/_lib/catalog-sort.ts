export type CatalogSortField =
  | "published"
  | "updated"
  | "heat"
  | "views"
  | "relevance"
  | "downloads"
  | "favorites"
  | "rating"
  | "comments"
  | "name";

export type CatalogSortDirection = "asc" | "desc";

export const coreCatalogSortFields = ["published", "updated", "heat", "views"] as const satisfies readonly CatalogSortField[];

export function normalizeCatalogSortField(value: string | null | undefined, fallback: CatalogSortField): CatalogSortField {
  switch (value?.trim()) {
    case "latest":
    case "oldest":
    case "created":
      return "published";
    case "nameAsc":
    case "nameDesc":
      return "name";
    case "published":
    case "updated":
    case "heat":
    case "views":
    case "relevance":
    case "downloads":
    case "favorites":
    case "rating":
    case "comments":
    case "name":
      return value as CatalogSortField;
    default:
      return fallback;
  }
}

export function normalizeCatalogSortDirection(
  value: string | null | undefined,
  fallback: CatalogSortDirection = "desc",
  legacySort?: string | null,
): CatalogSortDirection {
  if (value === "asc" || value === "desc") return value;
  if (legacySort === "oldest" || legacySort === "name" || legacySort === "nameAsc") return "asc";
  if (legacySort === "latest" || legacySort === "nameDesc") return "desc";
  return fallback;
}
