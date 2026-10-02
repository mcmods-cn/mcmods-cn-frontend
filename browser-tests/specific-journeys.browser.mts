import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
before(async () => fixture.start());
after(async () => fixture.close());

// These use the shipped production components and native browser events.
// API responses are synthetic, including OSS deduplication and import results;
// they do not establish database persistence, real translation, or ZIP parsing.
test("FP012 content-language selections survive a UI language switch and save the selected values", { timeout: 30_000 }, async () => {
  let reads = 0;
  const saves: unknown[] = [];
  const settings = { primaryLocale: "en-US", secondaryLocale: "zh-CN", editableLocales: ["en-US", "zh-CN", "fr-FR", "ja-JP"] };
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/users/me/content-languages") {
      if (method === "PUT") { const payload = JSON.parse(body); saves.push(payload); return { data: { ...settings, ...payload } }; }
      reads++; return { data: settings };
    }
    if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "test048u1", username: "Test reviewer", signature: "Synthetic signature", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
    if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
    if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=settings`);
    let preferences = page.getByRole("heading", { name: "Content language preferences", exact: true }).locator("xpath=ancestor::section[1]");
    const selectLanguage = async (index: number, name: string) => {
      await preferences.locator("button.field").nth(index).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("button[aria-pressed]").filter({ hasText: name }).click();
      await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    };
    await selectLanguage(0, "Français (France)");
    await selectLanguage(1, "日本語 (日本)");
    assert.match(await preferences.locator("button.field").nth(0).innerText(), /Français \(France\)/);
    assert.match(await preferences.locator("button.field").nth(1).innerText(), /日本語 \(日本\)/);
    const readsBeforeLanguageSwitch = reads;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    preferences = page.getByRole("heading", { name: "内容语言偏好", exact: true }).locator("xpath=ancestor::section[1]");
    assert.match(await preferences.locator("button.field").nth(0).innerText(), /Français \(France\)/);
    assert.match(await preferences.locator("button.field").nth(1).innerText(), /日本語 \(日本\)/);
    assert.equal(reads, readsBeforeLanguageSwitch, "Changing UI language must not reload and overwrite selected content languages");
    await preferences.getByRole("button", { name: "保存语言偏好", exact: true }).click();
    await preferences.getByText("内容语言偏好已保存。", { exact: true }).waitFor();
    assert.deepEqual(saves, [{ primaryLocale: "fr-FR", secondaryLocale: "ja-JP" }]);
  } finally { await browser.close(); }
});

test("FP051 imported recipe edit opens its actual type and preserves the draft through a failed write", { timeout: 40_000 }, async () => {
  const recipeId = "recipe-real-01";
  const typeId = "type-real-01";
  const canonicalType = "minecraft:crafting";
  const templateId = "template-real-01";
  const typeOptions = Promise.withResolvers<APIReply>();
  const typeOptionsStarted = Promise.withResolvers<void>();
  const typeOptionsReply = { data: { items: [{ publicId: typeId, canonicalId: canonicalType, name: "Synthetic crafting" }], total: 1 } };
  let recipeReads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const popupErrors: string[] = [];
  const template = { publicId: templateId, recipeTypePublicId: typeId, templateKey: "synthetic_crafting", canvas: { width: 176, height: 86, imageScale: 1 }, slots: [{ slotKey: "result", role: "output", outputIndex: 0, rect: { x: 100, y: 20, width: 18, height: 18 } }] };
  const browser = await controlled(({ path, method, body, url }) => {
    if (path === "/api/v1/mods/fixture-mod/content-resources/resource01") return { data: { entityId: "resource01", kindCode: "minecraft.item", canonicalId: "fixture:item", capabilities: { editResource: false }, versions: [{ publicId: "version01", label: "1.21", hasDetail: true, registry: "minecraft:item", revisionId: "export-revision-01" }], details: [{ versionPublicId: "version01", sectionPublicId: "section01", entryTypeCode: "default", defaultLocale: "en-US", definition: {}, localizations: [{ locale: "en-US", name: "Synthetic item", summary: "", contentMarkdown: "" }] }] } };
    if (path === "/api/v1/mods/fixture-mod/content-resources/resource01/similar") return { data: { groupId: "", items: [] } };
    if (path === "/api/v1/export-revisions/export-revision-01/entry-detail") {
      assert.equal(url.searchParams.get("publicId"), "resource01");
      return { data: { publicId: "resource01", data: {}, modelAvailable: false, modelAssetPaths: [], recipes: [{ publicId: recipeId, recipeId: "fixture:crafting_source", type: canonicalType, jeiLayout: { underlying_recipe_type_id: canonicalType, layout_kind: "unknown", slots: [] } }], uses: [], versions: [] } };
    }
    if (path === "/api/v1/content-metrics/resource01/view") return { data: {} };
    if (path === "/api/v1/content-metrics/resource01") return { status: 503, error: "Synthetic unrelated metrics unavailable" };
    if (path === "/api/v1/comment-targets/mod_resource/resource01~version01/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === `/api/v1/catalog/recipes/${recipeId}`) {
      if (method === "PUT") {
        writes.push(JSON.parse(body));
        if (writes.length === 1) return { status: 503, error: "Controlled recipe write failure" };
        return { data: { objectPublicId: recipeId, revisionId: "revision-after", reviewStatus: "approved" } };
      }
      recipeReads++;
      if (recipeReads === 1) return { status: 503, error: "Controlled recipe resolution failure" };
      return { data: { publicId: recipeId, recipeTypePublicId: typeId, templatePublicId: templateId, canonicalSourceId: "fixture:crafting_source", applicableVersions: ["1.21"], defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Synthetic imported recipe", summary: "", contentMarkdown: "", provenance: "import", reviewStatus: "approved", editable: true }], publishedRevisionId: "revision-before", reviewStatus: "approved", definition: {}, bindings: { result: { candidates: [{ resourcePublicId: "resource01", canonicalId: "fixture:item", kindCode: "minecraft.item", name: "Synthetic item", amount: 1 }] } } } };
    }
    if (path === "/api/v1/recipe-types") { typeOptionsStarted.resolve(); return typeOptions.promise; }
    if (path === "/api/v1/catalog/recipe-source-versions") return { data: { items: [] } };
    if (path === `/api/v1/recipe-types/${typeId}/templates`) return { data: { items: [template] } };
    if (path === `/api/v1/recipe-templates/${templateId}`) return { data: template };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/resources/resource01?version=version01&section=section01`);
    const edit = page.locator(`a[href*="recipePublicId=${recipeId}"][target="_blank"]`);
    await edit.waitFor();
    const entryURL = new URL((await edit.getAttribute("href"))!, fixture.origin);
    assert.equal(entryURL.searchParams.has("publicId"), false, "The imported canonical type must not masquerade as a public ID");
    const opened = page.waitForEvent("popup");
    await edit.click();
    const popup = await opened;
    popup.setDefaultTimeout(5000);
    popup.on("pageerror", error => popupErrors.push(error.message));
    await popup.getByText("Controlled recipe resolution failure", { exact: true }).waitFor();
    await popup.getByRole("button", { name: "Retry", exact: true }).click();
    await popup.waitForURL(url => url.searchParams.get("publicId") === typeId && url.searchParams.get("recipePublicId") === recipeId);
    const name = popup.getByLabel("Localized name", { exact: true });
    await name.waitFor();
    assert.equal(await name.inputValue(), "Synthetic imported recipe");
    await typeOptionsStarted.promise;
    const typeSelect = popup.getByLabel(/^Recipe methods/);
    assert.equal(await typeSelect.isDisabled(), true, "the imported recipe's type cannot be changed while its independent options request is pending");
    assert.equal(await typeSelect.locator("option").count(), 1);
    assert.match(await typeSelect.locator("option").innerText(), /Loading recipe methods/);
    typeOptions.resolve(typeOptionsReply);
    await typeSelect.locator(`option[value="${typeId}"]`).waitFor({ state: "attached" });
    assert.equal(await typeSelect.inputValue(), typeId);
    assert.equal(await popup.getByLabel("Canonical source ID", { exact: true }).inputValue(), "fixture:crafting_source");
    await name.fill("Edited imported recipe");
    await popup.getByRole("button", { name: "Save", exact: true }).click();
    await popup.getByText("Controlled recipe write failure", { exact: true }).waitFor();
    assert.equal(await name.inputValue(), "Edited imported recipe", "An unsuccessful mutation keeps the user's input");
    const closed = popup.waitForEvent("close");
    await popup.getByRole("button", { name: "Save", exact: true }).click();
    await closed;
    assert.equal(recipeReads, 3, "Resolution retry and scoped editor both read the actual recipe");
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.equal(write.recipeTypePublicId, typeId);
      assert.equal(write.templatePublicId, templateId);
      assert.equal(write.baseRevisionId, "revision-before");
      assert.deepEqual(write.applicableVersionIds, ["1.21"]);
      assert.deepEqual(write.localizations, [{ locale: "en-US", name: "Edited imported recipe", summary: "", contentMarkdown: "" }]);
    }
    assert.deepEqual(popupErrors, []);
  } finally { typeOptions.resolve(typeOptionsReply); await browser.close(); }
});

test("FP068 two native ZIP drops cannot start another import while the initial job POST is pending", { timeout: 35_000 }, async () => {
  const initialJob = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const presigns: Array<Record<string, unknown>> = [];
  const creations: unknown[] = [];
  let polled = 0;
  const job = { id: "job-one", modSiteId: "fixture-mod", packageId: "package-one", targetVersionPublicId: "version01", overwriteExistingImportData: false, status: "ready", progress: 100, currentStage: "ready", errorCode: "", errorDetail: {}, deduplicated: false, reviewRequired: false, configuredModids: [], detectedModids: [], primaryDetectedModid: "", modidConfirmationRequired: false, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/mods/fixture-mod/editor") return { data: { uniqueId: "fixturemod", siteId: "fixture-mod", primaryName: "Fixture mod", compatibilities: [] } };
    if (path === "/api/v1/mods/fixture-mod/content-versions") return { data: { items: [{ publicId: "version01", label: "Fixture version", minecraftVersions: ["1.21"], loaders: [], modVersion: "1", status: "active" }] } };
    if (path === "/api/v1/mods/fixture-mod/content-templates" || path === "/api/v1/mods/fixture-mod/content-sections") return { data: { items: [] } };
    if (path === "/api/v1/mods/fixture-mod/export-imports/active") return { data: { job: null } };
    if (path === "/api/v1/mods/fixture-mod/export-imports/uploads/presign" && method === "POST") {
      const payload = JSON.parse(body); presigns.push(payload);
      return { data: { uploadRequired: false, originalName: payload.originalName, sizeBytes: payload.sizeBytes, file: { id: "file-one" } } };
    }
    if (path === "/api/v1/mods/fixture-mod/export-imports" && method === "POST") { creations.push(JSON.parse(body)); started.resolve(); return initialJob.promise; }
    if (path === "/api/v1/mods/fixture-mod/export-imports/job-one" && method === "GET") { polled++; return { data: job }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01&import=exporter`);
    await page.getByRole("button", { name: "mcmods_exporter", exact: true }).click();
    const input = page.locator('input[accept=".zip,application/zip"]').first();
    await page.waitForFunction(() => (document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement | null)?.disabled === false);
    const dropZone = input.locator("..");
    await dropZone.evaluate(node => {
      for (const filename of ["first.zip", "second.zip"]) {
        const data = new DataTransfer();
        data.items.add(new File(["synthetic importer bytes"], filename, { type: "application/zip" }));
        node.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
      }
    });
    await started.promise;
    assert.equal(await input.isDisabled(), true);
    await dropZone.evaluate(async node => {
      const data = new DataTransfer();
      data.items.add(new File(["third synthetic ZIP"], "third.zip", { type: "application/zip" }));
      node.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    assert.equal(presigns.length, 1, "The second same-tick drop must not start a second persisted upload");
    assert.equal(presigns[0].originalName, "first.zip");
    assert.deepEqual(creations, [{ ossFileId: "file-one", targetVersionPublicId: "version01", overwriteExistingImportData: false }]);
    assert.equal(polled, 0, "The job response is still pending");
    initialJob.resolve({ data: job });
    await page.waitForFunction(() => (document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement | null)?.disabled === false);
    assert.equal(polled, 1, "Only the returned job is monitored to completion");
    assert.equal(presigns.length, 1);
    assert.equal(creations.length, 1);
  } finally { initialJob.resolve({ data: job }); await browser.close(); }
});
