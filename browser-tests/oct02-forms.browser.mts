import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { navigateAdminPanel, ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
// MarkdownRenderer fetches its existing location and sticker catalogs even
// with an empty document. Keep these unrelated providers explicit.
const markdownProviders: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
};
const formPage = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? markdownProviders(request));

before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

// These run the real production React UI with explicit API fixtures. They
// verify form recovery and browser behavior, not database persistence.
test("OCT02 changelog keeps edits after clearing its time and switching UI locale", { timeout: 30_000 }, async () => {
  const submissions: Array<{ eventAt: string; projectVersion: string }> = [];
  const target = { type: "mod", id: "oct02mod1", name: "Fixture mod", url: "/mods/fixture-mod", canEdit: true };
  const browser = await formPage(({ path, method, body }) => {
    if (path === "/api/v1/changelogs/oct02log1") {
      if (method === "PUT") {
        submissions.push(JSON.parse(body));
        return { status: 503, code: "SERVICE_UNAVAILABLE", error: "Temporary test failure" };
      }
      return { data: { target, item: { id: "oct02log1", eventAt: "2026-10-02T01:00:00Z", minecraftVersions: ["1.21"], projectVersion: "original", defaultLocale: "en-US", localizations: [{ locale: "en-US", bodyMarkdown: "Original changelog body" }] } } };
    }
    if (path === "/api/v1/changelogs") return { data: { target, categories: [], items: [], limit: 20, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/review-locks/project_changelog/oct02log1") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
    if (path === "/api/v1/markdown/config") return { data: {} };
    if (path === "/api/v1/users/me/drafts" && method === "POST") return { data: { updatedAt: "2026-10-02T01:00:00Z" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/changelogs/oct02log1/edit`);
    await page.getByRole("heading", { name: "Edit changelog entry", exact: true }).waitFor();
    const projectVersion = page.getByLabel("Mod / project version", { exact: true });
    await projectVersion.fill("unsaved-user-edit");
    const time = page.locator('input[type="datetime-local"]');
    await time.fill("");
    assert.equal(await projectVersion.inputValue(), "unsaved-user-edit");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("alert").getByText("Enter an update time, project version, Minecraft version, and body in the default language.", { exact: true }).waitFor();
    assert.equal(submissions.length, 0);
    await time.fill("2026-10-02T09:15");
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/changelogs" && response.request().method() === "GET");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await refreshed;
    assert.equal(await page.locator('input[maxlength="120"]').inputValue(), "unsaved-user-edit");
    assert.equal(await time.inputValue(), "2026-10-02T09:15");
    await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en-US");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Temporary test failure" }).waitFor();
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].projectVersion, "unsaved-user-edit");
    assert.equal(submissions[0].eventAt, new Date("2026-10-02T09:15").toISOString());
    assert.equal(await projectVersion.inputValue(), "unsaved-user-edit");
  } finally { await browser.close(); }
});

test("OCT02 theme works with blocked browser storage and a persisted dark preference", { timeout: 30_000 }, async () => {
  for (const denyStorage of [false, true]) {
    const browser = await formPage(() => undefined);
    try {
      await browser.page.context().addInitScript((blocked) => {
        if (blocked) {
          Storage.prototype.getItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
          Storage.prototype.setItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
        } else localStorage.setItem("mcmods-theme", "dark");
      }, denyStorage);
      await browser.page.goto(`${fixture.origin}/login`);
      const toggle = browser.page.getByRole("button", { name: "Toggle theme", exact: true });
      await toggle.waitFor();
      await browser.page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, !denyStorage);
      await toggle.click();
      await browser.page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, denyStorage);
    } finally { await browser.close(); }
  }
});

test("OCT02 mobile visitors can switch language and theme through the keyboard", { timeout: 30_000 }, async () => {
  const browser = await formPage(() => undefined);
  try {
    const { page } = browser;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.origin}/login`);
    const settings = page.locator("header details summary");
    await settings.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const wasDark = await page.locator("html").evaluate(element => element.classList.contains("dark"));
    await page.locator("header details button").click();
    await page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, !wasDark);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await browser.close(); }
});

test("OCT02 guest project editors offer login instead of remaining in loading state", { timeout: 30_000 }, async () => {
  for (const path of ["/mods/fixture-mod/edit", "/modpacks/fixture-pack/edit", "/plugins/fixture-plugin/edit"]) {
    const browser = await formPage(({ path }) => {
      if (path === "/api/v1/auth/me") return { status: 401, error: "Not authenticated" };
      if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
    });
    try {
      await browser.page.goto(`${fixture.origin}${path}`);
      await browser.page.getByRole("heading", { name: "Sign in required", exact: true }).waitFor();
      const href = await browser.page.locator('a[href^="/login?next="]').last().getAttribute("href");
      assert.equal(new URL(href!, fixture.origin).searchParams.get("next"), path);
    } finally { await browser.close(); }
  }
});

test("OCT02 project edits survive UI language changes without refetching the draft", { timeout: 30_000 }, async () => {
  for (const kind of ["mod", "modpack", "plugin"] as const) {
    const collection = kind === "mod" ? "mods" : kind === "modpack" ? "modpacks" : "plugins";
    const endpoint = kind === "plugin" ? "/api/v1/content-projects/plugin/fixture-project/editor" : `/api/v1/${collection}/fixture-project/editor`;
    let loads = 0;
    const browser = await formPage(({ path }) => {
      if (path === endpoint) {
        loads++;
        return { data: {
          id: "oct02prj1", uniqueId: "oct02prj1", siteId: "fixture-project", primaryName: "Original project", secondaryName: "", abbreviation: "", summary: "", defaultLocale: "en-US", environment: "bothRequired", primaryCategory: "utility", officialStatus: "active", sourceStatus: "open", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "", iconUrl: "", bodyMarkdown: "", submissionMethod: "manual", publishedRevisionId: "oct02rev1",
          localizations: [{ locale: "en-US", name: "Original project", summary: "", bodyMarkdown: "", contentMarkdown: "" }], modIds: [{ identifier: "fixture", primary: true, minecraftVersions: [] }], compatibilities: [], tags: [], searchKeywords: [], authors: [], links: [], relationshipGroups: [], galleryImages: [], mods: [], parentProjects: [], minecraftVersions: [], loaders: [], categories: [], features: [], resolution: "16x", performance: "low", mapSize: "small", projectType: "plugin",
        } };
      }
      if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
      if (path === "/api/v1/creator-roles") return { data: { items: [] } };
      if (path === "/api/v1/markdown/config") return { data: {} };
      if (path === `/api/v1/review-locks/${kind}/oct02prj1`) return { data: { locked: false, subscribed: false, canSubscribe: false } };
      if (path === "/api/v1/users/me/drafts") return { data: { updatedAt: "2026-10-02T01:00:00Z" } };
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/${collection}/fixture-project/edit`);
      const abbreviation = page.locator('input[maxlength="32"]');
      await abbreviation.fill("UNSAVED");
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      await page.waitForLoadState("networkidle");
      assert.equal(await abbreviation.inputValue(), "UNSAVED");
      assert.equal(loads, 1, "UI language changes must not initialize the edit draft again");
    } finally { await browser.close(); }
  }
});


test("OCT02 catalog keeps the newest search result and nested keyboard actions", { timeout: 30_000 }, async () => {
  let releaseSlow: () => void = () => {};
  let slowStarted: () => void = () => {};
  const slowStart = new Promise<void>((resolve) => { slowStarted = resolve; });
  const slowResponse = new Promise<void>((resolve) => { releaseSlow = resolve; });
  const card = (name: string) => ({
    id: "oct02cat1", siteId: "fixture-plugin", projectType: "plugin", defaultLocale: "en-US",
    localizations: [{ locale: "en-US", name, summary: "Fixture summary", bodyMarkdown: "" }],
    abbreviation: "", minecraftVersions: [], loaders: [], categories: [], features: [], parentProjects: [], authors: [],
    officialStatus: "active", sourceStatus: "open", license: "MIT", updatedAt: "2026-10-02T01:00:00Z",
  });
  const browser = await formPage(async ({ path, url }) => {
    if (path === "/api/v1/content-projects/plugin") {
      const query = url.searchParams.get("q") || "";
      if (query === "slow") { slowStarted(); await slowResponse; }
      return { data: { items: [card(query === "new" ? "New result" : query === "slow" ? "Stale result" : "Initial result")], total: 1 } };
    }
    if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
  });
  try {
    await browser.page.context().addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator.clipboard, "writeText", { value: async () => {}, configurable: true });
    });
    const { page } = browser;
    await page.goto(`${fixture.origin}/plugins`);
    await page.getByRole("heading", { name: "Initial result", exact: true }).waitFor();
    const search = page.getByRole("searchbox");
    await search.fill("slow");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await slowStart;
    await search.fill("new");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("heading", { name: "New result", exact: true }).waitFor();
    releaseSlow();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.getByRole("heading", { name: "Stale result", exact: true }).count(), 0);
    const share = page.getByRole("button", { name: "Share", exact: true });
    await share.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("status").getByText("Project link copied", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/plugins");
  } finally { releaseSlow(); await browser.close(); }
});


test("OCT02 favorite collection delete preserves cancellation, defaults and failed data", { timeout: 30_000 }, async () => {
  let deletions = 0;
  let shouldFail = true;
  let collections = [
    { id: "oct02fav1", name: "Default", isDefault: true, isPublic: false },
    { id: "oct02fav2", name: "Custom collection", isDefault: false, isPublic: false },
  ];
  const browser = await formPage(({ path, method }) => {
    if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "oct02user", username: "Fixture User", signature: "", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
    if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
    if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
    if (path === "/api/v1/users/me/favorite-collections") return { data: { items: collections, hasMore: false, nextCursor: "", limit: 20 } };
    if (/^\/api\/v1\/users\/me\/favorite-collections\/[^/]+\/items$/.test(path)) return { data: { items: [], hasMore: false, nextCursor: "", limit: 20 } };
    if (path === "/api/v1/users/me/favorite-collections/oct02fav2" && method === "DELETE") {
      deletions++;
      if (shouldFail) return { status: 503, error: "Delete temporarily unavailable" };
      collections = collections.filter(collection => collection.id !== "oct02fav2");
      return { data: { deleted: true } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=favorites`);
    const collectionRow = page.locator("aside > div").filter({ has: page.getByText("Custom collection", { exact: true }) });
    const remove = collectionRow.getByRole("button", { name: "Delete", exact: true });
    await remove.waitFor();
    assert.equal(await page.getByRole("button", { name: "Delete", exact: true }).count(), 1, "default collection has no deletion action");
    page.once("dialog", dialog => dialog.dismiss());
    await remove.click();
    assert.equal(deletions, 0);
    page.once("dialog", dialog => dialog.accept());
    await remove.click();
    await page.getByRole("status").getByText("Delete temporarily unavailable", { exact: true }).waitFor();
    assert.equal(deletions, 1);
    assert.equal(await remove.isEnabled(), true);
    shouldFail = false;
    page.once("dialog", dialog => dialog.accept());
    await remove.click();
    await page.waitForFunction(() => !document.querySelector("aside")?.textContent?.includes("Custom collection"));
    assert.equal(deletions, 2);
  } finally { await browser.close(); }
});


test("OCT02 standalone Markdown preserves edits on UI locale switches", { timeout: 30_000 }, async () => {
  let loads = 0;
  const browser = await formPage(({ path, method }) => {
    if (path === "/api/v1/markdown/config") return { data: {} };
    if (path === "/api/v1/users/me/markdown-playground") {
      if (method === "GET") { loads++; return { data: { content: "Saved server draft", revision: 1 } }; }
      return { data: { clientSequence: 1, revision: 2, updatedAt: "2026-10-02T01:00:00Z" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/playground`);
    const editor = page.getByRole("textbox", { name: "Editor", exact: true });
    await editor.waitFor();
    await page.waitForFunction(() => document.querySelector("textarea")?.value === "Saved server draft");
    await editor.fill("Unsaved user content");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await page.locator("textarea").inputValue(), "Unsaved user content");
    assert.equal(loads, 1);
  } finally { await browser.close(); }
});

test("OCT02 guest Markdown explains temporary retention when persistence is denied", { timeout: 30_000 }, async () => {
  const browser = await formPage(({ path }) => {
    if (path === "/api/v1/auth/me") return { status: 401, error: "Not authenticated" };
    if (path === "/api/v1/markdown/config") return { data: {} };
  });
  try {
    await browser.page.context().addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
      Storage.prototype.setItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
    });
    await browser.page.goto(`${fixture.origin}/tools/playground`);
    const editor = browser.page.locator("textarea");
    await editor.fill("Temporary unsaved content");
    const save = browser.page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await browser.page.getByRole("status").getByText("This content is kept in the current tab. Your browser blocks persistent storage; closing or refreshing this page may lose it.", { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), "Temporary unsaved content");
  } finally { await browser.close(); }
});

test("OCT02 admin request budgets distinguish unknown usage from settled costs", { timeout: 30_000 }, async () => {
  const browser = await formPage(({ path }) => {
    if (path === "/api/v1/admin/ai/stats") return { data: { byStatus: [], byProvider: [], requestBudget: [
      { provider: "fixture", model: "unknown-model", state: "usage_unknown", requests: 2, input_tokens: 0, output_tokens: 0, cost_micros: 0, reserved_tokens: 1500, reserved_cost_micros: 250000 },
      { provider: "fixture", model: "settled-model", state: "settled", requests: 1, input_tokens: 100, output_tokens: 200, cost_micros: 50000, reserved_tokens: 0, reserved_cost_micros: 0 },
    ] } };
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "AI cost statistics", "AI");
    const unknown = page.getByRole("row").filter({ hasText: "unknown-model" });
    await unknown.waitFor();
    assert.equal(await unknown.getByText("Actual usage unknown", { exact: true }).count(), 3);
    assert.match(await unknown.innerText(), /1,500/);
    assert.match(await unknown.innerText(), /0\.250000/);
    const settled = page.getByRole("row").filter({ hasText: "settled-model" });
    assert.match(await settled.innerText(), /100 \/ 200/);
    assert.match(await settled.innerText(), /0\.050000/);
  } finally { await browser.close(); }
});


test("OCT02 guest catalog favorites use one identity and remain usable with denied storage", { timeout: 30_000 }, async () => {
  const browser = await formPage(({ path }) => {
    if (path === "/api/v1/auth/me") return { status: 401, error: "Not authenticated" };
    if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
    if (path === "/api/v1/mods") return { data: { total: 1, items: [{
      id: "oct02favmod", uniqueId: "oct02favmod", siteId: "favorite-fixture", primaryName: "Favorite fixture", secondaryName: "", abbreviation: "FFF", summary: "Synthetic catalog card", defaultLocale: "en-US", environment: "bothRequired", primaryCategory: "utility", officialStatus: "active", sourceStatus: "open", license: "MIT", createdAt: "2026-10-02T01:00:00Z", updatedAt: "2026-10-02T01:00:00Z", reviewStatus: "approved", iconUrl: "", modrinthProjectId: "", curseforgeProjectId: "", tags: [], authors: [], compatibilities: [], minecraftVersions: [], modIds: [], galleryImages: [], relationshipGroups: [], links: [],
    }] } };
  });
  try {
    const { page } = browser;
    await page.context().addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
      Storage.prototype.setItem = () => { throw new DOMException("Test storage policy", "SecurityError"); };
    });
    await page.goto(`${fixture.origin}/mods`);
    const favorite = page.getByRole("button", { name: "Favorite", exact: true });
    await favorite.waitFor();
    await favorite.focus();
    await page.keyboard.press("Enter");
    const selected = page.getByRole("button", { name: "Favorited", exact: true });
    await selected.waitFor();
    assert.equal(await selected.getAttribute("aria-pressed"), "true");
    assert.equal(new URL(page.url()).pathname, "/mods");
    await selected.click();
    assert.equal(await favorite.getAttribute("aria-pressed"), "false");
  } finally { await browser.close(); }
});


test("OCT02 a late community translation cannot replace a newly selected target language", { timeout: 30_000 }, async () => {
  let languageLoads = 0;
  let releaseOld: () => void = () => {};
  let oldStarted: () => void = () => {};
  const oldStart = new Promise<void>((resolve) => { oldStarted = resolve; });
  const oldResult = new Promise<void>((resolve) => { releaseOld = resolve; });
  const targets: string[] = [];
  const browser = await formPage(async ({ path, method, body }) => {
    if (path === "/api/v1/community/posts/oct02post") return { data: { id: "oct02post", kind: "tutorial", title: "Original article", sourceLocale: "en-US", bodyMarkdown: "Original content", category: "general", minecraftVersions: [], authorId: "oct02author", authorName: "Fixture author", reviewStatus: "approved", projects: [], resources: [], createdAt: "2026-10-02T01:00:00Z", updatedAt: "2026-10-02T01:00:00Z", canEdit: true, canResolve: false } };
    if (path === "/api/v1/users/me/content-languages") {
      languageLoads++;
      return { data: { primaryLocale: languageLoads === 1 ? "zh-CN" : "fr-FR", secondaryLocale: "en-US", editableLocales: ["en-US", "zh-CN", "fr-FR"] } };
    }
    if (path === "/api/v1/projects/oct02post/follow") return { data: { followed: false, notificationsEnabled: true } };
    if (path === "/api/v1/review-locks/community_post/oct02post") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/comment-targets/community_post/oct02post/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === "/api/v1/anti-abuse/form-token") return { data: { token: "oct02form", fieldName: "contact_reference", expiresAt: "2099-10-02T01:00:00Z" } };
    if (path === "/api/v1/community/posts/oct02post/translations" && method === "POST") {
      const target = JSON.parse(body).targetLocale;
      targets.push(target);
      return target === "zh-CN" ? { data: { taskId: "oct02task", status: "running" } } : { data: { translation: { title: "Translated into French", bodyMarkdown: "French fixture body" } } };
    }
    if (path === "/api/v1/community/translations/oct02task") {
      oldStarted(); await oldResult;
      return { data: { status: "completed", translation: { title: "Late Chinese result", bodyMarkdown: "Late Chinese fixture body" } } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tutorials/oct02post`);
    await page.getByRole("heading", { name: "Original article", exact: true }).waitFor();
    const translationAction = page.locator("article > header button").first();
    await translationAction.click();
    await oldStart;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fr-FR");
    await page.waitForFunction(() => document.documentElement.lang === "fr-FR");
    await translationAction.click();
    await page.getByRole("heading", { name: "Translated into French", exact: true }).waitFor();
    releaseOld();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(targets, ["zh-CN", "fr-FR"]);
    assert.equal(await page.getByRole("heading", { name: "Late Chinese result", exact: true }).count(), 0);
  } finally { releaseOld(); await browser.close(); }
});

test("OCT02 community edit waits for its original record and supports an explicit retry", { timeout: 30_000 }, async () => {
  let loads = 0;
  let writes = 0;
  const browser = await formPage(({ path, method }) => {
    if (path === "/api/v1/community/posts/oct02edit") {
      if (method !== "GET") { writes++; return { status: 503, error: "Temporary test failure" }; }
      loads++;
      if (loads === 1) return { status: 503, code: "SERVICE_UNAVAILABLE", error: "Original record is unavailable" };
      return { data: { id: "oct02edit", kind: "news", category: "site", title: "Existing news draft", sourceLocale: "en-US", bodyMarkdown: "Existing protected body", publishedRevisionId: "oct02rev", coverFileId: "", coverUrl: "", minecraftVersions: [], projects: [], resources: [] } };
    }
    if (path === "/api/v1/community/post-categories") return { data: { kind: "news", items: ["site"] } };
    if (path === "/api/v1/review-locks/community_post/oct02edit") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/markdown/config") return { data: {} };
    if (path === "/api/v1/users/me/drafts") return { data: { items: [] } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/news/oct02edit/edit`);
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0);
    assert.equal(writes, 0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), "Existing news draft");
    assert.equal(await page.getByLabel("Content", { exact: true }).inputValue(), "Existing protected body");
    assert.equal(loads, 2);
    assert.equal(writes, 0);
  } catch (error) {
    console.error("Synthetic community editor recovery", { loads, writes, path: new URL(browser.page.url()).pathname, visible: await browser.page.locator("main").allTextContents() });
    throw error;
  } finally { await browser.close(); }
});

test("OCT02 expired login stops showing a previously loaded private player profile", { timeout: 30_000 }, async () => {
  let expired = false;
  const browser = await formPage(({ path }) => {
    if (path === "/api/v1/player-profiles/oct02private") {
      if (expired) return { status: 404, code: "PLAYER_PROFILE_NOT_FOUND", error: "Profile is not visible" };
      return { data: { publicId: "oct02private", uuid: "00000000-0000-4000-8000-000000000001", name: "Private synthetic profile", bio: "Synthetic private biography", visibility: "private", isDefault: true, owner: { id: "test048u1", username: "Test reviewer" }, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" } };
    }
    if (path === "/api/v1/comment-targets/player_profile/oct02private/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/players/oct02private`);
    await page.getByRole("heading", { name: "Private synthetic profile", exact: true }).waitFor();
    expired = true;
    await page.evaluate(() => window.dispatchEvent(new Event("mcmods-auth-expired")));
    await page.getByText("Profile is not visible", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Private synthetic profile", exact: true }).count(), 0);
    assert.equal(await page.getByText("Synthetic private biography", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});
