export const modRevisionHistoryPageLimit = 50;

export function modRevisionHistoryPagePath(siteId: string, cursor = "") {
  const query = new URLSearchParams({ limit: String(modRevisionHistoryPageLimit) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/mods/${encodeURIComponent(siteId)}/revisions?${query.toString()}`;
}

export function toggleModRevisionSelection<T extends { id: string }>(current: T[], item: T) {
  if (current.some((value) => value.id === item.id)) {
    return current.filter((value) => value.id !== item.id);
  }
  return [...current.slice(-1), item];
}
