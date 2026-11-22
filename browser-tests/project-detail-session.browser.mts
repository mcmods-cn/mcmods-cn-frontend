import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

const pendingSlug = "synthetic-pending-mod";
const publicSlug = "synthetic-published-mod";
const pendingTitle = "Synthetic pending mod";
const publicTitle = "Synthetic published mod";
const pendingBody = "Introduction visible to the synthetic submitter";
const publicBody = "Published introduction in the default language";

function syntheticMod(pending: boolean) {
  return {
    uniqueId: pending ? "r3pendingmod" : "r3publicmod",
    siteId: pending ? pendingSlug : publicSlug,
    primaryName: pending ? pendingTitle : publicTitle,
    abbreviation: "R3",
    summary: "Synthetic project summary",
    bodyMarkdown: pending ? pendingBody : publicBody,
    reviewStatus: pending ? "pending" : "approved",
    primaryCategory: "utility",
    environment: "bothRequired",
    officialStatus: "active",
    sourceStatus: "open",
    updatedAt: "2026-11-22T12:00:00Z",
    compatibilities: [],
    modIds: [],
    galleryImages: [],
    searchKeywords: [],
    tags: [],
    authors: [],
    relationshipGroups: [],
  };
}

function syntheticActor(id: string) {
  return { id, username: id, email: `${id}@example.invalid`, roleCodes: [], permissionRules: [] };
}

const supportEndpoints: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/projects/r3pendingmod/follow") return { data: { followed: false } };
  if (path.startsWith("/api/v1/content-metrics/") || path.startsWith("/api/v1/ratings/mod/")) {
    return { status: 404, error: "No synthetic metrics" };
  }
  if (/^\/api\/v1\/comment-targets\/mod\/r3(?:pending|public)mod\/comments$/.test(path)) {
    return { data: { capabilities: { canCreate: false }, items: [], total: 0 } };
  }
  if (path === "/api/v1/content/r3pendingmod" || path === "/api/v1/content/r3publicmod") {
    return { status: 404, error: "No separate synthetic localization" };
  }
};

test("the mod detail drops pending data before a different account resolves", { timeout: 25_000 }, async () => {
  const verifyingNextActor = Promise.withResolvers<void>();
  const finishVerification = Promise.withResolvers<void>();
  let submitter = true;
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/auth/me") {
      if (!submitter) { verifyingNextActor.resolve(); await finishVerification.promise; }
      return { data: syntheticActor(submitter ? "actorA" : "actorB") };
    }
    if (request.path === `/api/v1/mods/${pendingSlug}`) {
      return submitter ? { data: syntheticMod(true) } : { status: 404, error: "Synthetic pending project unavailable" };
    }
    return supportEndpoints(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/${pendingSlug}`);
    await page.getByRole("heading", { name: new RegExp(pendingTitle) }).waitFor();
    await page.getByText(pendingBody, { exact: true }).waitFor();

    submitter = false;
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actorB" })));
    await verifyingNextActor.promise;
    await page.locator('a[title="actorA"]').waitFor({ state: "detached" });
    assert.equal(await page.getByRole("heading", { name: new RegExp(pendingTitle) }).count(), 0, "clear the previous account's pending project during verification");
    assert.equal(await page.getByText(pendingBody, { exact: true }).count(), 0);

    finishVerification.resolve();
    await page.locator('a[title="actorB"]').waitFor();
    await page.getByRole("heading", { name: "This mod could not be found" }).waitFor();
    assert.equal(await page.getByText(pendingBody, { exact: true }).count(), 0);
  } finally {
    finishVerification.resolve();
    await browser.close();
  }
});

test("guests keep the published project, tab history and language fallback", { timeout: 25_000 }, async () => {
  const localeFailure = Promise.withResolvers<void>();
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { status: 401, error: "Guest" };
    if (request.path === `/api/v1/mods/${publicSlug}`) return { data: syntheticMod(false) };
    if (request.path === "/api/v1/content/r3publicmod" && request.url.searchParams.get("locale") === "fr-FR") {
      localeFailure.resolve();
      return { status: 503, error: "Synthetic translation lookup unavailable" };
    }
    return supportEndpoints(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/${publicSlug}`);
    await page.getByRole("heading", { name: new RegExp(publicTitle) }).waitFor();
    await page.getByText(publicBody, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Mod relationships", exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("tab") === "relationships");
    await page.getByText("No mod relationships have been added.", { exact: true }).waitFor();
    await page.goBack();
    await page.waitForURL(url => !url.searchParams.has("tab"));
    await page.getByText(publicBody, { exact: true }).waitFor();

    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fr-FR");
    await localeFailure.promise;
    await page.getByText(publicBody, { exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "fr-FR");
  } finally {
    await browser.close();
  }
});
