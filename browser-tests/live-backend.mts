import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

// Opt-in only: this suite uses the application's real API, cookies and DB.
// Supply synthetic credentials from an owned isolated backend environment.
function loopbackOrigin(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required for the isolated live test`);
  const url = new URL(value);
  assert(url.hostname === "127.0.0.1" && ["http:", "https:"].includes(url.protocol)
    && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash,
  `${name} must be a loopback origin without credentials`);
  return url.origin;
}

test("Live backend: cookie login, persistent favorites, language changes, deletion and logout", { timeout: 90_000 }, async () => {
  const origin = loopbackOrigin("MCMODS_LIVE_FRONTEND_ORIGIN");
  const api = loopbackOrigin("MCMODS_LIVE_API_ORIGIN");
  const account = process.env.MCMODS_LIVE_ACCOUNT;
  const password = process.env.MCMODS_LIVE_PASSWORD;
  assert(account && password, "Synthetic live account credentials are required");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US", serviceWorkers: "block" });
  await context.addCookies([{ name: "mcmods-ui-locale", value: "en-US", url: origin }]);
  // Own application and API requests remain untouched. Prevent external media
  // from leaving this isolated test; no backend endpoint gets a fixture reply.
  await context.route(url => ![origin, api].includes(url.origin), route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    assert.equal((await context.request.get(`${api}/api/v1/auth/me`)).status(), 401);
    const documentResponse = await page.goto(`${origin}/login?next=${encodeURIComponent("/user?section=favorites")}`);
    assert.equal(documentResponse?.status(), 200);
    const policy = documentResponse?.headers()["content-security-policy"];
    assert(policy && /script-src[^;]*'nonce-[^']+'/.test(policy) && policy.includes(api),
      "The independent Next copy must retain its real nonce CSP and configured API origin");
    await page.getByLabel("Account", { exact: true }).fill(account);
    // Evaluation avoids including a generated credential in action diagnostics.
    await page.locator('input[type="password"]').evaluate((input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, password);
    const login = page.waitForResponse(r => r.url() === `${api}/api/v1/auth/login` && r.request().method() === "POST");
    await page.locator('form button[type="submit"]').click();
    assert.equal((await login).status(), 200);
    await page.waitForURL(url => url.pathname === "/user" && url.searchParams.get("section") === "favorites");
    const session = (await context.cookies(`${api}/api/v1/auth/me`)).find(cookie => cookie.name === "mcmods_session");
    assert(session?.httpOnly, "The real login must set an HttpOnly session cookie");
    assert.equal(await page.evaluate(() => document.cookie.includes("mcmods_session=")), false);
    const name = `audit-live-${Date.now()}`;
    await page.getByRole("textbox", { name: "New collection name", exact: true }).fill(name);
    const created = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/users/me/favorite-collections" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create collection", exact: true }).click();
    assert.equal((await created).status(), 201);
    const collection = () => page.getByRole("button", { name: new RegExp(`^${name}`) });
    await collection().waitFor();
    await page.reload();
    await collection().waitFor();
    await collection().click();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    await page.getByRole("heading", { name, exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("header details summary").click();
    await page.locator("header details select").selectOption("en-US");
    await page.waitForFunction(() => document.documentElement.lang === "en-US");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 800 });
    page.once("dialog", dialog => dialog.dismiss());
    await collection().locator("..").getByRole("button", { name: "Delete", exact: true }).click();
    await collection().waitFor();
    const deleted = page.waitForResponse(r => new URL(r.url()).pathname.startsWith("/api/v1/users/me/favorite-collections/") && r.request().method() === "DELETE");
    page.once("dialog", dialog => dialog.accept());
    await collection().locator("..").getByRole("button", { name: "Delete", exact: true }).click();
    assert.equal((await deleted).status(), 204);
    await collection().waitFor({ state: "detached" });
    await page.reload();
    await page.getByRole("textbox", { name: "New collection name", exact: true }).waitFor();
    assert.equal(await collection().count(), 0);
    const logout = await context.request.post(`${api}/api/v1/auth/logout`, { data: {}, headers: { Origin: origin } });
    assert.equal(logout.status(), 200);
    assert.equal((await context.request.get(`${api}/api/v1/auth/me`)).status(), 401);
    await page.reload();
    await page.getByRole("heading", { name: "Please log in", exact: true }).waitFor();
    assert.deepEqual(errors, [], "The actual application must not throw during this journey");
  } finally {
    await browser.close();
  }
});
