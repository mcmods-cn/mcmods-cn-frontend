import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());

const auth = { allowRegistration: true, emailPasswordLogin: true, usernamePasswordLogin: true, userIDPasswordLogin: true, emailCodeLogin: true, requireEmailVerification: false, passwordMinLength: 8, tokenTTLHours: 24 };
const provider = (clientId: string) => ({ enabled: false, clientId, redirectUri: "", hasClientSecret: true });

// The real backend's PUT merges supplied providers under the settings lock.
// A second administrator changes Google after the first browser reads the form.
test("saving one OAuth provider cannot overwrite a concurrent edit to another", { timeout: 30_000 }, async () => {
  const saved: Record<string, ReturnType<typeof provider>> = Object.fromEntries(["wechat", "qq", "google", "github"].map(key => [key, provider(key)]));
  const bodies: string[][] = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/config/auth") return { data: { auth, oauth: { providers: structuredClone(saved) } } };
    if (path === "/api/v1/admin/config/oauth" && method === "PUT") {
      const payload = JSON.parse(body) as { providers: Record<string, { enabled: boolean; clientId: string; clientSecret: string; redirectUri: string }> };
      bodies.push(Object.keys(payload.providers));
      if (bodies.length === 1) return { status: 503, error: "Synthetic settings write unavailable" };
      for (const [key, value] of Object.entries(payload.providers)) saved[key] = { enabled: value.enabled, clientId: value.clientId, redirectUri: value.redirectUri, hasClientSecret: true };
      return { data: { providers: structuredClone(saved) } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="auth"]').click();
    const github = page.locator('[name="github.clientId"]');
    const secret = page.locator('[name="github.clientSecret"]');
    const google = page.locator('[name="google.clientId"]');
    const save = page.getByRole("button", { name: "Save third-party login config", exact: true });
    await github.fill("edited-github");
    await secret.fill("synthetic-replacement");
    saved.google = provider("changed-by-second-admin");
    await save.click();
    await page.getByText("Synthetic settings write unavailable", { exact: true }).waitFor();
    assert.equal(await secret.inputValue(), "synthetic-replacement", "failed saves retain the pending credential input");
    await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    const accepted = page.waitForResponse(response => response.url().endsWith("/api/v1/admin/config/oauth") && response.status() === 200);
    await save.click();
    await accepted;
    assert.deepEqual(bodies, [["github"], ["github"]], "the server must receive only intentionally edited providers");
    await page.waitForFunction(() => (document.querySelector('[name="github.clientSecret"]') as HTMLInputElement).value === "");
    assert.equal(await github.inputValue(), "edited-github");
    assert.equal(await google.inputValue(), "changed-by-second-admin");
    assert.equal(saved.google.clientId, "changed-by-second-admin");
    assert.equal(await save.isDisabled(), true);
  } finally { await browser.close(); }
});

test("an incomplete OAuth snapshot offers no editable provider or save until a complete read", { timeout: 25_000 }, async () => {
  let reads = 0;
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/admin/config/auth") {
      const keys = ++reads === 1 ? ["github"] : ["wechat", "qq", "google", "github"];
      return { data: { auth, oauth: { providers: Object.fromEntries(keys.map(key => [key, provider(key)])) } } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="auth"]').click();
    const retry = page.getByRole("main").getByRole("alert").getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor();
    assert.equal(await page.locator('[name="google.clientId"]').count(), 0);
    assert.equal(await page.getByRole("button", { name: "Save third-party login config", exact: true }).count(), 0);
    await retry.click();
    await page.locator('[name="google.clientId"]').waitFor();
    assert.equal(reads, 2);
  } finally { await browser.close(); }
});
