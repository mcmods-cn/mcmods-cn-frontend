import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const pageOf = (items: unknown[]) => ({ items, hasMore: false, nextCursor: "", limit: 50 });
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
before(async () => fixture.start());
after(async () => fixture.close());

// Real production components, explicitly substituted API transport. These
// assertions do not establish server authorization or database persistence.
test("OCT02 header submenu is keyboard reachable and notices contain and restore focus", { timeout: 30_000 }, async () => {
  const browser = await controlled(() => undefined);
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/login`);
    const mods = page.locator('nav[aria-label="Main navigation"] a[href="/mods"]');
    await mods.focus();
    await mods.press("ArrowDown");
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")), "/mods-tag");
    await page.keyboard.press("Escape");
    assert.equal(await mods.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.getByRole("menu").count(), 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("mcmods-site-notice", { detail: { title: "Controlled notice", message: "Controlled notice body" } })));
    const dialog = page.getByRole("alertdialog", { name: "Controlled notice", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(await mods.evaluate(node => node === document.activeElement), true);
  } finally { await browser.close(); }
});

test("OCT02 custom page retry reuses its saved template after the section request fails", { timeout: 30_000 }, async () => {
  let templates = 0;
  let sections = 0;
  const pending = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const template = { publicId: "customtmpl", code: "custom_oct02", builtin: false, i18nKey: "", defaultLocale: "en-US", defaultDisplayMode: "compact", status: "active", definition: { resourceKinds: ["import.document"], entryTypes: [] }, localizations: [{ locale: "en-US", name: "Retry page", summary: "", contentMarkdown: "" }] };
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/mods/fixture-mod/editor") return { data: { uniqueId: "fixturemod", siteId: "fixture-mod", primaryName: "Fixture mod", compatibilities: [] } };
    if (path === "/api/v1/mods/fixture-mod/export-imports/active") return { data: { job: null } };
    if (path === "/api/v1/mods/fixture-mod/content-versions") return { data: { items: [{ publicId: "version01", label: "Fixture version", minecraftVersions: ["1.21"], loaders: [], modVersion: "1", status: "active" }] } };
    if (path === "/api/v1/mods/fixture-mod/content-templates") {
      if (method === "POST") { templates++; return { data: { publicId: template.publicId, reviewStatus: "approved" } }; }
      return { data: { items: templates ? [template] : [] } };
    }
    if (path === "/api/v1/mods/fixture-mod/content-sections") {
      if (method === "POST") {
        sections++;
        if (sections === 1) return { status: 503, error: "Controlled second-step failure" };
        started.resolve();
        return pending.promise;
      }
      return { data: { items: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01`);
    await page.getByRole("button", { name: /^Add data page(?:\s|$)/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add content type", exact: true });
    await dialog.getByRole("button", { name: "Custom content type", exact: true }).click();
    await dialog.getByPlaceholder("Localized name", { exact: true }).fill("Retry page");
    await dialog.getByRole("button", { name: "Add to this version", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Controlled second-step failure" }).waitFor();
    assert.equal(templates, 1);
    assert.equal(await dialog.getByPlaceholder("Localized name", { exact: true }).inputValue(), "Retry page");
    await dialog.getByRole("button", { name: "Add to this version", exact: true }).click();
    await started.promise;
    assert.equal(templates, 1, "Retry must use the saved template ID");
    assert.equal(sections, 2);
    assert.equal(await dialog.getByPlaceholder("Localized name", { exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    pending.resolve({ data: { publicId: "section01", reviewStatus: "approved" } });
    await dialog.waitFor({ state: "hidden" });
  } finally { pending.resolve({ data: { publicId: "section01", reviewStatus: "approved" } }); await browser.close(); }
});

test("OCT02 global catalogs normalize out-of-range URL pages and fetch the actual page", { timeout: 30_000 }, async () => {
  for (const [route, path] of [["/mods-tag", "/api/v1/tags"], ["/recipe-types", "/api/v1/recipe-types"]]) {
    const offsets: number[] = [];
    const browser = await controlled(({ path: requested, url }) => {
      if (requested === path) { offsets.push(Number(url.searchParams.get("offset"))); return { data: { items: [], total: 1 } }; }
    });
    try {
      const actualPage = browser.page.waitForResponse(response => new URL(response.url()).pathname === path && new URL(response.url()).searchParams.get("offset") === "0");
      await browser.page.goto(`${fixture.origin}${route}?page=999&q=retained-query`);
      await actualPage;
      await browser.page.waitForURL(url => !url.searchParams.has("page") && url.searchParams.get("q") === "retained-query");
      assert.deepEqual(offsets, [23952, 0]);
      assert.equal(await browser.page.getByRole("searchbox").inputValue(), "retained-query");
    } finally { await browser.close(); }
  }
});

test("OCT02 recipe template actor changes immediately discard the previous private draft", { timeout: 30_000 }, async () => {
  let actor = "actor-a";
  const second = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, email: `${actor}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/notifications") return { data: pageOf([]) };
    if (path === "/api/v1/recipe-templates/template1") {
      if (actor === "actor-b") { started.resolve(); return second.promise; }
      return { data: { publicId: "template1", recipeTypePublicId: "recipetype1", templateKey: "private_template_a", defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Private template A", summary: "", contentMarkdown: "", provenance: "human", reviewStatus: "approved" }], canvas: { width: 176, height: 166, imageScale: 1 }, slots: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?editor=template-edit&publicId=recipetype1&templatePublicId=template1`);
    await page.getByLabel("Template key", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Template key", { exact: true }).inputValue(), "private_template_a");
    actor = "actor-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor-b" })));
    await started.promise;
    assert.equal(await page.getByLabel("Template key", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Private template A", { exact: true }).count(), 0);
    second.resolve({ status: 403, error: "New actor cannot read the template" });
    await page.getByText("New actor cannot read the template", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Template key", { exact: true }).count(), 0);
  } finally { second.resolve({ status: 403, error: "New actor cannot read the template" }); await browser.close(); }
});

test("OCT02 an embedded upload cannot replace another content-language draft or clear its upload guard", { timeout: 30_000 }, async () => {
  const first = Promise.withResolvers<APIReply>();
  const second = Promise.withResolvers<APIReply>();
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  let uploads = 0;
  const marker = '<!-- Uploading "repeated.nbt"... -->';
  const target = { type: "mod", id: "oct02mod1", name: "Fixture mod", url: "/mods/fixture-mod", canEdit: true };
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/changelogs/oct02log1") return { data: { target, item: { id: "oct02log1", eventAt: "2026-10-02T01:00:00Z", minecraftVersions: ["1.21"], projectVersion: "original", defaultLocale: "en-US", localizations: [{ locale: "en-US", bodyMarkdown: "English source" }, { locale: "zh-CN", bodyMarkdown: `Chinese draft with the same prior marker ${marker}` }] } } };
    if (path === "/api/v1/changelogs") return { data: { target, categories: [], ...pageOf([]) } };
    if (path === "/api/v1/review-locks/project_changelog/oct02log1") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/users/me/drafts" && method === "POST") return { data: { updatedAt: "2026-10-02T00:00:00Z" } };
    if (path === "/api/v1/blueprints/bluep0002" || path === "/api/v1/blueprints/bluep0001") return { data: { id: "bluep0002", renderAvailable: false } };
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      uploads++;
      if (uploads === 1) { firstStarted.resolve(); return first.promise; }
      secondStarted.resolve();
      return second.promise;
    }
  });
  const reply = (id: string): APIReply => ({ data: { uploadRequired: false, file: { id, originalName: "repeated.nbt", contentType: "application/octet-stream", sizeBytes: 4, blueprintId: id } } });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/changelogs/oct02log1/edit`);
    await page.getByRole("heading", { name: "Edit changelog entry", exact: true }).waitFor();
    const file = { name: "repeated.nbt", mimeType: "application/octet-stream", buffer: Buffer.from("NBT!") };
    await page.locator('input[accept=".nbt,.schem,.schematic,.litematic"]').setInputFiles(file);
    await firstStarted.promise;
    await page.getByLabel("Editing language", { exact: false }).selectOption("zh-CN");
    const editor = page.locator('textarea[spellcheck="false"]');
    await editor.waitFor();
    assert.match(await editor.inputValue(), /Chinese draft/);
    await page.locator('input[accept=".nbt,.schem,.schematic,.litematic"]').setInputFiles(file);
    const firstReturned = page.waitForResponse(async response => new URL(response.url()).pathname === "/api/v1/users/me/oss/uploads/presign" && (await response.json()).data?.file?.id === "bluep0001");
    first.resolve(reply("bluep0001"));
    await (await firstReturned).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal((await editor.inputValue()).includes("bluep0001"), false);
    await secondStarted.promise;
    assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).isDisabled(), true);
    second.resolve(reply("bluep0002"));
    await page.waitForFunction(() => [...document.querySelectorAll("textarea")].some(textarea => textarea.value.includes("[Bluemap:bluep0002]")));
    assert.equal((await editor.inputValue()).includes("bluep0001"), false);
    assert.match(await editor.inputValue(), /Chinese draft/);
  } finally { first.resolve(reply("bluep0001")); second.resolve(reply("bluep0002")); await browser.close(); }
});

test("OCT02 legacy canonical links resolve exact public IDs without a fuzzy first-page guess", { timeout: 30_000 }, async () => {
  for (const kind of ["tag", "recipe-type"] as const) {
    const canonicalId = "minecraft:exact_target";
    const endpoint = kind === "tag" ? "/api/v1/tags" : "/api/v1/recipe-types";
    const route = kind === "tag" ? `/mods-tag?registry=minecraft%3Aitem&tagId=${encodeURIComponent(canonicalId)}&q=keep` : `/recipe-types?id=${encodeURIComponent(canonicalId)}&q=keep`;
    const publicId = kind === "tag" ? "exacttag1" : "exacttype1";
    let exactRequests = 0;
    const browser = await controlled(({ path, url }) => {
      if (path === endpoint) {
        exactRequests++;
        assert.equal(url.searchParams.get("canonicalId"), canonicalId);
        assert.equal(url.searchParams.get("q"), null);
        assert.equal(url.searchParams.get("offset"), "0");
        assert.equal(url.searchParams.get("limit"), "2");
        if (kind === "tag") assert.equal(url.searchParams.get("registry"), "minecraft:item");
        return { data: { items: [{ publicId, canonicalId, registry: "minecraft:item", previews: [], names: {}, catalysts: [], recipeCount: 0 }], total: 1, limit: 2, offset: 0 } };
      }
      if (path === `${endpoint}/${publicId}`) return { data: { publicId, canonicalId, registry: "minecraft:item", localizations: [], members: [] } };
      if (path === `${endpoint}/${publicId}/catalog`) return { data: { publicId, canonicalId, names: {}, catalysts: [], recipes: [], total: 0, limit: 24, offset: 0 } };
    });
    try {
      await browser.page.goto(`${fixture.origin}${route}`);
      await browser.page.waitForURL(url => url.searchParams.get("publicId") === publicId && url.searchParams.get("q") === "keep" && !url.searchParams.has("id") && !url.searchParams.has("tagId"));
      assert.equal(exactRequests, 1);
    } finally { await browser.close(); }
  }
});

test("OCT02 an ambiguous canonical target stays on a visible retry path", { timeout: 30_000 }, async () => {
  let requests = 0;
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/tags") {
      requests++;
      assert.equal(url.searchParams.get("canonicalId"), "minecraft:ambiguous");
      return { data: { items: [{ publicId: "tag111111", canonicalId: "minecraft:ambiguous", registry: "minecraft:item", previews: [] }, { publicId: "tag222222", canonicalId: "minecraft:ambiguous", registry: "minecraft:item", previews: [] }], total: 2, limit: 2, offset: 0 } };
    }
  });
  try {
    await browser.page.goto(`${fixture.origin}/mods-tag?registry=minecraft%3Aitem&tagId=minecraft%3Aambiguous`);
    await browser.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(new URL(browser.page.url()).searchParams.has("publicId"), false);
    const retried = browser.page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/tags");
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    await retried;
    await browser.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(requests, 2);
    assert.equal(new URL(browser.page.url()).searchParams.has("publicId"), false);
  } finally { await browser.close(); }
});

test("OCT02 unblocking one user keeps the remaining blacklist available", { timeout: 30_000 }, async () => {
  let mutations = 0;
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/users/test048u1/profile") return { data: { id: "test048u1", username: "Test reviewer", isOwn: true, followers: 0, following: 0, blocked: 2 } };
    if (path === "/api/v1/users/me/blocks") return { data: { items: [{ id: "blocked01", username: "Blocked one", avatarUrl: "", signature: "" }, { id: "blocked02", username: "Blocked two", avatarUrl: "", signature: "" }], total: 2, page: 1, pageSize: 24 } };
    if (path === "/api/v1/users/blocked01/block" && method === "DELETE") { mutations++; return { data: { blocked: false } }; }
  });
  try {
    await browser.page.goto(`${fixture.origin}/user/test048u1/blocked`);
    const first = browser.page.locator("article").filter({ hasText: "Blocked one" });
    await first.getByRole("button", { name: "Unblock", exact: true }).click();
    await browser.page.getByText("User unblocked.", { exact: true }).waitFor();
    assert.equal(await browser.page.getByText("Blocked two", { exact: true }).count(), 1);
    assert.equal(await browser.page.getByText("Blocked one", { exact: true }).count(), 0);
    assert.equal(await browser.page.getByRole("button", { name: "Unblock", exact: true }).count(), 1);
    assert.equal(mutations, 1);
  } finally { await browser.close(); }
});

test("OCT02 rating mutations are exclusive, keep the pending dialog and recover without losing input", { timeout: 30_000 }, async () => {
  let writes = 0;
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<APIReply>();
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/content-projects/plugin/fixture-plugin") return { data: {
      id: "ratingpr1", siteId: "fixture-plugin", projectType: "plugin", defaultLocale: "en-US",
      localizations: [{ locale: "en-US", name: "Rating fixture", summary: "", bodyMarkdown: "" }],
      abbreviation: "", minecraftVersions: [], loaders: [], categories: [], features: [], authors: [], links: [], galleryImages: [], parentProjects: [],
      resolution: "", performance: "", mapSize: "", license: "MIT", sourceStatus: "open", officialStatus: "active", canEdit: false,
    } };
    if (path === "/api/v1/projects/ratingpr1/follow") return { data: { following: false } };
    if (path === "/api/v1/content-metrics/ratingpr1/view") return { data: {} };
    if (path === "/api/v1/content-metrics/ratingpr1") return { status: 503, error: "Unrelated synthetic metrics unavailable" };
    if (path === "/api/v1/comment-targets/plugin/ratingpr1/comments") return { data: { items: [], total: 0, target: { type: "plugin", key: "ratingpr1", title: "Rating fixture", url: "/plugins/fixture-plugin" }, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === "/api/v1/ratings/plugin/ratingpr1") {
      if (method === "PUT") { writes++; started.resolve(); return pending.promise; }
      return { data: { targetType: "plugin", targetId: "ratingpr1", ratingCount: 0, overallAverage: 0, dimensions: [{ code: "quality", average: 0, count: 0 }], heatScore: 0, engagement: { views: 0, downloads: 0, favorites: 0, comments: 0 }, canRate: true, canViewReviews: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/plugins/fixture-plugin`);
    const trigger = page.getByRole("button", { name: "Write a review", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Review “Rating fixture”", exact: true });
    await dialog.getByRole("textbox").fill("Keep this review after failure");
    await dialog.getByRole("button", { name: "Save", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(await dialog.getByRole("textbox").isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    pending.resolve({ status: 503, error: "Controlled rating write failure" });
    await dialog.getByRole("alert").filter({ hasText: "Controlled rating write failure" }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await dialog.getByRole("textbox").inputValue(), "Keep this review after failure");
    assert.equal(await dialog.getByRole("textbox").isDisabled(), false);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  } finally { pending.resolve({ status: 503, error: "Controlled rating write failure" }); await browser.close(); }
});

test("OCT02 simple project catalogs recover out of range pages without losing filters", { timeout: 30_000 }, async () => {
  const offsets: number[] = [];
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/content-projects/plugin") {
      offsets.push(Number(url.searchParams.get("offset")));
      assert.equal(url.searchParams.get("q"), "retained-query");
      return { data: { items: [], total: 1 } };
    }
  });
  try {
    const response = browser.page.waitForResponse(value => new URL(value.url()).pathname === "/api/v1/content-projects/plugin" && new URL(value.url()).searchParams.get("offset") === "0");
    await browser.page.goto(`${fixture.origin}/plugins?page=999&q=retained-query&size=20`);
    await response;
    await browser.page.waitForURL(url => url.searchParams.get("page") === "1" && url.searchParams.get("q") === "retained-query");
    assert.deepEqual(offsets, [19960, 0]);
  } finally { await browser.close(); }
});

test("OCT02 server submission freezes its snapshot and retains it after a failed write", { timeout: 30_000 }, async () => {
  let writes = 0;
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<APIReply>();
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/servers/settings") return { data: { maxProofFiles: 5, maxProofTotalBytes: 10_485_760, nameMaxLength: 80, summaryMaxLength: 240, historyDays: 90, reviewRequired: false } };
    if (path === "/api/v1/servers/probe") return { data: { address: "play.example.invalid:25565", motd: "Snapshot server", detectedMinecraftVersion: "1.21", minecraftVersion: "1.21", mods: [] } };
    if (path === "/api/v1/users/me/drafts") return { data: method === "POST" ? { updatedAt: "2026-10-02T01:00:00Z" } : { items: [] } };
    if (path === "/api/v1/servers" && method === "POST") {
      writes++;
      assert.equal(JSON.parse(body).name, "Snapshot server");
      started.resolve();
      return pending.promise;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/new`);
    await page.getByLabel("Server address", { exact: true }).fill("play.example.invalid:25565");
    await page.getByRole("button", { name: "Connect and check", exact: true }).click();
    const submit = page.getByRole("button", { name: "Submit for review", exact: true });
    await submit.waitFor();
    await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await started.promise;
    const input = page.locator('input[maxlength="80"]');
    assert.equal(await input.isDisabled(), true);
    await page.getByRole("button", { name: "Cancel", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    assert.equal(new URL(page.url()).pathname, "/servers/new");
    pending.resolve({ status: 503, error: "Controlled server submit failure" });
    await page.getByText("Controlled server submit failure", { exact: true }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await input.inputValue(), "Snapshot server");
    assert.equal(await input.isDisabled(), false);
  } finally { pending.resolve({ status: 503, error: "Controlled server submit failure" }); await browser.close(); }
});

test("OCT02 release upload freezes file metadata and keeps it available after failure", { timeout: 30_000 }, async () => {
  let uploads = 0;
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<APIReply>();
  const browser = await controlled(({ path, method, url }) => {
    if (path === "/api/v1/content-projects/plugin/upload-fixture") return { data: {
      id: "download1", siteId: "upload-fixture", projectType: "plugin", defaultLocale: "en-US",
      localizations: [{ locale: "en-US", name: "Release fixture", summary: "", bodyMarkdown: "" }],
      abbreviation: "", minecraftVersions: ["1.21"], loaders: ["paper"], categories: [], features: [], authors: [], links: [], galleryImages: [], parentProjects: [],
      resolution: "", performance: "", mapSize: "", license: "MIT", sourceStatus: "open", officialStatus: "active", canEdit: false,
    } };
    if (path === "/api/v1/projects/download1/follow") return { data: { following: false } };
    if (path === "/api/v1/content-metrics/download1/view") return { data: {} };
    if (path === "/api/v1/content-metrics/download1") return { status: 503, error: "Unrelated synthetic metrics unavailable" };
    if (path === "/api/v1/comment-targets/plugin/download1/comments") return { data: { items: [], total: 0, target: { type: "plugin", key: "download1", title: "Release fixture", url: "/plugins/upload-fixture" }, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === "/api/v1/ratings/plugin/download1") return { data: { targetType: "plugin", targetId: "download1", ratingCount: 0, overallAverage: 0, dimensions: [], heatScore: 0, engagement: { views: 0, downloads: 0, favorites: 0, comments: 0 }, canRate: false, canViewReviews: false } };
    if (path === "/api/v1/projects/plugin/download1/files" && method === "GET") return { data: { items: [], source: url.searchParams.get("source"), limit: 20, hasMore: false, nextCursor: "", versions: ["1.21"], loaders: ["paper"], providers: {}, warnings: {}, canUpload: true, uploadPermission: "project.file.upload" } };
    if (path === "/api/v1/projects/plugin/download1/files/uploads/presign") { uploads++; started.resolve(); return pending.promise; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/plugins/upload-fixture?tab=downloads`);
    const summary = page.getByText("Upload an on-site release file", { exact: true });
    await summary.click();
    const form = page.locator("details form");
    await form.locator('input[type="file"]').setInputFiles({ name: "fixture.jar", mimeType: "application/java-archive", buffer: Buffer.from("synthetic archive; upload rejected before any storage") });
    await form.getByLabel("Project version", { exact: true }).fill("1.0.0");
    await form.getByRole("button", { name: "Upload file", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(await form.getByLabel("Display name", { exact: true }).isDisabled(), true);
    assert.equal(await form.locator('input[type="file"]').isDisabled(), true);
    pending.resolve({ status: 503, error: "Controlled release upload failure" });
    await form.getByText("Controlled release upload failure", { exact: true }).waitFor();
    assert.equal(uploads, 1);
    assert.equal(await form.getByLabel("Project version", { exact: true }).inputValue(), "1.0.0");
    assert.equal(await form.getByLabel("Display name", { exact: true }).inputValue(), "fixture");
    assert.equal(await form.getByLabel("Display name", { exact: true }).isDisabled(), false);
  } finally { pending.resolve({ status: 503, error: "Controlled release upload failure" }); await browser.close(); }
});

test("OCT02 mod import recovery failures block new uploads and offer a read-only retry", { timeout: 30_000 }, async () => {
  let reads = 0;
  let uploads = 0;
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<APIReply>();
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/mods/fixture-mod/editor") return { data: { uniqueId: "fixturemod", siteId: "fixture-mod", primaryName: "Fixture mod", compatibilities: [] } };
    if (path === "/api/v1/mods/fixture-mod/content-versions") return { data: { items: [{ publicId: "version01", label: "Fixture version", minecraftVersions: ["1.21"], loaders: [], modVersion: "1", status: "active" }] } };
    if (path === "/api/v1/mods/fixture-mod/content-templates" || path === "/api/v1/mods/fixture-mod/content-sections") return { data: { items: [] } };
    if (path === "/api/v1/mods/fixture-mod/export-imports/active") {
      reads++;
      if (reads === 1) { started.resolve(); return pending.promise; }
      return { data: { job: null } };
    }
    if (path.includes("/export-imports/") && method === "POST") { uploads++; return { status: 503, error: "Unexpected new upload" }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01`);
    const input = page.locator('input[accept=".zip,application/zip"]').first();
    await input.waitFor({ state: "attached" });
    await started.promise;
    await page.getByRole("button", { name: "mcmods_exporter", exact: true }).click();
    assert.equal(await input.isDisabled(), true);
    pending.resolve({ status: 503, error: "Controlled recovery read failure" });
    await page.getByText("Controlled recovery read failure", { exact: true }).waitFor();
    assert.equal(await input.isDisabled(), true);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement | null)?.disabled === false);
    assert.equal(reads, 2);
    assert.equal(uploads, 0);
  } finally { pending.resolve({ status: 503, error: "Controlled recovery read failure" }); await browser.close(); }
});

test("OCT02 own-profile language changes keep private settings input without remounting", { timeout: 30_000 }, async () => {
  let profiles = 0;
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/users/test048u1/profile") { profiles++; return { data: { id: "test048u1", username: "Test reviewer", isOwn: true, followers: 0, following: 0, blocked: 0 } }; }
    if (path === "/api/v1/users/test048u1/player-profiles") return { data: { items: [] } };
    if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", secondaryLocale: "", editableLocales: ["en-US", "zh-CN"] } };
    if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "test048u1", username: "Test reviewer", signature: "Original signature", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
    if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
    if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user/test048u1?section=settings`);
    const signature = page.locator("#profile-signature");
    await signature.fill("Unsaved private signature");
    const originalInput = await signature.elementHandle();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await originalInput?.evaluate(node => node.isConnected), true, "Changing UI language must keep the private settings component mounted");
    assert.equal(await signature.inputValue(), "Unsaved private signature");
    assert.equal(profiles, 1);
  } finally { await browser.close(); }
});
