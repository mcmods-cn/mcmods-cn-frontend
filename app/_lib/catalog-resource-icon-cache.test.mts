import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ExpiringPromiseCache } from "./sticker-catalog-cache.mts";

test("promise cache evicts the least recently used key at its hard capacity", async () => {
  const cache = new ExpiringPromiseCache<number>(30_000, 2);
  let loads = 0;
  const load = async () => ++loads;

  assert.equal(await cache.get("a", load, 1_000), 1);
  assert.equal(await cache.get("b", load, 1_001), 2);
  assert.equal(await cache.get("a", load, 1_002), 1);
  assert.equal(await cache.get("c", load, 1_003), 3);
  assert.equal(await cache.get("b", load, 1_004), 4);
});

test("catalog resource icons use the bounded expiring request cache", async () => {
  const component = await readFile(new URL("../_components/catalog-resource-icon.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /const resourceCache = new Map/);
  assert.match(component, /new ExpiringPromiseCache<CatalogResourceRef \| null>/);
  assert.match(component, /CATALOG_ICON_CACHE_MAX_ENTRIES/);
  assert.match(component, /CATALOG_ICON_CACHE_STALE_TIME_MS/);
});
