import type { CatalogResourceRef, ResourcePageLoader } from "./editor-types";
import { loadGlobalTags } from "./global-catalog-api";

export const loadTagPickerPage: ResourcePageLoader = async (options, token) => {
  const query = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  });
  if (options.query) query.set("q", options.query);
  if (options.registry) query.set("registry", options.registry);
  const page = await loadGlobalTags(query, token);
  return {
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    items: page.items.map((tag): CatalogResourceRef => ({
      publicId: tag.publicId,
      id: tag.tagId,
      registry: tag.registry,
      kind: "tag",
      names: tag.name ? { "zh-CN": tag.name } : {},
      resolvedName: tag.name,
      iconUrl: tag.previews[0]?.iconUrl,
    })),
  };
};
