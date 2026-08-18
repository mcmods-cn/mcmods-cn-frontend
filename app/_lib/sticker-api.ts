import { apiRequest } from "./api";

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
  version: number;
  locale: string;
  packs: StickerCatalogPack[];
};

let catalogRequest: Promise<StickerCatalog> | null = null;
let catalogLocale = "";

export function loadStickerCatalog(locale: string): Promise<StickerCatalog> {
  if (!catalogRequest || catalogLocale !== locale) {
    catalogLocale = locale;
    catalogRequest = apiRequest<StickerCatalog>(`/api/v1/stickers?locale=${encodeURIComponent(locale)}`).catch((error) => {
      catalogRequest = null;
      throw error;
    });
  }
  return catalogRequest;
}

export function stickerToken(packCode: string, stickerCode: string) {
  return `[sticker:${packCode}:${stickerCode}]`;
}

export function stickerCatalogKey(packCode: string, stickerCode: string) {
  return `${packCode}:${stickerCode}`;
}
