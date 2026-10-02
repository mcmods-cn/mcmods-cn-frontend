import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const eligible = { id: "1", task_uid: "task00001", task_type: "i18n_translation", status: "queued", delivery_failure: { deadLetterId: "9007199254740993", stage: "publish", retryable: true } };
const consumer = { ...eligible, id: "2", task_uid: "task00002", status: "failed" };
const retrying = { ...eligible, id: "3", task_uid: "task00003", status: "retrying" };
const disabledAIConfig = { providers: [], models: [], taskModels: [], quotas: [], translation: { enabled: false, sourceLocale: "en-US", targetLocales: [], taskType: "translation", autoSubmit: false, glossary: "" } };
function actor(enqueue: boolean) {
  return { id: "aitaskusr", username: "Synthetic AI reviewer", email: "ai@example.invalid", roleCodes: [], permissionVersion: 1, rbacVersion: 1,
    permissionRules: [{ code: "admin.access", allow: true, priority: 100 }, { code: "ai.read", allow: true, priority: 100 }, { code: "ai.task.enqueue", allow: enqueue, priority: 100 }] };
}
// Actual production React; all project API and AI boundaries are controlled.
// No real provider request, money, database write or authentication claim.
test("OCT02 publisher delivery retry preserves failed rows, serializes clicks and separates queued success from refresh failure", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<APIReply>();
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor(true) };
    if (path === "/api/v1/admin/ai/config" && method === "GET") return { data: disabledAIConfig };
    if (path === "/api/v1/admin/ai/tasks" && method === "GET") {
      if (++reads === 2) return { status: 503, code: "HTTP_503", error: "Synthetic task refresh unavailable" };
      return { data: [reads >= 4 ? { ...eligible, delivery_failure: { ...eligible.delivery_failure, deadLetterId: "9007199254740994" } } : reads >= 3 ? { ...eligible, delivery_failure: null } : eligible, consumer, retrying] };
    }
    if (path === "/api/v1/admin/ai/tasks/task00001/retry-delivery" && method === "POST") {
      if (++writes === 1) { started.resolve(); return held.promise; }
      return { status: 202, data: { id: "task00001", status: "queued", deliveryQueued: true, eventId: "delivery0001" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="ai"]').click();
    await page.locator('[data-admin-panel="ai-task-logs"]').click();
    const action = page.getByRole("button", { name: "Retry delivery", exact: true });
    await action.waitFor();
    assert.equal(await action.count(), 1, "consumer failed and retrying tasks have no recovery action");
    await action.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(writes, 1);
    assert.equal(await page.getByRole("row").filter({ hasText: "task00001" }).getByRole("button").isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Create test task", exact: true }).isDisabled(), true);
    held.resolve({ status: 503, code: "HTTP_503", error: "Synthetic delivery unavailable" });
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find((node) => node.textContent === "Retry delivery")?.disabled);
    assert.equal(await page.getByText("task00001", { exact: true }).count(), 1);
    await action.click();
    await page.getByRole("status").filter({ hasText: "Delivery was queued, but status could not be refreshed" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Retry delivery", exact: true }).count(), 0);
    assert.equal(writes, 2);
    assert.equal(reads, 2);
    await page.getByRole("button", { name: "Query logs", exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find((node) => node.textContent === "Query logs")?.disabled);
    assert.equal(reads, 3);
    assert.equal(writes, 2);
    const languagePage = await page.context().newPage();
    try {
      await languagePage.goto(`${fixture.origin}/login`);
      await languagePage.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      await languagePage.waitForFunction(() => document.documentElement.lang === "zh-CN");
      await page.getByRole("columnheader", { name: "投递", exact: true }).waitFor();
    }
    finally { await languagePage.close(); }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("columnheader", { name: "投递", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "重试投递", exact: true }).count(), 0);
    assert.equal(writes, 2);
    await page.getByRole("button", { name: "查询日志", exact: true }).click();
    await page.getByRole("button", { name: "重试投递", exact: true }).waitFor();
    assert.equal(reads, 4, "a new publisher dead-letter identity makes recovery available again");
    assert.equal(writes, 2, "loading a new failure never automatically retries delivery");
  } finally { held.resolve({ status: 503, error: "Synthetic fixture stopped" }); await browser.close(); }
});

test("OCT02 read-only AI reviewers see delivery failure but cannot retry or enqueue a test task", { timeout: 30_000 }, async () => {
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor(false) };
    if (path === "/api/v1/admin/ai/config" && method === "GET") return { data: disabledAIConfig };
    if (path === "/api/v1/admin/ai/tasks" && method === "GET") return { data: [eligible, consumer] };
    if (path.startsWith("/api/v1/admin/ai/tasks") && method === "POST") { writes++; return { status: 403, error: "This fixture must not mutate" }; }
  });
  try {
    await browser.page.goto(`${fixture.origin}/admin`);
    await browser.page.locator('[data-admin-group="ai"]').click();
    await browser.page.locator('[data-admin-panel="ai-task-logs"]').click();
    await browser.page.getByText("Delivery failed", { exact: true }).first().waitFor();
    assert.equal(await browser.page.getByRole("button", { name: "Retry delivery", exact: true }).count(), 0);
    assert.equal(await browser.page.getByRole("button", { name: "Create test task", exact: true }).count(), 0);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});
