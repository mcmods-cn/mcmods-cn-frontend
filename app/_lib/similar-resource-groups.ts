export function clusterSimilarResources<T>(items: T[], groupIdOf: (item: T) => string | undefined) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const groupId = groupIdOf(item);
    if (!groupId) continue;
    const group = grouped.get(groupId);
    if (group) group.push(item);
    else grouped.set(groupId, [item]);
  }

  const renderedGroups = new Set<string>();
  return items.flatMap((item) => {
    const groupId = groupIdOf(item);
    const group = groupId ? grouped.get(groupId) : undefined;
    if (!groupId || !group || group.length < 2) return [[item]];
    if (renderedGroups.has(groupId)) return [];
    renderedGroups.add(groupId);
    return [group];
  });
}
