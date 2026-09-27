export type ProjectResourceSourcePage<T> = {
  items: T[];
  total?: number;
  hasMore?: boolean;
  nextCursor?: string;
};

type CompositeProjectCursor = {
  v: 1;
  scope: string;
  typeIndex: number;
  offsets: number[];
  cursors: string[];
};

export async function loadCompositeProjectPage<T, TProjectType extends string>(
  projectTypes: readonly TProjectType[],
  scope: string,
  limit: number,
  rawCursor: string,
  fetchPage: (projectType: TProjectType, limit: number, offset: number, cursor: string) => Promise<ProjectResourceSourcePage<T>>,
) {
  const cursor = decodeCompositeProjectCursor(rawCursor, projectTypes, scope);
  const items: T[] = [];
  let iterations = 0;
  while (cursor.typeIndex < projectTypes.length && items.length < limit) {
    if (++iterations > 256) throw new Error("project picker cursor did not advance");
    const typeIndex = cursor.typeIndex;
    const remaining = limit - items.length;
    const page = await fetchPage(
      projectTypes[typeIndex],
      remaining,
      cursor.offsets[typeIndex] ?? 0,
      cursor.cursors[typeIndex] ?? "",
    );
    if (page.items.length > remaining) throw new Error("project picker source exceeded its requested page size");
    items.push(...page.items);
    if (typeof page.hasMore === "boolean") {
      if (page.hasMore) {
        if (!page.nextCursor || page.items.length === 0) throw new Error("project picker cursor source did not advance");
        cursor.cursors[typeIndex] = page.nextCursor;
      } else {
        cursor.typeIndex += 1;
      }
      continue;
    }
    if (!Number.isSafeInteger(page.total) || (page.total ?? -1) < 0) {
      throw new Error("project picker offset source omitted its total");
    }
    cursor.offsets[typeIndex] = (cursor.offsets[typeIndex] ?? 0) + page.items.length;
    if (cursor.offsets[typeIndex] >= (page.total ?? 0) || page.items.length === 0) cursor.typeIndex += 1;
  }
  const hasMore = cursor.typeIndex < projectTypes.length;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeCompositeProjectCursor(cursor) : "",
  };
}

function decodeCompositeProjectCursor(raw: string, projectTypes: readonly string[], scope: string): CompositeProjectCursor {
  if (!raw) {
    return { v: 1, scope, typeIndex: 0, offsets: projectTypes.map(() => 0), cursors: projectTypes.map(() => "") };
  }
  if (raw.length > 8192) throw new Error("invalid project picker cursor");
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<CompositeProjectCursor>;
    if (value.v !== 1 || value.scope !== scope || !Number.isInteger(value.typeIndex) ||
      (value.typeIndex ?? -1) < 0 || (value.typeIndex ?? 0) >= projectTypes.length ||
      !Array.isArray(value.offsets) || value.offsets.length !== projectTypes.length ||
      value.offsets.some((offset) => !Number.isSafeInteger(offset) || offset < 0) ||
      !Array.isArray(value.cursors) || value.cursors.length !== projectTypes.length ||
      value.cursors.some((cursor) => typeof cursor !== "string" || cursor.length > 4096)) {
      throw new Error("invalid project picker cursor");
    }
    return value as CompositeProjectCursor;
  } catch {
    throw new Error("invalid project picker cursor");
  }
}

function encodeCompositeProjectCursor(cursor: CompositeProjectCursor) {
  return encodeURIComponent(JSON.stringify(cursor));
}
