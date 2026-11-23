import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

const settingsPath = "/api/v1/admin/server-settings";
const reviewsPath = "/api/v1/admin/server-reviews";
const settings = { maxProofFiles: 5, maxProofTotalBytes: 10 * 1024 * 1024, nameMaxLength: 80, summaryMaxLength: 240, historyDays: 90 };

function actor(...permissions: string[]) {
  return { id: "serverfixture", username: "Synthetic moderator", roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [...permissions, "admin.access"].map(code => ({ code, allow: true, priority: 100 })) };
}

async function openPanel(page: Page, panel: string) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="reviews"]').click();
  await page.locator(`[data-admin-panel="${panel}"]`).click();
}

async function screenshot(page: Page, name: string) {
  const directory = process.env.MCMODS_SERVER_ADMIN_ARTIFACTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
}

test("a configuration reader can view server limits without opening a write", { timeout: 30_000 }, async () => {
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor("admin.config.read") };
    if (path !== settingsPath) return;
    if (method === "GET") return { data: settings };
    writes++;
    return { status: 403, error: "Synthetic read-only configuration" };
  });
  try {
    const { page } = browser;
    await openPanel(page, "server-settings");
    const limit = page.getByRole("spinbutton", { name: "Maximum proof files", exact: true });
    await limit.waitFor();
    await screenshot(page, "server-settings-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "server-settings-mobile");
    assert.equal(await limit.inputValue(), "5");
    assert.equal(await limit.isDisabled(), true);
    await page.getByText("You have read-only access.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("a server settings read failure offers a read-only retry and no empty form", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor("admin.config.read", "admin.config.write") };
    if (path !== settingsPath) return;
    if (method !== "GET") { writes++; return { data: settings }; }
    if (++reads === 1) return { status: 503, error: "Synthetic server settings outage" };
    return { data: settings };
  });
  try {
    const { page } = browser;
    const failedRead = page.waitForResponse(response => new URL(response.url()).pathname === settingsPath && response.status() === 503);
    await openPanel(page, "server-settings");
    await failedRead;
    await page.getByText(/^(Synthetic server settings outage|Unable to load\. Please try again\.|This service is temporarily unavailable\. Try again later\.)$/).waitFor();
    assert.equal(await page.getByRole("spinbutton").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    assert.equal(await retry.count(), 1, "a failed settings read must be retryable from the panel");
    await retry.click();
    const limit = page.getByRole("spinbutton", { name: "Maximum proof files", exact: true });
    await limit.waitFor();
    assert.equal(await limit.inputValue(), "5");
    assert.deepEqual({ reads, writes }, { reads: 2, writes: 0 });
  } finally { await browser.close(); }
});

test("server settings preserve edits across locale changes and freeze a single save", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writes: Array<typeof settings> = [];
  let reads = 0;
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: actor("admin.config.read", "admin.config.write") };
    if (path !== settingsPath) return;
    if (method === "GET") { reads++; return { data: settings }; }
    const submitted = JSON.parse(body) as typeof settings;
    writes.push(submitted);
    started.resolve();
    await release.promise;
    return { data: submitted };
  });
  try {
    const { page } = browser;
    await openPanel(page, "server-settings");
    await page.getByRole("spinbutton", { name: "Maximum proof files", exact: true }).fill("8");
    const preferencesTab = await page.context().newPage();
    try {
      await preferencesTab.goto(`${fixture.origin}/login`);
      await preferencesTab.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      const limit = page.getByRole("spinbutton", { name: "证明附件最大数量", exact: true });
      await limit.waitFor();
      assert.equal(await limit.inputValue(), "8");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await started.promise;
      assert.equal(await limit.isDisabled(), true);
      release.resolve();
      await page.getByText("服务器设置已保存", { exact: true }).waitFor();
      assert.deepEqual(writes, [{ ...settings, maxProofFiles: 8 }]);
      assert.equal(reads, 1);
      assert.equal(await limit.inputValue(), "8");
    } finally { await preferencesTab.close(); }
  } finally { release.resolve(); await browser.close(); }
});

function reviewRow(id: string, name: string, reviewStatus: string) {
  return {
    id, name, address: "play.example.invalid:25565", shortDescription: "Synthetic review data", minecraftVersions: ["1.20.1"],
    languages: ["en-US"], primaryTag: "survival", reviewStatus, reviewNote: "", proofFileCount: 0, linkCount: 0, modCount: 0,
    submitterId: "synthetic01", submitterUsername: "Synthetic submitter", createdAt: "2026-11-23T00:00:00Z",
  };
}

test("a completed review refreshes the currently selected server queue", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const reads: string[] = [];
  let approved = false;
  let writes = 0;
  const browser = await fixture.page(async ({ path, method, url }) => {
    if (path === "/api/v1/auth/me") return { data: actor("server.review") };
    if (path === reviewsPath && method === "GET") {
      const status = url.searchParams.get("status") || "";
      reads.push(status);
      const items = status === "approved"
        ? [reviewRow("existing01", "Previously approved server", "approved"), ...(approved ? [reviewRow("writing001", "First queued review", "approved")] : [])]
        : [...(approved ? [] : [reviewRow("writing001", "First queued review", "pending")]), reviewRow("pending002", "Second queued review", "pending")];
      return { data: { items, hasMore: false, nextCursor: "" } };
    }
    if (path === `${reviewsPath}/writing001` && method === "PATCH") {
      writes++;
      started.resolve();
      await release.promise;
      approved = true;
      return { data: { id: "writing001", reviewStatus: "approved" } };
    }
  });
  try {
    const { page } = browser;
    await openPanel(page, "reviews-server");
    await page.getByRole("article").filter({ hasText: "First queued review" }).getByRole("button", { name: "Approve", exact: true }).click();
    await started.promise;
    const secondDecisionIsDisabled = await page.getByRole("article").filter({ hasText: "Second queued review" }).getByRole("button", { name: "Approve", exact: true }).isDisabled();
    await page.locator("main select").selectOption("approved");
    await page.getByRole("heading", { name: "Previously approved server", exact: true }).waitFor();
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === reviewsPath && response.request().method() === "GET");
    release.resolve();
    const response = await refreshed;
    assert.equal(new URL(response.url()).searchParams.get("status"), "approved");
    assert.equal(secondDecisionIsDisabled, true);
    await page.getByRole("heading", { name: "First queued review", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Second queued review", exact: true }).count(), 0);
    assert.deepEqual(reads, ["pending", "approved", "approved"]);
    assert.equal(writes, 1);
  } finally { release.resolve(); await browser.close(); }
});
