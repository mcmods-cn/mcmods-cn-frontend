export const creatorClaimPageSize = 50;

export function creatorClaimPagePath(cursor: string) {
  const query = new URLSearchParams({ limit: String(creatorClaimPageSize) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/admin/creator-claims?${query.toString()}`;
}
