import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { type APIHandler, ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());

const auth = { allowRegistration: true, emailPasswordLogin: true, usernamePasswordLogin: true, userIDPasswordLogin: true, emailCodeLogin: true, requireEmailVerification: false, passwordMinLength: 8, tokenTTLHours: 24 };
const provider = (clientId: string) => ({ enabled: false, clientId, redirectUri: "", hasClientSecret: true });

// These are real production pages with a synthetic HTTP implementation of the
// field-wise merge. The backend integration suite exercises the database lock.
// A second administrator changes Google after the first browser reads the form.
test("saving one OAuth provider cannot overwrite a concurrent edit to another", { timeout: 30_000 }, async () => {
  const saved: Record<string, ReturnType<typeof provider>> = Object.fromEntries(["wechat", "qq", "google", "github"].map(key => [key, provider(key)]));
  const bodies: Array<Record<string, unknown>> = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/config/auth") return { data: { auth, oauth: { providers: structuredClone(saved) } } };
    if (path === "/api/v1/admin/config/oauth" && method === "PATCH") {
      const payload = JSON.parse(body) as { providers: Record<string, { enabled?: boolean; clientId?: string; clientSecret?: string; redirectUri?: string }> };
      bodies.push(payload.providers);
      if (bodies.length === 1) return { status: 503, error: "Synthetic settings write unavailable" };
      for (const [key, value] of Object.entries(payload.providers)) {
        const { clientSecret, ...publicFields } = value;
        saved[key] = { ...saved[key], ...publicFields, hasClientSecret: Boolean(clientSecret) || saved[key].hasClientSecret };
      }
      return { data: { providers: structuredClone(saved) } };
    }
  });
  try {
    const { page } = browser;
    await openSettings(page);
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
    const edit = { github: { clientId: "edited-github", clientSecret: "synthetic-replacement" } };
    assert.deepEqual(bodies, [edit, edit], "a retry repeats only the intentional changes");
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


async function openSettings(page: Page) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="system"]').click();
  await page.locator('[data-admin-panel="auth"]').click();
  await page.locator('[name="github.clientId"]').waitFor();
}

async function submitSettings(page: Page) {
  await page.getByRole("button", { name: "Save third-party login config", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
}

test("two administrators can disable a provider, rename its client and replace only its secret without reverting each other", { timeout: 35_000 }, async () => {
  const saved = { wechat: provider("wechat"), qq: provider("qq"), google: provider("google"), github: { ...provider("github"), enabled: true } };
  const writes: Array<{ actor: string; method: string; change: Record<string, unknown> }> = [];
  let patchUnsupported = false;
  const handler = (actor: string): APIHandler => ({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, email: `${actor}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [{ code: "*", allow: true, priority: 100 }] } };
    if (path === "/api/v1/admin/config/auth") return { data: { auth, oauth: { providers: structuredClone(saved) } } };
    if (path !== "/api/v1/admin/config/oauth") return;
    const payload = JSON.parse(body) as { providers: { github: Record<string, unknown> } };
    const change = payload.providers.github;
    writes.push({ actor, method, change });
    if (patchUnsupported || method !== "PATCH") return { status: 405, error: "Synthetic backend does not support field updates" };
    if (typeof change.enabled === "boolean") saved.github.enabled = change.enabled;
    if (typeof change.clientId === "string") saved.github.clientId = change.clientId;
    if (typeof change.redirectUri === "string") saved.github.redirectUri = change.redirectUri;
    if (typeof change.clientSecret === "string") saved.github.hasClientSecret = true;
    return { data: { providers: structuredClone(saved) } };
  };
  const first = await fixture.page(handler("first"));
  const second = await fixture.page(handler("second"));
  try {
    await Promise.all([openSettings(first.page), openSettings(second.page)]);
    const clientId = first.page.locator('[name="github.clientId"]');
    const enabled = first.page.locator('[name="github.enabled"]');
    const secret = first.page.locator('[name="github.clientSecret"]');
    const redirect = first.page.locator('[name="github.redirectUri"]');
    await clientId.fill("edited-client");
    await secret.fill("discarded-draft");
    await secret.fill("   "); // A blank draft must never become a secret-clear request.
    assert.equal(await secret.inputValue(), "");
    await second.page.locator('[name="github.enabled"]').uncheck();
    await submitSettings(second.page);
    await submitSettings(first.page);
    assert.equal(await enabled.isChecked(), false);
    assert.equal(saved.github.enabled, false);
    assert.equal(saved.github.clientId, "edited-client");
    await secret.fill("synthetic-key-only");
    await redirect.fill("https://temporary.example.invalid/callback");
    await redirect.fill(""); // A reverted public edit also drops out of the patch.
    const newRedirect = "https://updated.example.invalid/callback";
    await second.page.locator('[name="github.redirectUri"]').fill(newRedirect);
    await submitSettings(second.page);
    patchUnsupported = true;
    await submitSettings(first.page);
    assert.equal(await secret.inputValue(), "synthetic-key-only", "405 keeps the unsent replacement secret");
    assert.equal(await first.page.getByRole("button", { name: "Save third-party login config", exact: true }).isEnabled(), true);
    patchUnsupported = false;
    await submitSettings(first.page);
    assert.deepEqual(writes, [
      { actor: "second", method: "PATCH", change: { enabled: false } },
      { actor: "first", method: "PATCH", change: { clientId: "edited-client" } },
      { actor: "second", method: "PATCH", change: { redirectUri: newRedirect } },
      { actor: "first", method: "PATCH", change: { clientSecret: "synthetic-key-only" } },
      { actor: "first", method: "PATCH", change: { clientSecret: "synthetic-key-only" } },
    ]);
    assert.equal(await redirect.inputValue(), newRedirect);
    assert.equal(await enabled.isChecked(), false);
    assert.equal(await secret.inputValue(), "");
    assert.equal(await secret.getAttribute("placeholder"), "Saved. Leave blank to keep unchanged.");
  } finally { await Promise.all([first.close(), second.close()]); }
});
