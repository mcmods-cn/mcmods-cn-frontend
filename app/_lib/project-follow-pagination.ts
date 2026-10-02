export function projectFollowPagePath(query = "", type = "", cursor = "", limit = 40) {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) parameters.set("q", query.trim());
  if (type) parameters.set("type", type);
  if (cursor) parameters.set("cursor", cursor);
  return `/api/v1/users/me/project-follows?${parameters}`;
}

export function mergeFollowedProjectPage<T extends { id: string; type: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => `${item.type}:${item.id}`));
  return current.concat(incoming.filter((item) => {
    const identity = `${item.type}:${item.id}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }));
}
