import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("An explicit Mod retry waits for fresh optional form metadata after a failed write", { timeout: 30_000 }, async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let reads = 0;
  const forms: string[] = [];
  const browser = await fixture.page(async ({ path, method, headers }) => {
    if (path === "/api/v1/anti-abuse/form-token") {
      const number = ++reads;
      if (number === 2) {
        started.resolve();
        await pending.promise;
      }
      if (number > 2) return { status: 503, error: "Optional form metadata temporarily unavailable" };
      return { data: { token: `form-${number}`, fieldName: `contact-${number}`, expiresAt: "2099-01-01T00:00:00Z" } };
    }
    if (path === "/api/v1/mods" && method === "POST") {
      forms.push(headers["x-anti-abuse-form"] || "");
      return { status: 503, error: `Write unavailable ${forms.length}` };
    }
    if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
    if (path === "/api/v1/creator-roles") return { data: { items: [] } };
    if (path === "/api/v1/markdown/config") return { data: {} };
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/users/me/drafts") return { data: { items: [] } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/new`);
    await page.locator('input[name="contact-1"]').waitFor({ state: "attached" });
    await page.getByRole("textbox", { name: /^Mod site ID/ }).fill("metadata-example");
    const name = page.getByRole("textbox", { name: /^Primary name/ });
    await name.fill("Example Mod");
    await page.getByRole("textbox", { name: "Mod ID", exact: true }).fill("metadata_example");
    const submit = page.locator('main form button[type="submit"]').first();
    await submit.click();
    await page.getByText("Write unavailable 1", { exact: true }).waitFor();
    await started.promise;
    await submit.click();
    pending.resolve();
    await page.getByText("Write unavailable 2", { exact: true }).waitFor();
    await submit.click();
    await page.getByText("Write unavailable 3", { exact: true }).waitFor();
    assert.deepEqual(forms, ["form-1", "form-2", ""]);
    assert.equal(await name.inputValue(), "Example Mod");
  } finally {
    pending.resolve();
    await browser.close();
  }
});
