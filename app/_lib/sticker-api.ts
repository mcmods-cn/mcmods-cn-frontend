import { apiRequest } from "./api";
import { ExpiringPromiseCache } from "./sticker-catalog-cache.mts";

export type StickerCatalogItem = {
  code: string;
  name: string;
  imageURL: string;
  mimeType: "image/png" | "image/gif";
  width: number;
  height: number;
};

export type StickerCatalogPack = {
  code: string;
  name: string;
  stickers: StickerCatalogItem[];
};

export type StickerCatalog = {
  locale: string;
  packs: StickerCatalogPack[];
};

export const STICKER_CATALOG_STALE_TIME_MS = 30_000;

const catalogCache = new ExpiringPromiseCache<StickerCatalog>(STICKER_CATALOG_STALE_TIME_MS);

export function loadStickerCatalog(locale: string): Promise<StickerCatalog> {
  return catalogCache.get(locale, () => apiRequest<StickerCatalog>(`/api/v1/stickers?locale=${encodeURIComponent(locale)}`));
}

export function invalidateStickerCatalog(locale?: string) {
  catalogCache.invalidate(locale);
}

export function stickerToken(packCode: string, stickerCode: string) {
  return `[sticker:${packCode}:${stickerCode}]`;
}

export function stickerCatalogKey(packCode: string, stickerCode: string) {
  return `${packCode}:${stickerCode}`;
}
