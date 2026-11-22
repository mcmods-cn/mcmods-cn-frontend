import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

const pagePath = "/mods/fixture-mod/resources/resource01?version=version01";
const detailPath = "/api/v1/mods/fixture-mod/content-resources/resource01";
const entryPath = "/api/v1/export-revisions/revision01/entry-detail";
const ownerTitle = "Synthetic pending resource title";
const publicTitle = "Synthetic published resource title";

function resourceDetail(owner: boolean) {
  const name = owner ? ownerTitle : publicTitle;
  return {
    entityId: "resource01", publicId: "resource01", kindCode: "minecraft.item", canonicalId: "fixture:item",
    capabilities: { editResource: owner },
    versions: [{ publicId: "version01", label: "1.0", status: "active", registry: "items", revisionId: "revision01", hasDetail: true }],
    details: [{
      versionPublicId: "version01", entryTypeCode: "item", definitionSchemaVersion: 1,
      defaultLocale: "en-US", definition: {}, status: owner ? "pending" : "active",
      localizations: [{ locale: "en-US", name, summary: "", contentMarkdown: `Introduction for ${name}` }],
    }],
  };
}

function entryDetail(owner: boolean) {
  const type = owner ? "Synthetic pending recipe" : "Synthetic published recipe";
  return { data: { recipes: [{ id: "fixture:recipe", type }], uses: [], modelAvailable: false, modelAssetPaths: [] } };
}

const publicEndpoints: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === `${detailPath}/similar`) return { data: { items: [], groupId: "" } };
  if (path.startsWith("/api/v1/content-metrics/resource01")) return { status: 404, error: "No synthetic metrics" };
  if (path === "/api/v1/comment-targets/mod_resource/resource01~version01/comments") {
    return { data: { capabilities: { canCreate: false }, items: [], total: 0 } };
  }
};

test("versioned resource detail drops the previous account's title, actions and pending recipe request", { timeout: 25_000 }, async () => {
  const ownerEntryStarted = Promise.withResolvers<void>();
  const finishOwnerEntry = Promise.withResolvers<void>();
  const verifyingNextActor = Promise.withResolvers<void>();
  const finishVerification = Promise.withResolvers<void>();
  let owner = true;
  const browser = await fixture.page(async request => {
    const { path } = request;
    if (path === "/api/v1/auth/me") {
      if (!owner) { verifyingNextActor.resolve(); await finishVerification.promise; }
      const id = owner ? "actorA" : "actorB";
      return { data: { id, username: id, email: `${id}@example.invalid`, roleCodes: [], permissionRules: [] } };
    }
    if (path === detailPath) return { data: resourceDetail(owner) };
    if (path === entryPath) {
      const requestedByOwner = owner;
      if (requestedByOwner) { ownerEntryStarted.resolve(); await finishOwnerEntry.promise; }
      return entryDetail(requestedByOwner);
    }
    return publicEndpoints(request);
  });
  try {
    const { page } = browser;
    const oldEntryAborted = page.waitForEvent("requestfailed", request => new URL(request.url()).pathname === entryPath);
    // The red run can stop at the stale-title assertion before the request is canceled.
    void oldEntryAborted.catch(() => undefined);
    await page.goto(`${fixture.origin}${pagePath}`);
    await page.getByRole("heading", { name: ownerTitle }).waitFor();
    await page.getByText(`Introduction for ${ownerTitle}`).waitFor();
    const edit = page.getByRole("link", { name: "Edit", exact: true });
    await edit.waitFor();
    assert.match((await edit.getAttribute("href")) || "", /\/resource01\/edit\?version=version01/);
    await ownerEntryStarted.promise;

    owner = false;
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actorB" })));
    await verifyingNextActor.promise;
    await page.locator('a[title="actorA"]').waitFor({ state: "detached" });
    assert.equal(await page.getByRole("heading", { name: ownerTitle }).count(), 0, "hide the previous account's pending title during verification");
    assert.equal(await page.getByText(`Introduction for ${ownerTitle}`).count(), 0);
    assert.equal(await edit.count(), 0);
    const interrupted = await oldEntryAborted;
    assert.equal(interrupted.failure()?.errorText, "net::ERR_ABORTED");

    finishVerification.resolve();
    await page.locator('a[title="actorB"]').waitFor();
    await page.getByRole("heading", { name: publicTitle }).waitFor();
    await page.getByText("Synthetic published recipe", { exact: true }).first().waitFor();
    finishOwnerEntry.resolve();
    assert.equal(await page.getByText("Synthetic pending recipe", { exact: true }).count(), 0);
    assert.equal(await edit.count(), 0);
  } finally {
    finishVerification.resolve();
    finishOwnerEntry.resolve();
    await browser.close();
  }
});

test("the current published resource and recipe are still available to guests", async () => {
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { status: 401, error: "Guest" };
    if (request.path === detailPath) return { data: resourceDetail(false) };
    if (request.path === entryPath) return entryDetail(false);
    return publicEndpoints(request);
  });
  try {
    await browser.page.goto(`${fixture.origin}${pagePath}`);
    await browser.page.getByRole("heading", { name: publicTitle }).waitFor();
    await browser.page.getByText("Synthetic published recipe", { exact: true }).first().waitFor();
    assert.equal(await browser.page.getByRole("link", { name: "Edit", exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});
