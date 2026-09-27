export const MAX_MOD_CONTENT_CATEGORY_DEPTH = 4;

export type ModContentCategoryNode = {
  publicId: string;
  parentPublicId: string;
  ordinal: number;
};

export function createModContentCategoryReparentPolicy<T extends ModContentCategoryNode>(
  rootID: string,
  categories: readonly T[],
  maximumDepth = MAX_MOD_CONTENT_CATEGORY_DEPTH,
) {
  const byID = new Map<string, T>();
  const childrenByParent = new Map<string, T[]>();
  let valid = Boolean(rootID) && Number.isInteger(maximumDepth) && maximumDepth >= 1;

  for (const category of categories) {
    if (!category.publicId || category.publicId === rootID || !category.parentPublicId || byID.has(category.publicId)) {
      valid = false;
    }
    byID.set(category.publicId, category);
    childrenByParent.set(category.parentPublicId, [...(childrenByParent.get(category.parentPublicId) || []), category]);
  }
  for (const category of categories) {
    if (category.parentPublicId !== rootID && !byID.has(category.parentPublicId)) valid = false;
  }

  const depths = new Map<string, number>([[rootID, 0]]);
  const visiting = new Set<string>();
  const depth = (publicID: string): number | null => {
    const cached = depths.get(publicID);
    if (cached !== undefined) return cached;
    if (visiting.has(publicID)) {
      valid = false;
      return null;
    }
    const category = byID.get(publicID);
    if (!category) {
      valid = false;
      return null;
    }
    visiting.add(publicID);
    const parentDepth = depth(category.parentPublicId);
    visiting.delete(publicID);
    if (parentDepth === null) return null;
    const value = parentDepth + 1;
    depths.set(publicID, value);
    if (value > maximumDepth) valid = false;
    return value;
  };
  for (const category of categories) depth(category.publicId);

  const heights = new Map<string, number>();
  const height = (publicID: string): number => {
    const cached = heights.get(publicID);
    if (cached !== undefined) return cached;
    const children = childrenByParent.get(publicID) || [];
    const value = children.length ? Math.max(...children.map((child) => height(child.publicId) + 1)) : 0;
    heights.set(publicID, value);
    return value;
  };
  if (valid) for (const category of categories) height(category.publicId);

  function canReparent(categoryID: string, parentID: string) {
    if (!valid || !byID.has(categoryID) || categoryID === parentID || (parentID !== rootID && !byID.has(parentID))) return false;
    let ancestorID = parentID;
    while (ancestorID !== rootID) {
      if (ancestorID === categoryID) return false;
      const ancestor = byID.get(ancestorID);
      if (!ancestor) return false;
      ancestorID = ancestor.parentPublicId;
    }
    const parentDepth = depths.get(parentID);
    const subtreeHeight = heights.get(categoryID);
    return parentDepth !== undefined && subtreeHeight !== undefined && parentDepth + 1 + subtreeHeight <= maximumDepth;
  }

  function reparent(categoryID: string, parentID: string): T[] | null {
    if (!canReparent(categoryID, parentID)) return null;
    return normalizeCategoryOrdinals(categories.map((category) => category.publicId === categoryID
      ? { ...category, parentPublicId: parentID }
      : { ...category }));
  }

  return { canReparent, reparent };
}

function normalizeCategoryOrdinals<T extends ModContentCategoryNode>(categories: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const category of categories) grouped.set(category.parentPublicId, [...(grouped.get(category.parentPublicId) || []), category]);
  const ordinals = new Map<string, number>();
  for (const siblings of grouped.values()) {
    siblings.sort((left, right) => left.ordinal - right.ordinal || left.publicId.localeCompare(right.publicId));
    siblings.forEach((category, index) => ordinals.set(category.publicId, index));
  }
  return categories.map((category) => ({ ...category, ordinal: ordinals.get(category.publicId) || 0 }));
}
