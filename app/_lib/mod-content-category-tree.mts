export const MAX_MOD_CONTENT_CATEGORY_DEPTH = 4;

export type ModContentCategoryNode = {
  publicId: string;
  parentPublicId: string;
  ordinal: number;
};

function sortedChildren<T extends ModContentCategoryNode>(categories: Iterable<T>) {
  const children = new Map<string, T[]>();
  for (const category of categories) {
    const siblings = children.get(category.parentPublicId);
    if (siblings) siblings.push(category);
    else children.set(category.parentPublicId, [category]);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.ordinal - right.ordinal || left.publicId.localeCompare(right.publicId));
  }
  return children;
}

export function normalizeCategoryOrdinals<T extends ModContentCategoryNode>(categories: readonly T[]) {
  const ordinals = new Map<string, number>();
  for (const siblings of sortedChildren(categories).values()) {
    siblings.forEach((category, index) => ordinals.set(category.publicId, index));
  }
  return categories.map((category) => ({ ...category, ordinal: ordinals.get(category.publicId)! }));
}

// Both arrangement views and their controls see the same tree. A disconnected,
// cyclic or duplicate record makes structural changes unavailable.
export function createModContentCategoryTree<T extends ModContentCategoryNode>(
  rootID: string,
  categories: readonly T[],
  maximumDepth = MAX_MOD_CONTENT_CATEGORY_DEPTH,
) {
  const byID = new Map<string, T>();
  let valid = Boolean(rootID) && Number.isInteger(maximumDepth) && maximumDepth >= 1;
  for (const category of categories) {
    if (!category.publicId || category.publicId === rootID || !category.parentPublicId || byID.has(category.publicId)) {
      valid = false;
      continue;
    }
    byID.set(category.publicId, category);
  }
  const childrenByParent = sortedChildren(byID.values());
  const ordered: T[] = [];
  const depths = new Map<string, number>([[rootID, 0]]);
  const pending = [...(childrenByParent.get(rootID) ?? [])].reverse();
  while (pending.length) {
    const category = pending.pop()!;
    const depth = depths.get(category.parentPublicId)! + 1;
    depths.set(category.publicId, depth);
    if (depth > maximumDepth) valid = false;
    ordered.push(category);
    const children = childrenByParent.get(category.publicId) ?? [];
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
  }
  if (ordered.length !== categories.length) valid = false;

  const heights = new Map<string, number>();
  for (let index = ordered.length - 1; index >= 0; index--) {
    const category = ordered[index];
    const parentHeight = Math.max(heights.get(category.parentPublicId) ?? 0, (heights.get(category.publicId) ?? 0) + 1);
    heights.set(category.parentPublicId, parentHeight);
  }

  function canAddChild(parentID: string) {
    const depth = depths.get(parentID);
    return valid && depth !== undefined && depth < maximumDepth;
  }

  function canReparent(categoryID: string, parentID: string) {
    if (!byID.has(categoryID) || !canAddChild(parentID)) return false;
    for (let ancestor = parentID; ancestor !== rootID; ancestor = byID.get(ancestor)!.parentPublicId) {
      if (ancestor === categoryID) return false;
    }
    return depths.get(parentID)! + 1 + (heights.get(categoryID) ?? 0) <= maximumDepth;
  }

  function reparent(categoryID: string, parentID: string): T[] | null {
    if (!canReparent(categoryID, parentID)) return null;
    return normalizeCategoryOrdinals(categories.map((category) => category.publicId === categoryID
      ? { ...category, parentPublicId: parentID }
      : category));
  }

  function moveSibling(categoryID: string, delta: number): T[] | null {
    const category = byID.get(categoryID);
    if (!valid || !category || (delta !== 1 && delta !== -1)) return null;
    const siblings = [...childrenByParent.get(category.parentPublicId)!];
    const index = siblings.findIndex((sibling) => sibling.publicId === categoryID);
    const next = index + delta;
    if (next < 0 || next >= siblings.length) return null;
    [siblings[index], siblings[next]] = [siblings[next], siblings[index]];
    const ordinals = new Map(siblings.map((sibling, ordinal) => [sibling.publicId, ordinal]));
    return categories.map((item) => ordinals.has(item.publicId) ? { ...item, ordinal: ordinals.get(item.publicId)! } : item);
  }

  return { ordered, depths, childrenByParent, canAddChild, canReparent, reparent, moveSibling };
}
