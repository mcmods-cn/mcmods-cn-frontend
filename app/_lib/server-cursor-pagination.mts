export type ServerCursorPage<T> = {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type ServerCursorQuery = {
  sort: string;
  order: "asc" | "desc";
  limit: number;
};

export async function loadServerCursorPage<T>(
  request: (path: string, signal?: AbortSignal) => Promise<ServerCursorPage<T>>,
  sourceParameters: URLSearchParams,
  query: ServerCursorQuery,
  cursor = "",
  signal?: AbortSignal,
) {
  const parameters = new URLSearchParams(sourceParameters);
  for (const legacy of ["size", "page", "offset", "cursor"]) parameters.delete(legacy);
  parameters.set("sort", query.sort);
  parameters.set("order", query.order);
  parameters.set("limit", String(query.limit));
  if (cursor) parameters.set("cursor", cursor);
  return request(`/api/v1/servers?${parameters}`, signal);
}

export function mergeServerCursorItems<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
