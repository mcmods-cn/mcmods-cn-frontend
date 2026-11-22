import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

test("the blueprint library discards private cards while resolving the next account", { timeout: 25_000 }, async () => {
  const verifyingNextActor = Promise.withResolvers<void>();
  const finishVerification = Promise.withResolvers<void>();
  let owner = true;
  const privateTitle = "Synthetic owner-only blueprint";
  const publicBlueprint = {
    id: "synthbp02", title: "Public blueprint", description: "Synthetic public example", sourceFormat: "nbt",
    status: "ready", size: [1, 1, 1], blockCount: 1, paletteCount: 1,
    uploader: { id: "actorA", username: "actorA" }, requiredMods: [],
  };
  // The current backend list can include otherwise-unpublished cards for the
  // owner. These are synthetic response bodies; the page and auth are real.
  const browser = await fixture.page(async ({ path }) => {
    if (path === "/api/v1/auth/me") {
      if (!owner) { verifyingNextActor.resolve(); await finishVerification.promise; }
      const id = owner ? "actorA" : "actorB";
      return { data: { id, username: id, email: `${id}@example.invalid`, roleCodes: [], permissionRules: [] } };
    }
    if (path === "/api/v1/blueprints") {
      const privateBlueprint = { ...publicBlueprint, id: "synthbp01", title: privateTitle, description: "Synthetic owner's draft" };
      return { data: { items: owner ? [privateBlueprint, publicBlueprint] : [publicBlueprint], hasMore: false, nextCursor: "" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/blueprints`);
    await page.getByRole("heading", { name: privateTitle }).waitFor();
    owner = false;
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actorB" })));
    await verifyingNextActor.promise;
    await page.locator('a[title="actorA"]').waitFor({ state: "detached" });
    assert.equal(await page.getByRole("heading", { name: privateTitle }).count(), 0);
    finishVerification.resolve();
    await page.locator('a[title="actorB"]').waitFor();
    await page.getByRole("heading", { name: publicBlueprint.title }).waitFor();
    assert.equal(await page.getByRole("heading", { name: privateTitle }).count(), 0);
  } finally { finishVerification.resolve(); await browser.close(); }
});
