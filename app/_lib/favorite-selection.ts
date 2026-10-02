export function favoriteSelectionChecked(
  serverSelected: ReadonlySet<string>,
  selectionChanges: ReadonlyMap<string, boolean>,
  collectionId: string,
) {
  return selectionChanges.get(collectionId) ?? serverSelected.has(collectionId);
}

export function changeFavoriteSelection(
  selectionChanges: ReadonlyMap<string, boolean>,
  collectionId: string,
  selected: boolean,
) {
  return new Map(selectionChanges).set(collectionId, selected);
}

export function favoriteSelectionDelta(selectionChanges: ReadonlyMap<string, boolean>) {
  const addCollectionIds: string[] = [];
  const removeCollectionIds: string[] = [];
  for (const [collectionId, selected] of selectionChanges) {
    (selected ? addCollectionIds : removeCollectionIds).push(collectionId);
  }
  return { addCollectionIds, removeCollectionIds };
}

export function appendCreatedFavoriteCollection<T extends { id: string }>(collections: readonly T[], created: T) {
  return collections.some((collection) => collection.id === created.id) ? [...collections] : [...collections, created];
}
