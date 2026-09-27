import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import sharp from "sharp";

import {
  createSafeSiteLogo,
  maximumLogoRequestBytes,
  readBoundedRequestBody,
} from "./site-logo-image.mts";

test("the request body reader rejects a declared oversized body before parsing multipart data", async () => {
  const request = new Request("https://example.test/api/site-logo", {
    method: "POST",
    headers: { "content-length": String(maximumLogoRequestBytes + 1) },
  });

  await assert.rejects(readBoundedRequestBody(request), /request body is too large/);
});

test("the request body reader cancels a chunked body as soon as its limit is crossed", async () => {
  let chunksProduced = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksProduced += 1;
      controller.enqueue(new Uint8Array(8));
      if (chunksProduced === 100) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://example.test/api/site-logo", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(readBoundedRequestBody(request, 12), /request body is too large/);
  assert.equal(cancelled, true);
  assert.ok(chunksProduced < 100, `reader consumed all ${chunksProduced} chunks`);
});

test("accepted images become bounded static WebP derivatives without source metadata", async () => {
  const source = await sharp({
    create: { width: 1024, height: 600, channels: 4, background: "#2878c8" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "must-not-survive" } } })
    .toBuffer();

  const result = await createSafeSiteLogo(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok((metadata.width ?? Infinity) <= 512);
  assert.ok((metadata.height ?? Infinity) <= 512);
  assert.equal(metadata.pages ?? 1, 1);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
});

test("animated input is flattened to one frame and excessive frame counts are rejected", async () => {
  const twoFrames = rawAnimatedFrames(16, 16, 2);
  const animated = await sharp(twoFrames.bytes, { raw: twoFrames.raw })
    .gif({ loop: 0, delay: [20, 20] })
    .toBuffer();
  const result = await createSafeSiteLogo(animated);
  assert.equal((await sharp(result, { animated: true }).metadata()).pages ?? 1, 1);

  const excessiveFrames = rawAnimatedFrames(2, 2, 129);
  const excessiveAnimation = await sharp(excessiveFrames.bytes, { raw: excessiveFrames.raw })
    .gif({ loop: 0, delay: Array.from({ length: 129 }, () => 20) })
    .toBuffer();
  await assert.rejects(createSafeSiteLogo(excessiveAnimation), /frame budget/);
});

test("image validation rejects unsupported formats and excessive decoded dimensions", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
  await assert.rejects(createSafeSiteLogo(svg), /unsupported logo format/);

  const overlong = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: "white" },
  }).png().toBuffer();
  await assert.rejects(createSafeSiteLogo(overlong), /dimensions exceed/);

  const tooManyPixels = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: "white" },
  }).png().toBuffer();
  await assert.rejects(createSafeSiteLogo(tooManyPixels), /pixel budget/);
});

test("the upload and serving routes expose only sanitized WebP assets", async () => {
  const [uploadRoute, servingRoute, brandProvider] = await Promise.all([
    readFile(new URL("../api/site-logo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../site-assets/[fileName]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/site-brand-provider.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(uploadRoute, /readBoundedRequestBody\(request/);
  assert.doesNotMatch(uploadRoute, /request\.formData\(\)/);
  assert.match(uploadRoute, /createSafeSiteLogo/);
  assert.match(uploadRoute, /site-logo-\$\{digest\}\.webp/);
  assert.doesNotMatch(uploadRoute, /rasterExtension/);
  assert.match(servingRoute, /\^site-logo-\[a-f0-9\]\{20\}\\\.webp\$/);
  assert.doesNotMatch(servingRoute, /png\|jpe\?g\|webp\|gif/);
  assert.match(brandProvider, /site-logo-\[a-f0-9\]\{20\}\\\.webp/);
});

function rawAnimatedFrames(width: number, height: number, pages: number) {
  const bytes = Buffer.alloc(width * height * pages * 4);
  const frameBytes = width * height * 4;
  for (let page = 0; page < pages; page += 1) {
    for (let offset = page * frameBytes; offset < (page + 1) * frameBytes; offset += 4) {
      bytes[offset] = page % 251;
      bytes[offset + 1] = (page * 3) % 251;
      bytes[offset + 2] = (page * 7) % 251;
      bytes[offset + 3] = 255;
    }
  }
  return {
    bytes,
    raw: { width, height: height * pages, channels: 4 as const, pageHeight: height },
  };
}
