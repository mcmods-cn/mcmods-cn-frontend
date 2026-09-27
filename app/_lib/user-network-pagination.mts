export type PublicUserNetwork = "followers" | "following";

export function userNetworkPagePath(
  userId: string,
  network: PublicUserNetwork,
  limit: number,
  cursor: string,
) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/users/${encodeURIComponent(userId)}/${network}?${query.toString()}`;
}

export function advanceUserNetworkCursor(history: string[], nextCursor: string) {
  return nextCursor ? [...history, nextCursor] : history;
}

export function rewindUserNetworkCursor(history: string[]) {
  return history.length > 1 ? history.slice(0, -1) : history;
}
