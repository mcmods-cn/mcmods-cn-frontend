import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ExpiringPromiseCache } from "./sticker-catalog-cache.mts";

const apiSource = readFileSync(new URL("./sticker-api.ts", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../_components/admin-sticker-panel.tsx", import.meta.url), "utf8");

test("coalesces requests only inside a finite stale window", async () => {
  const cache = new ExpiringPromiseCache<number>(30_000);
  let loads = 0;
  const load = async () => ++loads;

  const first = cache.get("zh-CN", load, 1_000);
  const coalesced = cache.get("zh-CN", load, 20_000);
  assert.strictEqual(coalesced, first);
  assert.equal(await first, 1);
  assert.equal(loads, 1);

  assert.equal(await cache.get("zh-CN", load, 31_001), 2);
  assert.equal(loads, 2);
});

test("explicit invalidation forces an immediate catalog reload", async () => {
  const cache = new ExpiringPromiseCache<number>(30_000);
  let loads = 0;
  const load = async () => ++loads;
  assert.equal(await cache.get("en-US", load, 1_000), 1);
  cache.invalidate("en-US");
  assert.equal(await cache.get("en-US", load, 1_001), 2);
  cache.invalidate();
  assert.equal(await cache.get("en-US", load, 1_002), 3);
});

test("failed catalog requests are immediately retryable", async () => {
  const cache = new ExpiringPromiseCache<number>(30_000);
  let loads = 0;
  await assert.rejects(cache.get("zh-CN", async () => {
    loads += 1;
    throw new Error("offline");
  }, 1_000));
  assert.equal(await cache.get("zh-CN", async () => ++loads, 1_001), 2);
});

test("TTL and explicit mutation invalidation are the only client cache authorities", () => {
  assert.doesNotMatch(apiSource, /\bversion:\s*number/);
  assert.match(apiSource, /STICKER_CATALOG_STALE_TIME_MS\s*=\s*30_000/);
  assert.match(adminSource, /invalidateStickerCatalog\(\)/);
});
