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
  const normalized = value?.trim();
  switch (normalized) {
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
      return normalized;
    default:
      return fallback;
  }
}

export function normalizeCatalogSortDirection(
  value: string | null | undefined,
  fallback: CatalogSortDirection = "desc",
  sort?: string | null,
): CatalogSortDirection {
  if (value === "asc" || value === "desc") return value;
  if (sort === "name") return "asc";
  return fallback;
}
