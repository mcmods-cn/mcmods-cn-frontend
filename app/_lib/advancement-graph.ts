export function advancementConnectedGroups<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  parentIdOf: (item: T) => string,
) {
  const itemByID = new Map(items.map((item) => [idOf(item), item]));
  const neighbors = new Map<string, string[]>();

  for (const item of items) {
    const id = idOf(item);
    const parentID = parentIdOf(item);
    if (!id || !parentID || parentID === id || !itemByID.has(parentID)) continue;
    neighbors.set(id, [...(neighbors.get(id) ?? []), parentID]);
    neighbors.set(parentID, [...(neighbors.get(parentID) ?? []), id]);
  }

  const visited = new Set<string>();
  const groups: T[][] = [];
  for (const item of items) {
    const id = idOf(item);
    if (!id || visited.has(id)) continue;
    const group: T[] = [];
    const pending = [id];
    visited.add(id);
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const currentID = pending[cursor];
      const current = itemByID.get(currentID);
      if (current) group.push(current);
      for (const neighborID of neighbors.get(currentID) ?? []) {
        if (visited.has(neighborID)) continue;
        visited.add(neighborID);
        pending.push(neighborID);
      }
    }
    groups.push(group);
  }
  return groups;
}
