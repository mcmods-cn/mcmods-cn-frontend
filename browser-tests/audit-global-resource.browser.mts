import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const localization = { locale: "en-US", name: "Published manual resource", summary: "Preserved summary", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true };
const document = { publicId: "numeric123", kindCode: "minecraft.item", canonicalId: "audit:manual", defaultLocale: "en-US", publishedRevisionId: "published-baseline", reviewStatus: "approved", localizations: [localization], definition: { stackSize: 32, auditExtension: { registeredValue: "keep" } }, iconFileId: "", renderFileId: "" };
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", editableLocales: ["en-US"] } };
  if (path === "/api/v1/content/numeric123") return { data: { publicId: "numeric123", sourceLocale: "en-US", resolvedLocale: "en-US", resolution: "exact", localization, translation: { status: "not_required" } } };
};

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
    await page.getByLabel("Resource definition (JSON)", { exact: true }).fill('{"stackSize":32,"auditExtension":{"registeredValue":"keep"}}');
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

test("CONT001 global resource edit preserves technical fields and submits the published baseline", async () => {
  let write: Record<string, unknown> | undefined;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/catalog/resources/numeric123") {
      if (request.method === "GET") return { data: document };
      if (request.method === "PUT") { write = JSON.parse(request.body); return { status: 409, error: "Specific stale baseline conflict" }; }
    }
    return common(request);
  });
  try {
    const page = browser.page;
    await page.goto(`${fixture.origin}/admin/global-resources?editor=edit&publicId=numeric123`);
    await page.getByRole("heading", { name: "Edit global resource", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Canonical ID", { exact: true }).isDisabled(), true);
    await page.getByLabel("Localized name", { exact: true }).fill("Updated manual introduction");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.getByText("Specific stale baseline conflict", { exact: true }).waitFor();
    assert(write);
    assert.equal(write.baseRevisionId, "published-baseline");
    assert.deepEqual(write.definition, document.definition);
    assert.equal(await page.getByLabel("Localized name", { exact: true }).inputValue(), "Updated manual introduction");
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
