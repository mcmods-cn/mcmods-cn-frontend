import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";

let uploadRoute: typeof import("../api/site-logo/route.ts");
let assetRoute: typeof import("../site-assets/[fileName]/route.ts");
const oldAPIBase = process.env.NEXT_PUBLIC_API_BASE_URL;
let allow = true;
let uploadStatus = 201;
let returnedURL = "/site-assets/site-logo-abc123xyz.png";
let assetStatus = 307;
let assetLocation = "https://storage.example.test/immutable-logo.png?signature=test-only";
const uploads: Array<{ authorization: string; cookie: string; contentType: string; bytes: Buffer }> = [];
let assetReads = 0;
const backend = createServer(async (request, response) => {
  if (request.url === "/api/v1/admin/config/general/logo-upload-access") {
    response.writeHead(allow ? 204 : 403).end();
    return;
  }
  if (request.method === "POST" && request.url === "/api/v1/admin/config/general/logo") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    uploads.push({ authorization: String(request.headers.authorization ?? ""), cookie: String(request.headers.cookie ?? ""), contentType: String(request.headers["content-type"]), bytes: Buffer.concat(chunks) });
    response.writeHead(uploadStatus, { "Content-Type": "application/json" }).end(JSON.stringify(
      uploadStatus === 201 ? { data: { url: returnedURL } } : { error: "shared storage unavailable", code: "SITE_LOGO_STORAGE_UNAVAILABLE" },
    ));
    return;
  }
  if (request.url === "/api/v1/site/logo/abc123xyz") {
    assetReads += 1;
    response.writeHead(assetStatus, { ...(assetStatus === 307 ? { Location: assetLocation } : {}) }).end();
    return;
  }
  response.writeHead(500).end("unexpected test API");
});

before(async () => {
  await new Promise<void>((resolve, reject) => { backend.once("error", reject); backend.listen(0, "127.0.0.1", resolve); });
  process.env.NEXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
  uploadRoute = await import("../api/site-logo/route.ts");
  assetRoute = await import("../site-assets/[fileName]/route.ts");
});
after(async () => {
  if (oldAPIBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = oldAPIBase;
  backend.closeAllConnections();
  await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
});

test("actual logo route sanitizes before shared upload, preserves failures, and rejects forged identities", async () => {
  const source = await sharp({ create: { width: 1024, height: 600, channels: 3, background: "#33aabb" } })
    .jpeg().withMetadata({ exif: { IFD0: { Copyright: "must-not-leave-the-frontend" } } }).toBuffer();
  const request = (bytes = source, mime = "image/jpeg") => {
    const form = new FormData();
    form.set("file", new File([Uint8Array.from(bytes).buffer], "logo.jpg", { type: mime }));
    return new Request("https://frontend.example.test/api/site-logo", { method: "POST", headers: { Authorization: "Bearer logo-test-only" }, body: form });
  };
  allow = false;
  assert.equal((await uploadRoute.POST(request())).status, 403);
  assert.equal(uploads.length, 0);
  allow = true;
  const accepted = await uploadRoute.POST(request());
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { url: returnedURL });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].authorization, "Bearer logo-test-only");
  assert.equal(uploads[0].contentType, "image/webp");
  const metadata = await sharp(uploads[0].bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok((metadata.width ?? Infinity) <= 512 && (metadata.height ?? Infinity) <= 512);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.pages ?? 1, 1);
  assert.equal((await uploadRoute.POST(request(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"))).status, 422);
  assert.equal(uploads.length, 1);
  uploadStatus = 503;
  const failed = await uploadRoute.POST(request());
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "shared storage unavailable", code: "SITE_LOGO_STORAGE_UNAVAILABLE" });
  uploadStatus = 201;
  returnedURL = "https://untrusted.example.test/arbitrary.svg";
  assert.equal((await uploadRoute.POST(request())).status, 502);
  returnedURL = "/site-assets/site-logo-abc123xyz.png";
});

test("actual asset route reads the shared identity without following or caching short signatures", async () => {
  const get = (fileName: string) => assetRoute.GET(new Request("https://frontend.example.test/site-assets/" + fileName), { params: Promise.resolve({ fileName }) });
  const response = await get("site-logo-abc123xyz.png");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), assetLocation);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(assetReads, 1);
  assert.equal((await get("site-logo-0123456789abcdefabcd.webp")).status, 404);
  assert.equal((await get("../../.env")).status, 404);
  assert.equal(assetReads, 1);
  assetStatus = 404;
  assert.equal((await get("site-logo-abc123xyz.png")).status, 404);
  assetStatus = 503;
  assert.equal((await get("site-logo-abc123xyz.png")).status, 503);
  assetStatus = 307;
  assetLocation = "javascript:alert(1)";
  assert.equal((await get("site-logo-abc123xyz.png")).status, 502);
});

test("TEST024 actual logo BFF accepts a real cookie session without exposing its JWT to client code", async () => {
  const bytes = await sharp({ create: { width: 32, height: 16, channels: 3, background: "#33aabb" } }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([Uint8Array.from(bytes).buffer], "logo.png", { type: "image/png" }));
  const response = await uploadRoute.POST(new Request("https://frontend.example.test/api/site-logo", {
    method: "POST",
    headers: { Cookie: "mcmods_session=controlled-cookie-only-session", Origin: "https://frontend.example.test" },
    body: form,
  }));
  assert.equal(response.status, 201, "cookie-session is an auth-state marker, not a bearer credential");
  assert.equal(uploads.at(-1)?.authorization, "");
  assert.equal(uploads.at(-1)?.cookie, "mcmods_session=controlled-cookie-only-session");
  const attempts = uploads.length;
  const foreign = new FormData();
  foreign.set("file", new File([Uint8Array.from(bytes).buffer], "logo.png", { type: "image/png" }));
  assert.equal((await uploadRoute.POST(new Request("https://frontend.example.test/api/site-logo", {
    method: "POST", headers: { Cookie: "mcmods_session=controlled-cookie-only-session", Origin: "https://foreign.example.test" }, body: foreign,
  }))).status, 403);
  assert.equal(uploads.length, attempts, "cross-site cookie mutation must stop before shared writes");
  const scoped = new FormData();
  scoped.set("file", new File([Uint8Array.from(bytes).buffer], "logo.png", { type: "image/png" }));
  assert.equal((await uploadRoute.POST(new Request("https://frontend.example.test/api/site-logo", {
    method: "POST", headers: { Authorization: "SiteLogo test024-opaque-delegation" }, body: scoped,
  }))).status, 201);
  assert.equal(uploads.at(-1)?.authorization, "SiteLogo test024-opaque-delegation");
  assert.equal(uploads.at(-1)?.cookie, "");
});
