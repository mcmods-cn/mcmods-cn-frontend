import { catalogRegistryForKind, namespaceFromIdentifier, normalizeCatalogResourceKind } from "./catalog-resource-identifiers.ts";
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
    && identityRegistry(a) === identityRegistry(b)
    && a.id.trim().toLowerCase() === b.id.trim().toLowerCase();
}

function identityRegistry(resource: CatalogResourceRef) {
  const kind = normalizeCatalogResourceKind(resource.kind);
  const registry = resource.registry.trim().toLowerCase();
  if (kind === "tag") return registry;
  const namespace = namespaceFromIdentifier(resource.id.trim()).toLowerCase();
  const family = catalogRegistryForKind(kind);
  // Catalog resource DTOs expose the canonical namespace here; manual entries
  // and template fields may carry the known family (items/blocks/fluids).
  // Normalize only those two representations of a fully qualified resource.
  // Tags, unknown families and other explicit registries remain distinct.
  return namespace && family && (registry === family || registry === namespace) ? namespace : registry;
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

