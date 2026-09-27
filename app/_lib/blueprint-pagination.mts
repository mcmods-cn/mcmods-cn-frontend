export type BlueprintPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string;
};

export type BlueprintPageQuery = {
  limit: number;
  query?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export async function loadBlueprintPage<T>(
  request: (path: string, signal?: AbortSignal) => Promise<BlueprintPage<T>>,
  query: BlueprintPageQuery,
  cursor = "",
  signal?: AbortSignal,
) {
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.query?.trim()) parameters.set("q", query.query.trim());
  if (query.sort) parameters.set("sort", query.sort);
  if (query.order) parameters.set("order", query.order);
  if (cursor) parameters.set("cursor", cursor);
  return request(`/api/v1/blueprints?${parameters}`, signal);
}

export function mergeBlueprintPageItems<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
