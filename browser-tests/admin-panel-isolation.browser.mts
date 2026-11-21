import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("a failed dashboard leaves navigation and settings usable; an unread settings snapshot cannot be saved", { timeout: 30_000 }, async () => {
  let settingsAvailable = false;
  let configReads = 0;
  const unrelatedReads: string[] = [];
  const writes: string[] = [];
  const browser = await fixture.page(({ path, method }) => {
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes.push(path);
    if (path === "/api/v1/admin/dashboard") return { status: 503, error: "Synthetic dashboard outage" };
    if (path === "/api/v1/site/config") {
      configReads++;
      return settingsAvailable
        ? { data: { siteName: "Saved site name", logoUrl: "" } }
        : { status: 503, error: "Synthetic settings outage" };
    }
    if (path === "/api/v1/admin/users" || path === "/api/v1/admin/permissions" || path === "/api/v1/admin/ai/config") {
      unrelatedReads.push(path);
      return { status: 503, error: "An unrelated panel was fetched" };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="general-settings"]').click();
    const panel = page.locator("main section").filter({ has: page.getByRole("heading", { level: 1 }) }).last();
    await panel.getByRole("alert").waitFor();
    assert.equal(await panel.locator("form, input").count(), 0);
    const attempts = configReads;
    settingsAvailable = true;
    await panel.getByRole("button", { name: "Retry", exact: true }).click();
    const name = panel.getByRole("textbox", { name: "Site name", exact: true });
    await name.waitFor();
    assert.equal(await name.inputValue(), "Saved site name");
    await name.fill("Unsaved site name");
    assert.equal(configReads, attempts + 1);
    assert.deepEqual(writes, []);
    assert.deepEqual(unrelatedReads, []);
    assert.equal(await name.inputValue(), "Unsaved site name");
    assert.equal(new URL(page.url()).pathname, "/admin");
  } finally { await browser.close(); }
});


test("a late role-catalog failure preserves the active user draft and retries only its suggestions", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let catalogReads = 0;
  let userReads = 0;
  let writes = 0;
  const browser = await fixture.page(async ({ path, method }) => {
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/users") { userReads++; return { data: [] }; }
    if (path === "/api/v1/admin/permissions") {
      if (++catalogReads === 1) { started.resolve(); await release.promise; return { status: 503, error: "Synthetic role catalog outage" }; }
      return { data: { permissions: [], roles: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="users"]').click();
    await page.locator('[data-admin-panel="users"]').click();
    await started.promise;
    const username = page.locator('input[name="username"]');
    await username.fill("draft-reviewer");
    release.resolve();
    const failure = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry", exact: true }) });
    await failure.waitFor();
    assert.equal(await username.inputValue(), "draft-reviewer");
    const retried = page.waitForResponse(response => response.url().endsWith("/api/v1/admin/permissions"));
    await failure.getByRole("button").click();
    await retried;
    await failure.waitFor({ state: "detached" });
    assert.equal(await username.inputValue(), "draft-reviewer");
    assert.deepEqual({ catalogReads, userReads, writes }, { catalogReads: 2, userReads: 1, writes: 0 });
  } finally { release.resolve(); await browser.close(); }
});

test("revoking a settings read removes the editor and ignores the actor's late response", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let version = 1;
  let writes = 0;
  const browser = await fixture.page(async ({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: {
      id: "reviewer01", username: "Synthetic reviewer", roleCodes: [], permissionVersion: version, rbacVersion: 1,
      permissionRules: [{ code: "admin.access", allow: true, priority: 1 }, ...(version === 1 ? [{ code: "admin.config.read", allow: true, priority: 1 }] : [])],
    } };
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/config/profile") {
      started.resolve(); await release.promise; finished.resolve();
      return { data: { signatureMaxBytes: 5173 } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="profile-settings"]').click();
    await started.promise;
    version = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("mcmods-permissions-changed")));
    await page.locator('[data-admin-panel="profile-settings"]').waitFor({ state: "detached" });
    release.resolve(); await finished.promise;
    assert.equal(await page.locator('input[value="5173"]').count(), 0);
    assert.equal(writes, 0);
  } finally { release.resolve(); await browser.close(); }
});

test("mail settings preserve disabled delivery on edit and confirm the saved state", { timeout: 30_000 }, async () => {
  const snapshot = { enabled: false, host: "mail.example.invalid", port: 587, username: "fixture", from: "admin@example.invalid", useTLS: true, hasPassword: false };
  const writes: Array<{ enabled: boolean; host: string }> = [];
  let attempts = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/config/mail") {
      if (method === "GET") return { data: snapshot };
      const draft = JSON.parse(body) as typeof snapshot;
      writes.push({ enabled: draft.enabled, host: draft.host });
      return { data: { ...draft, hasPassword: false } };
    }
    if (path === "/api/v1/admin/mail/test") { attempts++; return { data: { sent: true } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="mail"]').click();
    const enabled = page.locator('input[name="enabled"]');
    await enabled.waitFor();
    assert.equal(await enabled.isChecked(), false);
    await page.locator('input[name="host"]').fill("changed.example.invalid");
    const submit = page.locator('form button[type="submit"]');
    const saved = page.waitForResponse(r => r.url().endsWith("/api/v1/admin/config/mail") && r.request().method() === "PUT");
    await submit.click();
    await saved;
    await page.getByText("changed.example.invalid", { exact: true }).waitFor();
    assert.deepEqual(writes, [{ enabled: false, host: "changed.example.invalid" }]);
    assert.equal(attempts, 0);
  } finally { await browser.close(); }
});

test("partial Markdown settings cannot populate a writable form; a read-only account can inspect the saved mail settings", { timeout: 30_000 }, async () => {
  const reads: string[] = [];
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: {
      id: "reader01", username: "Settings reader", roleCodes: [], permissionVersion: 1, rbacVersion: 1,
      permissionRules: ["admin.access", "admin.config.read"].map(code => ({ code, allow: true, priority: 1 })),
    } };
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/config/markdown") { reads.push("markdown"); return { data: {} }; }
    if (path === "/api/v1/admin/config/mail") {
      reads.push("mail");
      return { data: { enabled: false, host: "inspect.example.invalid", port: 587, username: "", from: "", useTLS: true, hasPassword: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="markdown"]').click();
    await page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry", exact: true }) }).waitFor();
    assert.equal(await page.locator('main input').count(), 0);
    await page.locator('[data-admin-panel="mail"]').click();
    const host = page.locator('input[name="host"]');
    await host.waitFor();
    assert.equal(await host.inputValue(), "inspect.example.invalid");
    assert.equal(await host.isDisabled(), true);
    assert.equal(await page.locator('form button[type="submit"]').isDisabled(), true);
    assert.deepEqual(reads, ["markdown", "mail"]);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("overview requests only dashboard metrics, then retries feature flags without reloading the dashboard", { timeout: 30_000 }, async () => {
  const requests: string[] = [];
  const browser = await fixture.page(({ path, method }) => {
    if (!path.startsWith("/api/v1/admin/") || method !== "GET") return;
    requests.push(path);
    if (path === "/api/v1/admin/config/features") {
      return requests.filter(value => value === path).length === 1
        ? { status: 503, error: "Synthetic feature flag read failed" }
        : { data: { redis: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.getByText("All projects", { exact: true }).waitFor();
    assert.deepEqual(requests, ["/api/v1/admin/dashboard"]);
    const settings = page.locator("details").filter({ has: page.locator("summary") });
    await settings.locator("summary").click();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await settings.getByText("redis", { exact: true }).waitFor();
    assert.deepEqual(requests, ["/api/v1/admin/dashboard", "/api/v1/admin/config/features", "/api/v1/admin/config/features"]);
  } finally { await browser.close(); }
});
