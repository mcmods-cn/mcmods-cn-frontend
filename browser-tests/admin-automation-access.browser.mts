import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

function actor(permissions: string[]) {
  return { id: "settings01", username: "Settings reviewer", roleCodes: [], permissionVersion: 1, rbacVersion: 1,
    permissionRules: ["admin.access", ...permissions].map(code => ({ code, allow: true, priority: 1 })) };
}

test("Minecraft version readers can inspect settings, while writers can save and synchronize versions", { timeout: 30_000 }, async () => {
  for (const canWrite of [false, true]) {
    const writes: Array<{ method: string; body: unknown }> = [];
    let config = { versions: [{ code: "1.20.1", type: "release" }], loaders: [{ code: "Fabric", name: "Fabric", versions: ["1.20.1"] }] };
    const browser = await fixture.page(({ path, method, body }) => {
      if (path === "/api/v1/auth/me") return { data: actor(["admin.config.read", ...(canWrite ? ["admin.config.write"] : [])]) };
      if (path === "/api/v1/minecraft/versions") return { data: config };
      if (path === "/api/v1/admin/config/minecraft-versions" && method === "PUT") {
        config = JSON.parse(body);
        writes.push({ method, body: config });
        return { data: config };
      }
      if (path === "/api/v1/admin/config/minecraft-versions/sync" && method === "POST") {
        writes.push({ method, body });
        return { data: config };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/admin`);
      await page.locator('[data-admin-group="system"]').click();
      await page.locator('[data-admin-panel="minecraft-versions"]').click();
      const versionInput = page.getByPlaceholder("1.21.1");
      await versionInput.waitFor();
      const save = page.getByRole("button", { name: "Save", exact: true });
      const sync = page.getByRole("button", { name: "Sync Minecraft and loader versions", exact: true });
      if (!canWrite) {
        assert.equal(await versionInput.isDisabled(), true);
        assert.equal(await save.count(), 0);
        assert.equal(await sync.count(), 0);
        assert.deepEqual(writes, []);
        continue;
      }
      await versionInput.fill("1.20.4");
      const versions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Minecraft versions", exact: true }) }).last();
      await versions.getByRole("button", { name: /Create/ }).click();
      await save.click();
      await page.getByText("Minecraft version settings saved.", { exact: true }).waitFor();
      await sync.click();
      await page.getByText("Minecraft and mod loader versions synchronized.", { exact: true }).waitFor();
      assert.deepEqual(writes.map(item => item.method), ["PUT", "POST"]);
      assert.deepEqual(config.versions.map(version => version.code), ["1.20.1", "1.20.4"]);
    } finally { await browser.close(); }
  }
});

test("seed crawler reading, configuring, and running remain separate capabilities", { timeout: 30_000 }, async () => {
  for (const [canWrite, canRun] of [[false, false], [true, false], [false, true]]) {
    const writes: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
    let config = { enabled: false, projectTypes: ["mod"], batchSize: 10, dailyLimit: 25, minimumDownloads: 100,
      intervalSeconds: 3600, maxConcurrency: 1, aiDailyTokenBudget: 0, autoSubmitReview: false };
    let configReads = 0;
    const list = { items: [], limit: 30, hasMore: false, nextCursor: "" };
    const browser = await fixture.page(({ path, method, body }) => {
      if (path === "/api/v1/auth/me") return { data: actor(["seed_crawler.view", ...(canWrite ? ["seed_crawler.configure"] : []), ...(canRun ? ["seed_crawler.run"] : [])]) };
      if (path === "/api/v1/admin/seed-crawler" && method === "GET") { configReads++; return { data: { config } }; }
      if (path === "/api/v1/admin/seed-crawler/candidates" || path === "/api/v1/admin/seed-crawler/runs" && method === "GET") return { data: list };
      if (path === "/api/v1/admin/seed-crawler" && method === "PUT" || path === "/api/v1/admin/seed-crawler/runs" && method === "POST") {
        const payload = JSON.parse(body);
        writes.push({ path, method, body: payload });
        if (method === "PUT") { config = payload; return { data: { config } }; }
        return { data: {} };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/admin`);
      await page.locator('[data-admin-group="automation"]').click();
      await page.locator('[data-admin-panel="seed-crawler"]').click();
      const limit = page.getByRole("spinbutton", { name: "Daily project limit", exact: true });
      await limit.waitFor();
      assert.equal(await limit.isDisabled(), !canWrite);
      const save = page.getByRole("button", { name: "Save", exact: true });
      const dry = page.getByRole("button", { name: "Dry run", exact: true });
      const run = page.getByRole("button", { name: "Run now", exact: true });
      assert.equal(await save.count(), Number(canWrite));
      assert.equal(await dry.count(), Number(canRun));
      assert.equal(await run.count(), Number(canRun));
      if (canWrite) {
        const initialReads = configReads;
        for (const invalid of ["0", "1001", "1.5", ""]) {
          await limit.fill(invalid);
          await save.click();
          assert.equal(await limit.evaluate(input => (input as HTMLInputElement).validity.valid), false);
          assert.equal(writes.length, 0);
        }
        await limit.fill("31");
        const saved = page.waitForResponse(response => response.url().endsWith("/admin/seed-crawler") && response.request().method() === "PUT");
        await save.click();
        assert.equal((await saved).ok(), true);
        await page.getByText("Saved.", { exact: true }).waitFor();
        assert.equal(configReads, initialReads, "PUT returns the authoritative crawler configuration");
        assert.deepEqual(writes.map(({ method, body }) => [method, body.dailyLimit]), [["PUT", 31]]);
      } else if (canRun) {
        const queued = page.waitForResponse(response => response.url().endsWith("/admin/seed-crawler/runs") && response.request().method() === "POST");
        await dry.click();
        assert.equal((await queued).ok(), true);
        assert.deepEqual(writes.map(({ method, body }) => [method, body.dryRun]), [["POST", true]]);
      } else assert.deepEqual(writes, []);
    } finally { await browser.close(); }
  }
});

test("crawler candidate details follow the last selection and explain an unavailable counted draft", async () => {
  const firstRead = Promise.withResolvers<void>();
  const older = Promise.withResolvers<void>();
  const candidates = [
    { externalProjectId: "first", status: "existing" },
    { externalProjectId: "second", status: "draft_unavailable" },
  ];
  const list = { items: [], limit: 30, hasMore: false, nextCursor: "" };
  const browser = await fixture.page(async ({ path }) => {
    const base = "/api/v1/admin/seed-crawler";
    if (path === "/api/v1/auth/me") return { data: actor(["seed_crawler.view"]) };
    if (path === base) return { data: { config: { enabled: false, projectTypes: ["mod"], batchSize: 1, dailyLimit: 1, minimumDownloads: 0, intervalSeconds: 60, maxConcurrency: 1, aiDailyTokenBudget: 0, autoSubmitReview: false } } };
    if (path === `${base}/runs`) return { data: list };
    if (path === `${base}/candidates`) return { data: { ...list, items: candidates } };
    if (path === `${base}/candidates/first`) { firstRead.resolve(); await older.promise; return { data: candidates[0] }; }
    if (path === `${base}/candidates/second`) return { data: candidates[1] };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="automation"]').click();
    await page.locator('[data-admin-panel="seed-crawler"]').click();
    const detailButton = (id: string) => page.getByRole("row").filter({ has: page.getByRole("cell", { name: id, exact: true }) }).getByRole("button");
    await detailButton("first").click();
    await firstRead.promise;
    const stalePath = (request: { url(): string }) => new URL(request.url()).pathname.endsWith("/candidates/first");
    const staleRequestEnded = Promise.race([page.waitForEvent("requestfailed", stalePath), page.waitForEvent("requestfinished", stalePath)]);
    await detailButton("second").click();
    const heading = page.getByRole("heading", { name: "Candidate details · second" });
    await heading.waitFor();
    older.resolve();
    await staleRequestEnded;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.getByRole("cell", { name: "Draft unavailable", exact: true }).waitFor();
    await page.getByText(/The counted draft expired or was deleted/).waitFor();
    assert.equal(await heading.isVisible(), true);
  } finally { older.resolve(); await browser.close(); }
});
