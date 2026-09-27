export type ModContentLayoutIndexResource = {
  resourcePublicId: string;
  sectionPublicId?: string;
  ordinal: number;
  similarGroupId?: string;
};

export type ModContentLayoutSectionIndex<Resource extends ModContentLayoutIndexResource> = {
  entries: Resource[];
  clusters: Resource[][];
  positionByResourceID: ReadonlyMap<string, number>;
};

export type ModContentLayoutRenderIndex<Resource extends ModContentLayoutIndexResource> = {
  sections: ReadonlyMap<string, ModContentLayoutSectionIndex<Resource>>;
  resourceByID: ReadonlyMap<string, Resource>;
};

/**
 * Builds every render-time resource lookup once per resource revision. Category
 * controls can then rerender without scanning the resource page per category.
 */
export function buildModContentLayoutRenderIndex<Resource extends ModContentLayoutIndexResource>(
  resources: readonly Resource[],
  rootSectionID: string,
): ModContentLayoutRenderIndex<Resource> {
  const grouped = new Map<string, Resource[]>();
  const resourceByID = new Map<string, Resource>();
  for (const resource of resources) {
    const sectionID = resource.sectionPublicId || rootSectionID;
    const entries = grouped.get(sectionID);
    if (entries) entries.push(resource);
    else grouped.set(sectionID, [resource]);
    resourceByID.set(resource.resourcePublicId, resource);
  }

  const sections = new Map<string, ModContentLayoutSectionIndex<Resource>>();
  for (const [sectionID, entries] of grouped) {
    entries.sort((left, right) => left.ordinal - right.ordinal);
    const positionByResourceID = new Map<string, number>();
    entries.forEach((resource, index) => positionByResourceID.set(resource.resourcePublicId, index));
    sections.set(sectionID, {
      entries,
      clusters: clusterSimilarResources(entries, (resource) => resource.similarGroupId),
      positionByResourceID,
    });
  }
  return { sections, resourceByID };
}
import { clusterSimilarResources } from "./similar-resource-groups.ts";
