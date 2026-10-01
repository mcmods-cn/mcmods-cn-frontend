import { expect, test } from "@playwright/test";

const backendURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18080";
const parsed = new URL(backendURL);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error("E2E tests require an isolated loopback backend");
}

test.beforeEach(async ({ request }) => {
  const ready = await request.get(`${backendURL}/ready`);
  expect(ready.status(), "real isolated backend must be ready").toBe(200);
});

test("production CSP permits hydration and login errors preserve input", async ({ page }) => {
  const policyErrors: string[] = [];
  page.on("console", (message) => {
    if (/content security policy|violates.*script-src/i.test(message.text())) policyErrors.push(message.text());
  });
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  const account = page.locator('form input[type="text"]').first();
  await account.fill("nonexistent-e2e@example.invalid");
  await page.locator('form input[type="password"]').fill("SyntheticInvalidPassword123");
  const rejected = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login") && r.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByText("账号或密码不正确")).toBeVisible();
  await expect(account).toHaveValue("nonexistent-e2e@example.invalid");
  expect(policyErrors).toEqual([]);
});

test("real cookie login survives refresh and logout revokes the session", async ({ page }) => {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || process.env.APP_ENV !== "test") throw new Error("source the owned test-services env.sh before E2E");
  await page.goto("/login?next=/user");
  await page.locator('form input[type="text"]').first().fill("admin");
  await page.locator('form input[type="password"]').fill(password);
  const loggedIn = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login") && r.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  expect((await loggedIn).status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === "/user");
  const me = await page.request.get(`${backendURL}/api/v1/auth/me`);
  expect(me.status()).toBe(200);
  await page.reload();
  await page.locator('header a[title="admin"]').focus();
  await expect(page.locator("header").getByText("admin", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect.poll(async () => (await page.request.get(`${backendURL}/api/v1/auth/me`)).status()).toBe(401);
  await page.reload();
  await expect(page.locator("header").getByRole("link", { name: "登录", exact: true })).toBeVisible();
});

test("mobile language switching preserves route and uses the real public API", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const catalogLoaded = page.waitForResponse((r) => r.url().startsWith(`${backendURL}/api/v1/mods?`) && r.request().method() === "GET");
  await page.goto("/mods?search=synthetic-no-results&page=2");
  expect((await catalogLoaded).status()).toBe(200);
  const originalURL = page.url();
  const selector = page.locator("header select").first();
  await expect(selector).toBeVisible();
  await selector.selectOption("en-US");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  expect(page.url()).toBe(originalURL);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(selector).toHaveValue("en-US");
  const response = await page.request.get(`${backendURL}/api/v1/mods?search=synthetic-no-results&page=2`);
  expect(response.status()).toBe(200);
  const envelope: { data?: unknown } = await response.json();
  expect(envelope.data).toBeDefined();
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
  await page.screenshot({ path: "test-results/mobile-en-mods.png", fullPage: true });
});

test("unauthenticated administration is rejected by the actual backend", async ({ request, page }) => {
  const response = await request.get(`${backendURL}/api/v1/admin/users`);
  expect(response.status()).toBe(401);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("ordinary user edits persist and a private collection completes its lifecycle", async ({ browser, page }) => {
  const failedRequests: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(backendURL)) {
      failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || process.env.APP_ENV !== "test") throw new Error("owned test environment required");
  const username = `e2e_${Date.now()}`;
  const userPassword = `Synthetic-${Date.now()}-password`;
  // Setup uses the real admin API in a separate cookie context; the tested
  // browser then exercises only the ordinary user's actual account.
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: process.env.MCMODS_E2E_BASE_URL ?? "http://127.0.0.1:13000" } });
  try {
    expect((await admin.request.post(`${backendURL}/api/v1/auth/login`, { data: { account: "admin", password } })).status()).toBe(200);
    expect((await admin.request.post(`${backendURL}/api/v1/admin/users`, { data: { username, email: `${username}@example.invalid`, password: userPassword, roles: ["registered"] } })).status()).toBe(201);
    expect((await admin.request.post(`${backendURL}/api/v1/auth/logout`)).status()).toBe(200);
  } finally { await admin.close(); }
  await page.goto("/login?next=/user");
  await page.locator('form input[type="text"]').first().fill(username);
  await page.locator('form input[type="password"]').fill(userPassword);
  const userLoggedIn = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login") && r.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  expect((await userLoggedIn).status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === "/user");
  expect((await page.request.get(`${backendURL}/api/v1/admin/users`)).status()).toBe(403);
  await page.goto("/user?section=settings");
  const signature = `Synthetic signature ${username}`;
  await page.locator("#profile-signature").fill(signature);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me/profile-settings") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "保存个人资料", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator("#profile-signature")).toHaveValue(signature);
  await page.goto("/user?section=favorites");
  const collectionName = `Synthetic collection ${username}`;
  await page.getByPlaceholder("新收藏夹名称").fill(collectionName);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me/favorite-collections") && r.request().method() === "POST");
  await page.getByRole("button", { name: "新建收藏夹", exact: true }).click();
  expect((await created).status()).toBe(201);
  await page.reload();
  const collection = page.locator("aside > div").filter({ hasText: collectionName });
  await expect(collection, failedRequests.join("; ")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  const deleted = page.waitForResponse((r) => r.url().includes("/api/v1/users/me/favorite-collections/") && r.request().method() === "DELETE");
  await collection.getByTitle("删除", { exact: true }).click();
  expect((await deleted).status()).toBe(204);
  await expect(collection).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(collectionName, { exact: true })).toHaveCount(0);
});
