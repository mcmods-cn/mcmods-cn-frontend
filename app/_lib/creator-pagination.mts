export type CreatorPage<T> = {
  items: T[];
  counts?: { author: number; team: number };
  hasMore: boolean;
  nextCursor: string;
};

export type CreatorPageQuery = {
  limit: number;
  kind?: string;
  query?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export async function loadCreatorPage<T>(
  request: (path: string, signal?: AbortSignal) => Promise<CreatorPage<T>>,
  query: CreatorPageQuery,
  cursor = "",
  signal?: AbortSignal,
) {
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.kind) parameters.set("kind", query.kind);
  if (query.query?.trim()) parameters.set("query", query.query.trim());
  if (query.sort) parameters.set("sort", query.sort);
  if (query.order) parameters.set("order", query.order);
  if (cursor) parameters.set("cursor", cursor);
  return request(`/api/v1/creators?${parameters}`, signal);
}

export function mergeCreatorPageItems<T extends { publicId: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.publicId));
  return [...current, ...incoming.filter((item) => !seen.has(item.publicId))];
}
