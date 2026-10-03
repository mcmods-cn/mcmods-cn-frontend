type GroupMember = { similarGroupId?: string; sectionPublicId: string };

// A single member on a cursor page does not establish global group size.
// The backend validates the merged complete layout when applying the patch.
export function normalizeSimilarResourceGroups<T extends GroupMember>(resources: T[], complete: boolean): T[] {
  const members = new Map<string, T[]>();
  for (const resource of resources) {
    if (resource.similarGroupId) members.set(resource.similarGroupId, [...(members.get(resource.similarGroupId) || []), resource]);
  }
  const invalid = new Set([...members].filter(([, group]) => (complete && group.length < 2) || new Set(group.map((item) => item.sectionPublicId)).size > 1).map(([groupID]) => groupID));
  return resources.map((resource) => resource.similarGroupId && invalid.has(resource.similarGroupId) ? { ...resource, similarGroupId: "" } : resource);
}
