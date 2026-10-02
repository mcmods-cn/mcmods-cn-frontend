import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
async function panel(page: Page, name: string, group: string) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="workbench"]').waitFor();
  if (await page.locator(`[data-admin-panel="${name}"]`).count() === 0) await page.locator(`[data-admin-group="${group}"]`).click();
  await page.locator(`[data-admin-panel="${name}"]`).click();
}

// Real production UI, explicit deterministic HTTP boundaries. These cases do
// not establish backend persistence, actual authorization or provider quality.
test("OCT02 failed OSS config reads cannot save defaults and offer a real retry", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/admin/config/oss") {
      if (method === "PUT") { writes++; return { data: {} }; }
      if (++reads === 1) return { status: 503, error: "Synthetic configuration read failure" };
      return { data: { enabled: false, region: "cn-beijing", endpoint: "https://oss-cn-beijing.aliyuncs.com", publicEndpoint: "", bucket: "synthetic-bucket", accessKeyId: "", prefix: "fixture", useCName: false, downloadUrlTtlMinutes: 10, downloadUrlMode: "oss_presigned", allowedExtensions: [".png"], hasAccessKeySecret: false, hasSecurityToken: false } };
    }
  });
  try {
    await panel(browser.page, "oss-config", "oss");
    const save = browser.page.getByRole("button", { name: "Save OSS config", exact: true });
    await browser.page.getByText("Synthetic configuration read failure", { exact: true }).first().waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.equal(writes, 0);
    const notice = browser.page.getByRole("alertdialog");
    if (await notice.count()) await notice.getByRole("button", { name: "Close", exact: true }).click();
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    await browser.page.locator('input[value="synthetic-bucket"]').waitFor();
    assert.equal(await save.isEnabled(), true);
    assert.equal(reads, 2);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("OCT02 failed notification-template reads offer retry and language switches preserve edits", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/admin/config/notifications") {
      if (method === "PUT") { writes++; return { data: {} }; }
      if (++reads === 1) return { status: 503, error: "Synthetic template read failure" };
      return { data: { templates: [{ code: "fixture_notice", translations: { "zh-CN": { title: "合成通知", body: "合成正文" }, "en-US": { title: "Synthetic notice", body: "Synthetic body" } } }] } };
    }
  });
  try {
    await panel(browser.page, "notification-templates", "notifications");
    await browser.page.getByText("Synthetic template read failure", { exact: true }).waitFor();
    assert.equal(await browser.page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    const notice = browser.page.getByRole("alertdialog");
    if (await notice.count()) await notice.getByRole("button", { name: "Close", exact: true }).click();
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    const title = browser.page.locator('input').filter({ visible: true }).last();
    await title.fill("Unsaved manual notice");
    // Admin replaces SiteHeader, so change the actual preference in another
    // tab. The provider receives the browser's real cookie/storage update.
    const languagePage = await browser.page.context().newPage();
    try {
      await languagePage.goto(`${fixture.origin}/login`);
      await languagePage.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      await languagePage.waitForFunction(() => document.documentElement.lang === "zh-CN");
      await browser.page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    } finally { await languagePage.close(); }
    await browser.page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await title.inputValue(), "Unsaved manual notice");
    assert.equal(reads, 2);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("OCT02 user permission reads must succeed before an empty draft can be saved", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/admin/users") return { data: [{ id: "oct02usr1", username: "Synthetic user", email: "fixture@example.invalid", status: "active", roleCodes: [] }] };
    if (path === "/api/v1/admin/users/oct02usr1/permissions") {
      if (method === "PUT") { writes++; return { data: { ok: true } }; }
      if (++reads === 1) return { status: 503, error: "Synthetic permission read failure" };
      return { data: { roles: [], groupPermissions: [], roleBindings: [], directPermissions: [{ code: "fixture.keep", allow: true, source: "manual", editable: true }], effectivePermissionRules: [] } };
    }
  });
  try {
    await panel(browser.page, "user-roles", "permission");
    await browser.page.getByText("Synthetic permission read failure", { exact: true }).first().waitFor();
    const save = browser.page.getByRole("button", { name: "Save user permissions", exact: true });
    assert.equal(await save.isDisabled(), true);
    assert.equal(writes, 0);
    const notice = browser.page.getByRole("alertdialog");
    if (await notice.count()) await notice.getByRole("button", { name: "Close", exact: true }).click();
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    await browser.page.getByText("fixture.keep", { exact: true }).waitFor();
    assert.equal(await save.isEnabled(), true);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("OCT02 a late local AI completion cannot overwrite manual translations", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (path === "/api/v1/admin/ai/tasks" && method === "POST") {
      const request = JSON.parse(body) as { payload: { items: Array<{ key: string }> } };
      assert.deepEqual(request.payload.items.map((item) => item.key), ["common.copyFailed"]);
      return { data: { id: "oct02tsk1", taskUid: "fixture-task", status: "queued" } };
    }
    if (path === "/api/v1/admin/ai/tasks/oct02tsk1") {
      started.resolve(); await release.promise;
      return { data: { id: "oct02tsk1", status: "completed", result: { items: [{ key: "common.copyFailed", text: "Synthetic AI suggestion" }] } } };
    }
  });
  try {
    await panel(browser.page, "i18n", "system");
    await browser.page.getByRole("combobox", { name: /^Target language/ }).selectOption("fr-FR");
    await browser.page.locator('input[placeholder*="key / text"]').fill("common.copyFailed");
    await browser.page.getByRole("button", { name: "Complete with AI", exact: true }).click();
    await started.promise;
    const target = browser.page.locator("tbody textarea");
    await target.fill("Manual translation written during processing");
    release.resolve();
    await browser.page.getByText("Local text changed while AI was processing. The suggestions were not applied; review your edits before retrying.", { exact: true }).waitFor();
    assert.equal(await target.inputValue(), "Manual translation written during processing");
  } finally { release.resolve(); await browser.close(); }
});

test("OCT02 pending changelog previews are lazy, retry failures and render HTML as inert text", { timeout: 30_000 }, async () => {
  let previews = 0;
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/reviews/content") return { data: { total: 1, facets: { categories: [], operations: [], projectTypes: [] }, items: [{ id: "oct02rev1", source: "revision", aggregateType: "project_changelog", category: "project_changelog", operation: "create", projectType: "mod", projectId: "oct02prj1", modSiteId: "fixture", modName: "Synthetic project", username: "Synthetic contributor", title: "Synthetic pending changelog", summary: "", createdAt: "2026-10-02T00:00:00Z", reviewUrl: "/api/v1/reviews/fixture", reviewerScope: "global" }] } };
    if (path === "/api/v1/content-revisions/oct02rev1") {
      if (++previews === 1) return { status: 503, error: "Synthetic preview read failure" };
      return { data: { id: "oct02rev1", projectId: "oct02prj1", entityType: "project_changelog", status: "pending", snapshot: { eventAt: "2026-10-02T00:00:00Z", minecraftVersions: ["1.21"], projectVersion: "1.0", defaultLocale: "en-US", localizations: [{ locale: "en-US", bodyMarkdown: '<script>window.syntheticXSS=true</script>' }] } } };
    }
  });
  try {
    await panel(browser.page, "reviews-content", "reviews");
    const open = browser.page.getByRole("button", { name: "Read proposed changes", exact: true });
    await open.waitFor();
    assert.equal(previews, 0);
    await open.click();
    await browser.page.getByRole("alert").filter({ hasText: "The proposed revision could not be loaded" }).waitFor();
    const notice = browser.page.getByRole("alertdialog");
    if (await notice.count()) await notice.getByRole("button", { name: "Close", exact: true }).click();
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    await browser.page.locator("pre").filter({ hasText: "window.syntheticXSS=true" }).waitFor();
    assert.equal(await browser.page.evaluate(() => Reflect.get(window, "syntheticXSS")), undefined);
    assert.equal(previews, 2);
  } finally { await browser.close(); }
});

test("OCT02 invalid typed cleanup filters never request previews and changed filters invalidate confirmation", { timeout: 30_000 }, async () => {
  let previews = 0;
  let executions = 0;
  const browser = await fixture.page(({ path, body }) => {
    if (path === "/api/v1/admin/activity") return { data: { items: [] } };
    if (path === "/api/v1/admin/activity-logs/retention") return { data: { config: { enabled: false, runIntervalMinutes: 60, default: { enabled: true, allowDelete: true, retentionDays: 365, batchSize: 1000 }, actions: {} }, actions: ["view"], objectTypes: ["mod"] } };
    if (path === "/api/v1/admin/activity-logs/cleanup/preview") {
      previews++;
      assert.deepEqual(JSON.parse(body).objects, [{ type: "mod", id: "target001" }]);
      return { data: { previewId: "preview01", confirmationToken: "synthetic-confirmation", confirmationText: "DELETE 1", dangerous: false, matchedCount: 1, byAction: { view: 1 }, byObjectType: { mod: 1 }, byUser: {}, samples: [], snapshotBefore: "2026-10-02T00:00:00Z", expiresInSeconds: 300 } };
    }
    if (path === "/api/v1/admin/activity-logs/cleanup/execute") { executions++; return { status: 500, error: "This fixture must not execute cleanup" }; }
  });
  try {
    const { page } = browser;
    await panel(page, "activity-monitor", "monitoring");
    const objects = page.getByRole("textbox", { name: /^Specific objects/ });
    await objects.fill("broken");
    await page.getByRole("button", { name: "Preview cleanup", exact: true }).click();
    await page.getByText("1 object filters are invalid. Use type:ID and correct them before previewing.", { exact: true }).waitFor();
    assert.equal(previews, 0);
    await objects.fill("mod:target001");
    await page.getByRole("button", { name: "Preview cleanup", exact: true }).click();
    await page.getByRole("textbox", { name: "Type DELETE 1 to confirm", exact: true }).fill("DELETE 1");
    assert.equal(await page.getByRole("button", { name: "Delete in batches", exact: true }).isEnabled(), true);
    await objects.fill("mod:another01");
    assert.equal(await page.getByRole("button", { name: "Delete in batches", exact: true }).count(), 0);
    assert.equal(previews, 1);
    assert.equal(executions, 0);
  } finally { await browser.close(); }
});
