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
    await page.setViewportSize({ width: 390, height: 844 });
    const navigation = page.getByRole("navigation").filter({ has: page.getByRole("button", { name: "用户设置", exact: true }) });
    await navigation.waitFor();
    assert.equal(await navigation.locator('button[aria-current="page"]').innerText(), "用户设置");
    const layout = await navigation.evaluate(nav => ({
      width: nav.clientWidth,
      content: nav.scrollWidth,
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      singleLine: Array.from(nav.querySelectorAll("button")).every(button => {
        const range = document.createRange();
        range.selectNodeContents(button);
        return range.getClientRects().length === 1;
      }),
    }));
    assert(layout.pageFits && layout.content > layout.width && layout.singleLine);
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
  const completed = Promise.withResolvers<APIReply>();
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
    if (path === "/api/v1/mods/fixture-mod/export-imports/job-one" && method === "GET") { polled++; return completed.promise; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01&import=exporter`);
    await page.getByRole("button", { name: "mcmods_exporter", exact: true }).click();
    const input = page.locator('input[accept=".zip,application/zip"]').first();
    await page.waitForFunction(() => (document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement | null)?.disabled === false);
    const dropZone = input.locator("..");
    await page.getByText("The source ZIP is private.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("link", { name: /Back to Fixture mod/ }).getAttribute("href"), "/mods/fixture-mod");
    await page.getByText("1.21 · 1", { exact: true }).waitFor();
    await input.setInputFiles({ name: "readme.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
    await page.getByText(/Choose a ZIP exported by mcmods_exporter/i).waitFor();
    assert.equal(presigns.length, 0);

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
    initialJob.resolve({ status: 202, data: { ...job, status: "queued", currentStage: "queued", progress: 0, reviewRequired: true } });
    await page.getByText("Queued", { exact: true }).waitFor();
    assert.equal(await page.getByText(/awaiting review/i).count(), 0);
    completed.resolve({ data: { ...job, status: "partial", currentStage: "review", reviewRequired: true } });
    await page.getByText("Partial import complete", { exact: true }).waitFor();
    await page.getByText("This import is awaiting review.", { exact: false }).waitFor();
    assert.equal(await page.getByText("File uploaded. You can close this window.", { exact: false }).count(), 0);
    await page.waitForFunction(() => (document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement | null)?.disabled === false);
    assert.equal(polled, 1, "Only the returned job is monitored to completion");
    assert.equal(presigns.length, 1);
    assert.equal(creations.length, 1);
  } finally { initialJob.resolve({ data: job }); completed.resolve({ data: job }); await browser.close(); }
});

for (const [source, endpoint, fileName] of [
  ["exporter", "export-imports", "test.zip"],
  ["iconrenderer", "catalog-imports", "icons.json"],
] as const) {
  test(`committed ${source} imports recover status without creating or uploading again`, { timeout: 35_000 }, async () => {
    const id = "8f5bb7b3-0541-4eb1-9471-77cc7e8a5d1f";
    const root = `/api/v1/mods/fixture-mod/${endpoint}`;
    const writes: string[] = [];
    let statusReads = 0;
    const browser = await controlled(({ path, method }) => {
      if (path === "/api/v1/mods/fixture-mod/editor") return { data: { uniqueId: "fixturemod", siteId: "fixture-mod", primaryName: "Fixture mod", compatibilities: [] } };
      if (path === "/api/v1/mods/fixture-mod/content-versions") return { data: { items: [{ publicId: "version01", label: "Fixture version", minecraftVersions: ["1.21"], loaders: [], modVersion: "1", status: "active" }] } };
      if (path === "/api/v1/mods/fixture-mod/content-templates" || path === "/api/v1/mods/fixture-mod/content-sections") return { data: { items: [] } };
      if (path === "/api/v1/mods/fixture-mod/export-imports/active") return { data: { job: null } };
      if (method === "POST" && path.startsWith(root)) {
        writes.push(path);
        if (path === `${root}/uploads/presign`) return { data: { uploadRequired: false, file: { id: "file-receipt" } } };
        if (path === root) return { status: 500, error: "Import accepted; status unavailable", code: "import_job_accepted_status_unavailable", details: { jobId: id } };
      }
      if (method === "GET" && path === `${root}/${id}`) {
        statusReads++;
        if (statusReads === 1) return { status: 503, error: "Temporary status outage" };
        return { data: { id, status: "ready", progress: 100, currentStage: "ready", reviewRequired: true, errorDetail: {}, detectedModids: [], configuredModids: [] } };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01&import=${source}`);
      const selector = source === "exporter" ? 'input[accept=".zip,application/zip"]' : 'input[accept=".json,application/json,application/x-ndjson"]';
      const input = page.locator(selector).first();
      await input.locator("..").waitFor({ state: "visible" });
      await page.waitForFunction(selector => document.querySelector<HTMLInputElement>(selector)?.disabled === false, selector);
      await input.setInputFiles({ name: fileName, mimeType: source === "exporter" ? "application/zip" : "application/json", buffer: Buffer.from(source === "exporter" ? "synthetic exporter bytes" : "[{}]") });
      const notice = page.getByText(`Import ${id} was accepted. Its status is temporarily unavailable.`, { exact: true });
      await notice.waitFor({ timeout: 8000 });
      assert.equal(await input.isDisabled(), true);
      if (source === "iconrenderer") {
        await page.reload();
        await notice.waitFor();
        assert.equal(await input.isDisabled(), true);
      }
      await page.getByRole("button", { name: "Check import status", exact: true }).click();
      await page.getByText(source === "exporter" ? /This import is awaiting review/ : /awaiting review|pending review|submitted for review/i).first().waitFor();
      await page.waitForFunction(selector => document.querySelector<HTMLInputElement>(selector)?.disabled === false, selector);
      assert.deepEqual(writes, [`${root}/uploads/presign`, root]);
      assert.equal(statusReads, 2);
    } finally { await browser.close(); }
  });
}

test("private comment watches can continue an empty visible page and a stale filter cannot replace unread results", { timeout: 30_000 }, async () => {
  const mutedStarted = Promise.withResolvers<void>();
  const mutedReply = Promise.withResolvers<APIReply>();
  const reads: string[] = [];
  let marked = 0;
  const stamp = "2026-11-01T00:00:00Z";
  const watch = (id: string, title: string) => ({ id, comment: { id: id + "-comment", author: { username: "Test author" }, body: "Test body" },
    target: { title, url: "/mods/fixture" }, mutedForever: false, unreadCount: 1, watchedReplies: 1, createdAt: stamp, lastActivityAt: stamp });
  const browser = await controlled(({ path, method, url }) => {
    if (path === "/api/v1/users/me/profile-settings" || path === "/api/v1/users/me/overview" || path === "/api/v1/users/me/notification-settings")
      return { status: 503, error: "Independent account panel unavailable" };
    if (path === "/api/v1/users/me/comment-watches") {
      const filter = url.searchParams.get("filter");
      const cursor = url.searchParams.get("cursor") ?? "";
      reads.push(filter + "/" + cursor);
      if (filter === "muted") { mutedStarted.resolve(); return mutedReply.promise; }
      if (filter === "unread") return { data: { items: marked ? [] : [watch("unread", "Unread branch")], nextCursor: "" } };
      return { data: cursor ? { items: [watch("visible", "Visible later branch")], nextCursor: "" } : { items: [], nextCursor: "opaque+/=" } };
    }
    if (path === "/api/v1/comment-watches/unread/read" && method === "POST") { marked++; return { data: {} }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=comment-watches`);
    const panel = page.getByRole("heading", { name: "My watches", exact: true }).locator("xpath=ancestor::section[1]");
    await panel.getByRole("button", { name: "Next", exact: true }).click();
    await panel.getByRole("link", { name: "Visible later branch" }).waitFor();
    await panel.getByRole("button", { name: "Previous", exact: true }).click();
    await panel.getByRole("button", { name: "Next", exact: true }).waitFor();
    const filter = panel.getByRole("combobox", { name: "Filter watches" });
    await filter.selectOption("muted"); await mutedStarted.promise;
    await filter.selectOption("unread");
    await panel.getByRole("link", { name: "Unread branch" }).waitFor();
    mutedReply.resolve({ data: { items: [watch("late", "Stale muted branch")], nextCursor: "" } });
    await panel.getByRole("button", { name: "Mark read", exact: true }).click();
    await panel.getByText("No comment branches are being watched.", { exact: true }).waitFor();
    assert.equal(marked, 1);
    assert.ok(reads.includes("all/opaque+/=")); assert.equal(reads.at(-1), "unread/");
    assert.equal(await panel.getByRole("link", { name: "Stale muted branch" }).count(), 0);
  } finally { mutedReply.resolve({ data: { items: [], nextCursor: "" } }); await browser.close(); }
});

test("the selected activity range never labels a previous total and retries its own failed read", { timeout: 30_000 }, async () => {
  let sevenDayReads = 0;
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/users/me/profile-settings" || path === "/api/v1/users/me/overview" || path === "/api/v1/users/me/notification-settings")
      return { status: 503, error: "Independent account panel unavailable" };
    if (path !== "/api/v1/users/me/statistics") return;
    const range = url.searchParams.get("range");
    if (range === "7d" && ++sevenDayReads === 1) return { status: 503, error: "Range temporarily unavailable" };
    return { data: { range, selectedRange: { actionCount: range === "all" ? 777 : 0 }, contentCreation: [], community: {},
      level: { level: 1, experience: 0, experienceInLevel: 0, experienceToNextLevel: 10, lifetimeExperience: 0, progressPercent: 0 } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=statistics`);
    await page.getByText("777", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Time range" }).selectOption("7d");
    const error = page.getByRole("alert").filter({ hasText: "Range temporarily unavailable" });
    await error.waitFor();
    assert.equal(await page.getByText("777", { exact: true }).count(), 0);
    await error.getByRole("button", { name: "Retry" }).click();
    const operations = page.getByText("Operations", { exact: true }).locator("..").filter({ has: page.locator("strong") });
    await operations.locator("strong").filter({ hasText: /^0$/ }).waitFor();
    assert.equal(sevenDayReads, 2);
  } finally { await browser.close(); }
});

test("removing the only blocked user on the last page returns to the remaining users", async () => {
  const users = Array.from({ length: 25 }, (_, index) => ({ id: `user-${index + 1}`, username: `Blocked user ${index + 1}`, signature: "", avatarUrl: "" }));
  const pages: number[] = [];
  let deletions = 0;
  const browser = await controlled(({ path, method, url }) => {
    if (path === "/api/v1/users/test048u1/profile") return { data: { id: "test048u1", username: "Reviewer", isOwn: true, followers: 0, following: 0, blocked: users.length } };
    if (path === "/api/v1/users/me/blocks") {
      const page = Number(url.searchParams.get("page"));
      pages.push(page);
      return { data: { items: users.slice((page - 1) * 24, page * 24), total: users.length, page, pageSize: 24 } };
    }
    if (path === "/api/v1/users/user-25/block" && method === "DELETE") {
      deletions++;
      users.splice(24, 1);
      return { data: { blocked: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user/test048u1/blocked`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const last = page.getByRole("article").filter({ hasText: "Blocked user 25" });
    await last.getByRole("button", { name: "Unblock" }).click();
    await page.getByText("Blocked user 1", { exact: true }).waitFor({ timeout: 5_000 });
    assert.equal(await page.getByRole("article").count(), 24);
    assert.equal(await page.getByText("Blocked user 25", { exact: true }).count(), 0);
    assert.equal(deletions, 1);
    assert.deepEqual(pages, [1, 2, 1]);
  } finally { await browser.close(); }
});

test("a rejected community submission shows the review decision to its author", async () => {
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", secondaryLocale: "", editableLocales: ["en-US"] } };
    if (path === "/api/v1/review-locks/community_post/testpost1") return { data: { blocked: false } };
    if (path === "/api/v1/projects/testpost1/follow") return { data: { following: false } };
    if (path === "/api/v1/comment-targets/community_post/testpost1/comments") return { data: { items: [], total: 0, capabilities: { canCreate: false } } };
    if (path === "/api/v1/community/posts/testpost1") return { data: { id: "testpost1", kind: "tutorial", title: "My submission", sourceLocale: "en-US",
      bodyMarkdown: "Tutorial draft", minecraftVersions: [], authorId: "test048u1", authorName: "Test reviewer", reviewStatus: "rejected",
      projects: [], resources: [], canEdit: true, canResolve: false } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tutorials/testpost1`);
    const header = page.getByRole("heading", { name: "My submission", exact: true }).locator("xpath=ancestor::header");
    await header.getByText("Rejected", { exact: true }).waitFor({ timeout: 5_000 });
    assert.equal(await header.getByText("Pending review", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});

test("recipe shopping quantities preserve range text and case-sensitive units when combining matching inputs", async () => {
  const quantities = [
    { amount_text: "1–3" }, { amount_text: "1–3" }, { amount: 2, unit: "mB" }, { amount: 3, unit: "mB" }, { amount: 1, unit: "MB" }, { amount: 0 }, {},
  ];
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/catalog/recipes/ingredient/render") return { data: {
      publicId: "ingredient", recipeId: "fixture:amounts", revisionId: "revision1",
      layout: { canvas: { width: 150, height: 18 }, slots: quantities.map((quantity, index) => ({
        role: "input", slot_id: String(index), rect: { x: index * 18, y: 0, width: 18, height: 18 },
        alternatives: [{ id: "fixture:material", kind: "item", ...quantity }],
      })) },
    } };
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/recipe-types?recipePublicId=ingredient");
    const rows = page.locator("#recipe-ingredient aside li");
    await rows.first().waitFor();
    assert.deepEqual(await rows.locator(".truncate.font-bold").allTextContents(), [
      "fixture:material× 1–3", "fixture:material× 1–3", "fixture:material× 5mB", "fixture:material× 1MB", "fixture:material× 0", "fixture:material",
    ]);
  } finally { await browser.close(); }
});
