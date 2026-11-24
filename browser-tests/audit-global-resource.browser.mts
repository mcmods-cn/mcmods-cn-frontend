import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const localization = { locale: "en-US", name: "Published manual resource", summary: "Preserved summary", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true };
const document = { publicId: "numeric123", kindCode: "minecraft.item", canonicalId: "audit:manual", defaultLocale: "en-US", publishedRevisionId: "published-baseline", reviewStatus: "approved", localizations: [localization], definition: { maxStackSize: 32 }, iconFileId: "", renderFileId: "" };
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", editableLocales: ["en-US"] } };
  if (path === "/api/v1/content/numeric123") return { data: { publicId: "numeric123", sourceLocale: "en-US", resolvedLocale: "en-US", resolution: "exact", localization, translation: { status: "not_required" } } };
};

test("global resource directory filters the identifier namespace independently of the item registry", async () => {
  const requests: URL[] = [];
  const browser = await fixture.page(request => {
    if (request.path !== "/api/v1/admin/global-resources") return common(request);
    requests.push(request.url);
    const filtered = request.url.searchParams.get("namespace") === "copperworks";
    return { data: {
      items: filtered ? [{ publicId: "copper001", id: "copperworks:plate", kind: "minecraft.item", registry: "items", namespace: "copperworks", name: "Copper plate" }] : [],
      total: filtered ? 1 : 0, limit: 30, offset: 0,
    } };
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin/global-resources");
    const field = page.getByRole("textbox", { name: "Namespace", exact: true });
    await field.fill("copperworks", { timeout: 5000 });
    await field.press("Enter");
    await page.getByText("Copper plate", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("namespace"), "copperworks");
    assert.equal(requests.at(-1)?.searchParams.has("registry"), false);
  } finally { await browser.close(); }
});

test("switching catalog reviewers retires the previous resource list before loading another account", async () => {
  let account = "reviewer";
  let reads = 0;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: {
      id: account, username: account, roleCodes: [], permissionVersion: 1, rbacVersion: 1,
      permissionRules: account === "reviewer" ? [{ code: "global_resource.list", priority: 100, allow: true }] : [],
    } };
    if (request.path === "/api/v1/admin/global-resources") {
      reads++;
      if (account !== "reviewer") return { status: 403, error: "List is unavailable for this account" };
      return { data: { items: [{ publicId: "row000001", id: "fixture:private", namespace: "fixture", kind: "minecraft.item", registry: "items", name: "Synthetic review item" }], total: 1, limit: 36, offset: 0 } };
    }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin/global-resources?status=pending");
    await page.getByText("Synthetic review item", { exact: true }).waitFor();
    account = "regular";
    const refreshedIdentity = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/auth/me");
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:new-account" })));
    assert.equal((await (await refreshedIdentity).json()).data.username, "regular");
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    assert.equal(await page.getByText("Synthetic review item", { exact: true }).count(), 0, "The new user must never see the previous reviewer’s list");
    await page.getByText("Your account does not have permission to perform this action.", { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(reads, 1);
  } finally { await browser.close(); }
});

test("CONT001 global resource form rejects non-object JSON without writing and creates a pending revision", async () => {
  const writes: Record<string, unknown>[] = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/catalog/resources" && request.method === "POST") { writes.push(JSON.parse(request.body)); return { data: { objectPublicId: "numeric123", revisionId: "revision1", changeRequestId: "review1", reviewStatus: "pending" } }; }
    return common(request);
  });
  try {
    const page = browser.page;
    await page.goto(`${fixture.origin}/admin/global-resources?editor=create`);
    await page.getByRole("heading", { name: "Create global resource", exact: true }).waitFor();
    await page.getByLabel("Canonical ID", { exact: true }).fill("audit:manual");
    await page.getByLabel("Localized name", { exact: true }).fill("Ordinary manual resource");
    await page.getByLabel("Resource definition (JSON)", { exact: true }).fill("[]");
    await page.getByRole("button", { name: "Create", exact: true }).first().click();
    await page.getByText("Enter a valid JSON object for the resource definition.", { exact: true }).waitFor();
    assert.equal(writes.length, 0);
    await page.getByLabel("Resource definition (JSON)", { exact: true }).fill(JSON.stringify(document.definition));
    await page.getByRole("button", { name: "Create", exact: true }).first().click();
    await page.getByText("review1", { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].kindCode, "minecraft.item");
    assert.equal(writes[0].canonicalId, "audit:manual");
    assert.deepEqual(writes[0].definition, document.definition);
    assert.equal(Object.hasOwn(writes[0], "baseRevisionId"), false);
    assert.equal(await page.getByRole("button", { name: "Create", exact: true }).first().isDisabled(), true);
  } finally { await browser.close(); }
});

test("an old global editor URL displays a read-only record without a bound version", async () => {
  const writes: string[] = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/admin/global-resources/numeric123/bindings") return { data: { items: [], total: 0, limit: 50, offset: 0 } };
    if (request.path === "/api/v1/catalog/resources/numeric123") {
      if (request.method === "GET") return { data: document };
      writes.push(request.method);
      return { status: 405, error: "Method Not Allowed" };
    }
    return common(request);
  });
  try {
    const page = browser.page;
    await page.goto(`${fixture.origin}/admin/global-resources?editor=edit&publicId=numeric123`);
    await page.getByRole("heading", { name: localization.name, exact: true }).waitFor();
    await page.getByText("Edit resource definitions in a linked mod version.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^(Save|Archive)$/ }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Edit global resource" }).count(), 0);
    assert.deepEqual(writes, []);
  } finally { await browser.close(); }
});

test("an active binding opens its exact project version and incomplete bindings stay text", async () => {
  const writes: string[] = [];
  const binding = { resourceName: "Fixture item", projectId: "project01", projectSiteId: "fixture-mod",
    projectName: "Fixture mod", projectType: "mod", versionId: "version02", versionLabel: "Fixture version two",
    minecraftVersions: ["1.20.1"], status: "active" };
  const resourcePath = "/api/v1/mods/fixture-mod/content-resources/numeric123";
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/admin/global-resources/numeric123/bindings") return { data: { total: 2, limit: 50, offset: 0, items: [
      binding, { ...binding, projectId: "project02", projectSiteId: "", versionLabel: "Unknown project" },
    ] } };
    if (request.path === "/api/v1/catalog/resources/numeric123") {
      if (request.method === "GET") return { data: document };
      writes.push(request.method);
      return { status: 405, error: "Method Not Allowed" };
    }
    if (request.path === resourcePath) return { data: {
      publicId: document.publicId, canonicalId: document.canonicalId, kindCode: document.kindCode,
      versions: [{ publicId: "version01", label: "First version", hasDetail: false }, { publicId: binding.versionId, label: binding.versionLabel, hasDetail: false }],
      details: [], capabilities: { editResource: false },
    } };
    if (request.path === resourcePath + "/similar") return { data: { items: [] } };
    if (request.path.startsWith("/api/v1/content-metrics/numeric123")) return { status: 404, error: "No metrics in this fixture" };
    return common(request);
  });
  try {
    const page = browser.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.origin}/admin/global-resources?publicId=numeric123`);
    await page.getByRole("heading", { name: localization.name, exact: true }).waitFor();
    const version = page.getByRole("link", { name: binding.versionLabel, exact: true });
    await version.waitFor();
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth), 390);
    assert.equal(await version.getAttribute("href"), "/mods/fixture-mod/resources/numeric123?version=version02");
    assert.equal(await page.getByRole("link", { name: "Unknown project", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Edit global resource" }).count(), 0);
    await version.click();
    await page.waitForURL("**/mods/fixture-mod/resources/numeric123?version=version02");
    await page.getByRole("heading", { name: binding.versionLabel, exact: true }).waitFor();
    assert.deepEqual(writes, []);
  } finally { await browser.close(); }
});

for (const explicitDeny of [false, true]) test(`Global resource ordinary read avoids privileged bindings (explicit deny=${explicitDeny})`, async () => {
  let bindingReads = 0;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: { id: "reader1", username: "Ordinary reader", permissionRules: explicitDeny ? [{ code: "global_resource.*", allow: true, priority: 1 }, { code: "global_resource.binding.view", allow: false, priority: 2 }] : [{ code: "global_resource.view", allow: true, priority: 1 }] } };
    if (request.path === "/api/v1/catalog/resources/numeric123") return { data: document };
    if (request.path.endsWith("/bindings")) { bindingReads++; return { status: 403, error: "Must not request privileged bindings" }; }
    return common(request);
  });
  try {
    await browser.page.goto(`${fixture.origin}/admin/global-resources?publicId=numeric123`);
    await browser.page.getByRole("heading", { name: "Published manual resource", exact: true }).waitFor();
    await browser.page.getByText("Preserved summary", { exact: true }).waitFor();
    assert.equal(await browser.page.getByText("绑定的普通资源", { exact: true }).count(), 0);
    assert.equal(await browser.page.getByRole("link", { name: "Edit global resource", exact: true }).count(), 0);
    assert.equal(bindingReads, 0);
  } finally { await browser.close(); }
});
