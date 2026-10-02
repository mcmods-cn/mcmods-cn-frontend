import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { ProductionBrowserFixture, navigateAdminPanel, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
let brand = { siteName: "Original Brand", logoUrl: "" };
let uploadFailure = false;
let settingFailure = false;
let brandFailure = false;
let delegations = 0;
let saved: Array<{ siteName: string; logoUrl: string }> = [];
let derivatives: Buffer[] = [];
let serveAsset = true;
let ownedAssetURL = "";
const dataPage = (items: unknown[], limit: number) => ({ items, limit, hasMore: false, nextCursor: "" });
const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#33aabb" } }).png().toBuffer();
const source = await sharp({ create: { width: 1024, height: 600, channels: 3, background: "#33aabb" } })
  .jpeg().withMetadata({ exif: { IFD0: { Copyright: "TEST024 must be stripped" } } }).toBuffer();
const credential = "SiteLogo test024-owned-opaque-delegation";
const logoURL = "/site-assets/site-logo-abc123xyz.png";

const serverAPI: APIHandler = async ({ path, method, headers, body, url }) => {
  if (path === "/api/v1/site/config") return brandFailure ? { status: 503, error: "Controlled brand read failed" } : { data: brand };
  if (path === "/api/v1/admin/config/general/logo-upload-access") {
    assert.equal(headers.authorization, credential);
    assert.equal(headers.cookie, undefined, "the real backend cookie is not relayed across split hosts");
    return { status: 204 };
  }
  if (path === "/api/v1/admin/config/general/logo" && method === "POST") {
    assert.equal(headers.authorization, credential);
    assert.equal(headers["content-type"], "image/webp");
    const derivative = Buffer.from(body, "binary");
    const meta = await sharp(derivative).metadata();
    assert.equal(meta.format, "webp");
    assert.ok((meta.width ?? Infinity) <= 512 && (meta.height ?? Infinity) <= 512);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
    derivatives.push(derivative);
    return uploadFailure ? { status: 503, error: "Controlled shared upload failure" } : { status: 201, data: { url: logoURL } };
  }
  if (path === "/api/v1/site/logo/abc123xyz") {
    ownedAssetURL = new URL("/test-logo.png", url.origin).href;
    return serveAsset ? { status: 307, headers: { Location: "https://oss.mcmods.cn/test-logo.png", "Cache-Control": "private, no-store" } } : { status: 404 };
  }
  if (path === "/test-logo.png") return { contentType: "image/png", bytes: png };
};

const browserAPI: APIHandler = ({ path, method, body, headers }) => {
  if (path === "/api/v1/site/config") return brandFailure ? { status: 503, error: "Controlled brand read failed" } : { data: brand };
  if (path === "/api/v1/admin/config") return { data: { general: brand, features: {} } };
  if (path === "/api/v1/admin/config/general/logo-upload-authorization" && method === "POST") {
    assert.equal(headers.authorization, undefined, "cookie-session must never be treated as a bearer JWT");
    assert.match(headers.cookie ?? "", /mcmods_session=test024-private-api-cookie/);
    delegations++;
    return { data: { authorization: credential, expiresAt: Math.floor(Date.now() / 1000) + 60 } };
  }
  if (path === "/api/v1/admin/config/general" && method === "PUT") {
    const draft = JSON.parse(body) as typeof brand;
    saved.push(draft);
    if (settingFailure) return { status: 500, error: "Controlled setting save failure" };
    brand = { ...draft };
    return { data: brand };
  }
  if (path === "/api/v1/notifications") return { data: dataPage([], 50) };
  if (path === "/api/v1/messages/conversations") return { data: dataPage([], 30) };
};

before(async () => { await fixture.start(serverAPI); });
after(async () => { await fixture.close(); });

async function page() {
  const browser = await fixture.page(browserAPI);
  // localhost and example.test are deliberately different test sites; this
  // synthetic transport cookie does not assert or change production SameSite.
  // Actual Lax/Origin/session enforcement is covered by the complete Go HTTP gate.
  await browser.page.context().addCookies([{ name: "mcmods_session", value: "test024-private-api-cookie", domain: "api.example.test", path: "/api/", httpOnly: true, secure: true, sameSite: "None" }]);
  // Playwright routes only the first URL of a redirect chain. Exercise the
  // actual Next asset GET and its 307/no-store contract, then explicitly map
  // the provider hop to owned HTTP bytes. This is not a live public OSS E2E.
  await browser.page.route(`${fixture.origin}/site-assets/**`, async route => {
    const redirect = await route.fetch({ maxRedirects: 0 });
    assert.equal(redirect.status(), 307);
    assert.equal(redirect.headers().location, "https://oss.mcmods.cn/test-logo.png");
    assert.match(redirect.headers()["cache-control"], /no-store/);
    const response = await fetch(ownedAssetURL);
    assert.equal(response.status, 200);
    await route.fulfill({ status: 200, contentType: "image/png", headers: { "Cache-Control": "private, no-store" }, body: Buffer.from(await response.arrayBuffer()) });
  });
  return browser;
}

test("TEST024 real GeneralSettings uses scoped upload, preserves failures, refreshes brand/title and removes the logo", { timeout: 30_000 }, async () => {
  brand = { siteName: "Original Brand", logoUrl: "" };
  uploadFailure = settingFailure = brandFailure = false;
  delegations = 0; saved = []; derivatives = []; serveAsset = true;
  const browser = await page();
  const { page: actual } = browser;
  const assetEvents: string[] = [];
  actual.on("request", request => { if (/site-assets|test-logo/.test(request.url())) assetEvents.push(`request ${request.url()}`); });
  actual.on("response", response => { if (/site-assets|test-logo/.test(response.url())) assetEvents.push(`response ${response.status()} ${response.url()}`); });
  actual.on("requestfailed", request => { if (/site-assets|test-logo/.test(request.url())) assetEvents.push(`failed ${request.url()} ${request.failure()?.errorText}`); });
  actual.on("console", message => { if (message.type() === "error") assetEvents.push(message.text()); });
  try {
    await navigateAdminPanel(actual, fixture.origin, "General settings", "System");
    assert.equal(await actual.title(), "Original Brand");
    assert.ok(!(await actual.evaluate(() => document.cookie)).includes("test024-private-api-cookie"));
    const input = actual.locator('input[type="file"]');
    const save = actual.getByRole("button", { name: "Save", exact: true });
    await input.setInputFiles({ name: "logo.jpg", mimeType: "image/jpeg", buffer: source });
    await actual.getByRole("button", { name: "Remove logo", exact: true }).waitFor();
    assert.equal(delegations, 1);
    assert.equal(derivatives.length, 1);
    assert.equal(brand.logoUrl, "", "upload must remain staging until save");
    assert.deepEqual(saved, []);
    await actual.waitForFunction(url => [...document.images].some(image => image.src.endsWith(url) && image.naturalWidth === 16), logoURL);
    uploadFailure = true;
    await input.setInputFiles({ name: "failed.jpg", mimeType: "image/jpeg", buffer: source });
    await actual.getByText("Controlled shared upload failure", { exact: true }).waitFor();
    assert.equal(await actual.getByRole("button", { name: "Remove logo", exact: true }).count(), 1, "failed upload keeps prior draft");
    uploadFailure = false;
    await actual.getByLabel("Site name", { exact: true }).fill("Second Brand");
    settingFailure = true;
    await save.click();
    await actual.getByText("Controlled setting save failure", { exact: true }).waitFor();
    assert.equal(brand.siteName, "Original Brand");
    assert.equal(await actual.title(), "Original Brand");
    assert.equal(await actual.getByLabel("Site name", { exact: true }).inputValue(), "Second Brand");
    settingFailure = false;
    await save.click();
    await actual.getByText("General site settings saved.", { exact: true }).waitFor();
    await actual.waitForFunction(() => document.title === "Second Brand");
    assert.deepEqual(brand, { siteName: "Second Brand", logoUrl: logoURL });
    assert.deepEqual(saved, [{ siteName: "Second Brand", logoUrl: logoURL }, { siteName: "Second Brand", logoUrl: logoURL }]);
    await actual.getByRole("button", { name: "Remove logo", exact: true }).click();
    assert.equal(brand.logoUrl, logoURL, "removal is also a draft until saved");
    await save.click();
    await actual.getByText("General site settings saved.", { exact: true }).waitFor();
    assert.equal(brand.logoUrl, "");
    assert.equal(await actual.getByRole("button", { name: "Remove logo", exact: true }).count(), 0);
  } catch (error) {
    console.error("Owned TEST024 asset events", assetEvents);
    throw error;
  } finally { await browser.close(); }
});

test("TEST024 real Provider and metadata fail back coherently and recover using the supported Next boundary", { timeout: 30_000 }, async () => {
  brand = { siteName: "  Metadata %s Brand  ", logoUrl: "" };
  brandFailure = true;
  const browser = await page();
  const { page: actual } = browser;
  try {
    await actual.goto(`${fixture.origin}/messages`);
    assert.equal(await actual.title(), "Mcmods-cn");
    await actual.getByRole("link", { name: "Home", exact: true }).getByText("Mcmods-cn", { exact: true }).waitFor();
    brandFailure = false;
    await actual.evaluate(() => window.dispatchEvent(new Event("mcmods-site-brand-change")));
    await actual.waitForFunction(() => document.title === "Metadata % s Brand");
    await actual.getByRole("link", { name: "Home", exact: true }).getByText("Metadata %s Brand", { exact: true }).waitFor();
    // Next streaming metadata can also inject an inert title into body. The
    // document's authoritative head and browser title must both be current.
    assert.equal(await actual.locator("head title").count(), 1, "there must be one authoritative Next-owned head title");
    assert.equal(await actual.locator("head title").textContent(), "Metadata % s Brand");
  } finally { brandFailure = false; await browser.close(); }
});
