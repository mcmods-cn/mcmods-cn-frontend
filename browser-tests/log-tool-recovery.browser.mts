import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const stamp = "2026-10-02T00:00:00Z";
const emptyHistory = { items: [], total: 0, limit: 30, offset: 0 };
const actor = (id: string) => ({ id, username: id, email: `${id}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] });

// Production React UI with explicit HTTP fixtures. Backend persistence and
// redaction quality are established by their separate real PostgreSQL tests.
test("OCT02 log save preserves new input and a history failure cannot become a failed save", { timeout: 30_000 }, async () => {
  const posted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<APIReply>();
  let creates = 0;
  let reads = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: actor("log-actor-a") };
    if (path === "/api/v1/log-shares/me") {
      if (++reads === 2) return { status: 503, error: "Synthetic history refresh unavailable" };
      return { data: emptyHistory };
    }
    if (path === "/api/v1/log-shares/paste" && method === "POST") {
      creates++;
      assert.equal(JSON.parse(body).content, "Original synthetic log");
      posted.resolve();
      return release.promise;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/logs`);
    await page.locator('a[title="log-actor-a"]').waitFor();
    const content = page.getByRole("textbox", { name: /Log content|日志内容/ });
    await content.fill("Original synthetic log");
    await page.getByRole("button", { name: /Redact and save|脱敏并保存/ }).click();
    await posted.promise;
    await content.fill("New synthetic input while saving");
    release.resolve({ data: { publicCode: "oct02lg01", url: "/log/s/oct02lg01", status: "ready", expiresAt: stamp, redactionVersion: 2, redactionCounts: {}, entryCount: 1 } });
    await page.getByRole("link", { name: /Check redacted preview|检查脱敏预览/ }).waitFor();
    assert.equal(await content.inputValue(), "New synthetic input while saving");
    const historyFailure = page.getByRole("alert").filter({ hasText: "Unable to load your share history." });
    await historyFailure.waitFor();
    assert.equal(await historyFailure.textContent(), "Unable to load your share history.");
    assert.doesNotMatch(await page.getByRole("status").last().textContent() ?? "", /Synthetic history refresh unavailable/);
    if (await page.getByRole("alertdialog").count()) await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("No log shares yet.", { exact: true }).waitFor();
    assert.equal(creates, 1);
    assert.equal(reads, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("header details summary").click();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await content.inputValue(), "New synthetic input while saving");
    assert.equal(creates, 1);
  } finally { release.resolve({ data: {} }); await browser.close(); }
});

test("OCT02 log history clears on a cookie-session account change before the new history returns", { timeout: 30_000 }, async () => {
  let account = "log-actor-a";
  const changed = Promise.withResolvers<void>();
  const newHistory = Promise.withResolvers<APIReply>();
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: actor(account) };
    if (path === "/api/v1/log-shares/me") {
      if (account === "log-actor-b") { changed.resolve(); return newHistory.promise; }
      return { data: { ...emptyHistory, total: 1, items: [{ public_code: "oct02lg01", source_type: "paste", title: "Actor A private log title", status: "ready", redaction_version: 2, created_at: stamp, expires_at: stamp }] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/logs`);
    await page.getByText("Actor A private log title", { exact: true }).waitFor();
    account = "log-actor-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:log-actor-b" })));
    await page.locator('a[title="log-actor-b"]').waitFor();
    assert.equal(await page.getByText("Actor A private log title", { exact: true }).count(), 0);
    await changed.promise;
    newHistory.resolve({ data: emptyHistory });
    await page.getByText("No log shares yet.", { exact: true }).waitFor();
  } finally { newHistory.resolve({ data: emptyHistory }); await browser.close(); }
});
