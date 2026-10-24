import { normalizeCatalogResourceKind } from "./catalog-resource-identifiers.ts";
import type { CatalogResourceRef } from "./editor-types";

export function unresolvedPublicID(kind: string, identifier: string, registry: string) {
  return `unresolved:${kind.toLowerCase()}:${registry.toLowerCase()}:${identifier.toLowerCase()}`;
}

export function needsResourceHydration(resource: CatalogResourceRef) {
  return resource.unresolved || (!resource.resolvedName && Object.values(resource.names).every((name) => !name.trim()));
}

export function resolveSelectedResources(current: Map<string, CatalogResourceRef>, candidates: readonly CatalogResourceRef[]) {
  let next: Map<string, CatalogResourceRef> | undefined;
  for (const [key, selectedResource] of current) {
    if (!needsResourceHydration(selectedResource)) continue;
    const matches = candidates.filter((candidate) => resourceMatches(candidate, selectedResource));
    if (new Set(matches.map((candidate) => candidate.publicId)).size !== 1) continue;
    const match = matches[0];
    next ??= new Map(current);
    next.delete(key);
    const canonical = { ...match };
    delete canonical.requestedPublicId;
    next.set(canonical.publicId, canonical);
  }
  return next ?? current;
}

export function sameResourceIdentity(a: CatalogResourceRef, b: CatalogResourceRef) {
  return normalizeCatalogResourceKind(a.kind) === normalizeCatalogResourceKind(b.kind)
    && a.registry.toLowerCase() === b.registry.toLowerCase()
    && a.id.trim().toLowerCase() === b.id.trim().toLowerCase();
}

function resourceMatches(candidate: CatalogResourceRef, selectedResource: CatalogResourceRef) {
  if (candidate.requestedPublicId === selectedResource.publicId) return true;
  if (candidate.publicId.toLowerCase() === selectedResource.publicId.toLowerCase()) return true;
  const identifier = (selectedResource.rawIdentifier || selectedResource.id).trim().toLowerCase();
  if (selectedResource.kind === "" || selectedResource.kind === "resource") {
    return identifier !== "" && candidate.id.trim().toLowerCase() === identifier
      && candidate.registry.toLowerCase() === selectedResource.registry.toLowerCase();
  }
  return identifier !== "" && sameResourceIdentity(candidate, selectedResource);
}

