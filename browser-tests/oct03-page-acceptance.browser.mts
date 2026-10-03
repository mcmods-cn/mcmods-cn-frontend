import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const timestamp = "2026-01-02T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
  if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "test048u1", username: "Test reviewer", signature: "Synthetic signature", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
  if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
  if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));

// Actual standalone pages/native browser events; API responses and transport
// faults are deterministic substitutes, not database/OSS/provider validation.
test("FP006 FP010 FP058 asset localization read, UI-language draft retention and pending-write freeze", { timeout: 30_000 }, async () => {
  let contentReads = 0;
  let unread = true;
  const write = Promise.withResolvers<APIReply>();
  const writeStarted = Promise.withResolvers<void>();
  const writes: Array<Record<string, unknown>> = [];
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/review-locks/skin/skin0001") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/skins/skin0001") {
      if (method === "PUT") { writes.push(JSON.parse(body)); writeStarted.resolve(); return write.promise; }
      return { data: { publicId: "skin0001", kind: "skin", model: "default", name: "English original", description: "", tags: [], visibility: "public", reviewStatus: "approved", canEdit: true } };
    }
    if (path === "/api/v1/skins/skin0001/content") {
      contentReads++;
      return unread ? { status: 503, error: "Controlled localization read failure" } : { data: { defaultLocale: "en-US", resolvedLocale: "en-US", available: [
        { locale: "en-US", name: "English original", summary: "Original summary", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true },
        { locale: "zh-CN", name: "中文原稿", summary: "原始描述", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true },
      ] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/skins/skin0001/edit`);
    await page.getByText("Controlled localization read failure", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit changes", exact: true }).count(), 0);
    assert.equal(writes.length, 0);
    unread = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("textbox", { name: "Name (en-US)", exact: true }).fill("Unsaved English name");
    const readCount = contentReads;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const name = page.getByRole("textbox", { name: "名称 (en-US)", exact: true });
    assert.equal(await name.inputValue(), "Unsaved English name");
    assert.equal(contentReads, readCount, "UI locale must not replace an already-read content snapshot");
    const submit = page.locator("header button.button-primary");
    await submit.click();
    await writeStarted.promise;
    assert.equal(await name.isDisabled(), true);
    assert.equal(await submit.isDisabled(), true);
    await submit.evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].name, "Unsaved English name");
    assert.deepEqual((writes[0].localizations as Array<{locale:string; name:string}>).map(item => [item.locale, item.name]), [["en-US", "Unsaved English name"], ["zh-CN", "中文原稿"]]);
    write.resolve({ status: 503, error: "Controlled asset write failure" });
    await page.getByText("Controlled asset write failure", { exact: true }).waitFor();
    assert.equal(await name.inputValue(), "Unsaved English name");
    assert.equal(await name.isDisabled(), false);
  } finally { write.resolve({ data: {} }); await browser.close(); }
});

test("FP009 BUG127 follows cursor deduplication, filter cancellation and mutation recovery", { timeout: 30_000 }, async () => {
  const oldPage = Promise.withResolvers<APIReply>();
  const oldStarted = Promise.withResolvers<void>();
  const paths: string[] = [];
  let failDelete = true;
  let deletes = 0;
  const item = (id: string, name: string) => ({ id, name, type: "mod", url: `/mods/${id}`, notificationsEnabled: true, createdAt: timestamp, updatedAt: timestamp });
  const browser = await controlled(({ path, method, url, body }) => {
    if (path === "/api/v1/users/me/project-follows") {
      paths.push(url.search);
      assert.equal(url.searchParams.get("limit"), "40");
      assert.equal(url.searchParams.has("offset"), false);
      if (url.searchParams.get("cursor") === "old-next") { oldStarted.resolve(); return oldPage.promise; }
      if (url.searchParams.get("q") === "new filter") return { data: { items: [item("new-project", "New matching project")], hasMore: false, nextCursor: "", limit: 40 } };
      if (url.searchParams.get("cursor") === "page-two") return { data: { items: [item("first-project", "First project"), item("second-project", "Second project")], hasMore: true, nextCursor: "old-next", limit: 40 } };
      return { data: { items: [item("first-project", "First project")], hasMore: true, nextCursor: "page-two", limit: 40 } };
    }
    if (path === "/api/v1/projects/new-project/follow") {
      if (method === "PATCH") { assert.deepEqual(JSON.parse(body), { notificationsEnabled: false }); return { data: { following: true, notificationsEnabled: true } }; }
      assert.equal(method, "DELETE"); deletes++;
      return failDelete ? { status: 503, error: "Controlled unfollow failure" } : { data: {} };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=project-follows`);
    await page.getByRole("link", { name: "First project", exact: true }).waitFor();
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    await page.getByRole("link", { name: "Second project", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "First project", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    await oldStarted.promise;
    await page.getByRole("searchbox").fill("new filter");
    await page.getByRole("link", { name: "New matching project", exact: true }).waitFor();
    oldPage.resolve({ data: { items: [item("late-project", "Late stale project")], hasMore: false, nextCursor: "", limit: 40 } });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("link", { name: "Late stale project", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "First project", exact: true }).count(), 0);
    const row = page.locator("article").filter({ has: page.getByRole("link", { name: "New matching project", exact: true }) });
    const authoritativeResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/projects/new-project/follow" && response.request().method() === "PATCH");
    await row.getByRole("checkbox").click();
    await authoritativeResponse;
    await page.waitForFunction(() => (document.querySelector("article input[type=checkbox]") as HTMLInputElement)?.checked === true);
    await row.getByRole("button", { name: "Unfollow", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Controlled unfollow failure" }).waitFor();
    assert.equal(await row.count(), 1);
    failDelete = false;
    await row.getByRole("button", { name: "Unfollow", exact: true }).click();
    await row.waitFor({ state: "detached" });
    assert.equal(deletes, 2);
    assert(paths.some(path => path.includes("cursor=page-two")));
    assert(paths.some(path => path.includes("q=new+filter")));
  } finally { oldPage.resolve({ data: { items: [], hasMore: false, nextCursor: "" } }); await browser.close(); }
});

test("FP049 contribution dates remain UTC calendar dates in negative and positive browser time zones", { timeout: 30_000 }, async () => {
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/users/test048u1/showcase") return { data: { claimedAuthors: [], developerProjects: [], editorProjects: [], uploads: [], posts: [], contributions: { year: 2025, from: "2025-01-01", to: "2025-12-31", total: 3, days: [{ date: "2025-01-02", count: 3 }], years: [2025], recentActivity: [], recentActivityTruncated: false } } };
    if (path === "/api/v1/users/test048u1/favorite-collections") return { data: { items: [], hasMore: false, nextCursor: "", limit: 50 } };
  });
  try {
    const { page } = browser;
    const session = await page.context().newCDPSession(page);
    for (const timezoneId of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
      await session.send("Emulation.setTimezoneOverride", { timezoneId });
      await page.goto(`${fixture.origin}/user?section=overview`);
      const day = page.getByRole("button", { name: "Jan 2, 2025: 3 contributions", exact: true });
      await day.waitFor();
      assert.equal(await day.getAttribute("title"), "Jan 2, 2025: 3 contributions");
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      await page.getByRole("button", { name: "2025年1月2日：3 次贡献", exact: true }).waitFor();
      await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en-US");
    }
    await session.detach();
  } finally { await browser.close(); }
});

test("FP022 FP023 metrics survive denied storage, deduplicate views and format the selected locale", { timeout: 30_000 }, async () => {
  let views = 0;
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/mods/fixture-mod/content-resources/resource01") return { data: { entityId: "resource01", kindCode: "minecraft.item", canonicalId: "fixture:item", capabilities: { editResource: false }, versions: [], details: [] } };
    if (path === "/api/v1/content-metrics/resource01/view") { assert.equal(method, "POST"); views++; return { data: {} }; }
    if (path === "/api/v1/content-metrics/resource01") return { data: { id: "resource01", type: "mod_resource", createdAt: timestamp, editCount: 1234, directViews: 1234567, childViews: 0, totalViews: 1234567, recentEditors: [], editors: [], developers: [], tutorials: [], issues: [], news: [], discussions: [], statisticsAsOf: timestamp, includesChildren: false } };
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => {
      const nativeGet = Storage.prototype.getItem;
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (this === sessionStorage) throw new DOMException("Synthetic denied session storage", "SecurityError"); return nativeGet.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (this === sessionStorage) throw new DOMException("Synthetic denied session storage", "SecurityError"); return nativeSet.call(this, key, value); };
    });
    await page.goto(`${fixture.origin}/mods/fixture-mod/resources/resource01`);
    const metrics = page.getByRole("heading", { name: "Content statistics", exact: true }).locator("xpath=ancestor::section[1]");
    await metrics.waitFor();
    assert.equal(await metrics.getByText("1,234,567", { exact: true }).count(), 1);
    assert.equal(views, 1);
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("de-DE");
    await page.waitForFunction(() => document.documentElement.lang === "de-DE");
    await page.getByText("1.234.567", { exact: true }).waitFor();
    assert.equal(views, 1, "changing the display language must not bill/record a second page view");
    assert.equal(await page.locator("body").innerText().then(value => value.includes("contentMetrics.")), false);
    await page.locator("select[aria-label]").selectOption("zh-CN");
    await page.getByRole("heading", { name: "资料统计", exact: true }).waitFor();
    assert.equal(views, 1);
  } finally { await browser.close(); }
});

test("FP060 FP058 template slots can be created and moved by keyboard while writes freeze all controls", { timeout: 30_000 }, async () => {
  const write = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const writes: Array<Record<string, unknown>> = [];
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/recipe-templates/template1") {
      if (method === "PUT") { writes.push(JSON.parse(body)); started.resolve(); return write.promise; }
      return { data: { publicId: "template1", recipeTypePublicId: "recipetype1", templateKey: "keyboard_template", defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Keyboard template", summary: "", contentMarkdown: "", provenance: "human", reviewStatus: "approved" }], canvas: { width: 176, height: 166, imageScale: 1 }, definition: { protectedExtension: { a: [1, 2] } }, slots: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?editor=template-edit&publicId=recipetype1&templatePublicId=template1`);
    await page.getByLabel("Template key", { exact: true }).waitFor();
    const add = page.getByRole("button", { name: "Add · Input", exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    const slot = page.getByRole("application", { name: "Visual canvas", exact: true }).getByRole("button");
    assert.equal(await slot.count(), 1);
    const beforeX = Number(await page.getByLabel("X", { exact: true }).inputValue());
    await slot.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(Number(await page.getByLabel("X", { exact: true }).inputValue()), beforeX + 1);
    await page.getByRole("button", { name: "Output", exact: true }).click();
    await page.getByRole("button", { name: "Add · Output", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Catalyst", exact: true }).click();
    await page.getByRole("button", { name: "Add · Catalyst", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await slot.count(), 3);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await started.promise;
    assert.equal(await page.getByLabel("Template key", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Add · Catalyst", exact: true }).isDisabled(), true);
    await page.locator("fieldset button.button-primary").last().evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
    assert.equal(writes.length, 1);
    assert.deepEqual((writes[0].slots as Array<{role:string}>).map(item => item.role), ["input", "output", "catalyst"]);
    assert.deepEqual(writes[0].definition, { protectedExtension: { a: [1, 2] } });
    write.resolve({ status: 503, error: "Controlled template write failure" });
    await page.getByText("Controlled template write failure", { exact: true }).waitFor();
    assert.equal(await slot.count(), 3);
    assert.equal(await page.getByLabel("Template key", { exact: true }).inputValue(), "keyboard_template");
  } finally { write.resolve({ data: {} }); await browser.close(); }
});

test("BUG047 conversation switches reject late initial and older-page bodies within one account", { timeout: 40_000 }, async () => {
  for (const mode of ["initial", "older"] as const) {
    const held = Promise.withResolvers<APIReply>();
    const started = Promise.withResolvers<void>();
    const message = (id: string, conversationId: string, body: string) => ({ id, conversationId, body, senderId: "partner-b", recipientId: "test048u1", createdAt: timestamp });
    const browser = await controlled(({ path, method, url }) => {
      if (path === "/api/v1/notifications") return { data: { items: [], hasMore: false, nextCursor: "", limit: 50 } };
      if (path === "/api/v1/messages/conversations") return { data: { items: ["a", "b"].map(name => ({ id: `conv-${name}`, partnerId: `partner-${name}`, username: `Partner ${name.toUpperCase()}`, avatarUrl: "", onlineStatus: "offline", lastMessage: "Preview", unreadCount: 0, canMessage: true })), hasMore: false, nextCursor: "", limit: 30 } };
      if (method === "PUT" && path.endsWith("/presence")) return { data: { online: true } };
      if (path === "/api/v1/messages/conversations/conv-a" && method === "GET") {
        assert.equal(url.searchParams.get("limit"), "100");
        if (mode === "initial" || url.searchParams.has("cursor")) { started.resolve(); return held.promise; }
        return { data: { items: [message("a1", "conv-a", "A current body")], hasMore: true, nextCursor: "older-a", limit: 100 } };
      }
      if (path === "/api/v1/messages/conversations/conv-b" && method === "GET") return { data: { items: [message("b1", "conv-b", "B current body")], hasMore: false, nextCursor: "", limit: 100 } };
    });
    try {
      const { page } = browser;
      await page.addInitScript(() => {
        const fetchNative = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (url.includes("/messages/conversations/conv-a?")) {
            const options = { ...init }; delete options.signal;
            return fetchNative(input, options); // An already-dispatched transport completes after cancellation.
          }
          return fetchNative(input, init);
        };
      });
      await page.goto(`${fixture.origin}/messages`);
      await page.getByRole("button", { name: "Private chats", exact: true }).click();
      await page.getByRole("button", { name: /Partner A/ }).click();
      if (mode === "older") {
        await page.getByText("A current body", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Load older messages", exact: true }).click();
      }
      await started.promise;
      await page.getByRole("button", { name: /Partner B/ }).click();
      await page.getByText("B current body", { exact: true }).waitFor();
      const completed = page.waitForResponse(response => response.url().includes("/conv-a?"));
      held.resolve({ data: { items: [message("late-a", "conv-a", "Late A private body")], hasMore: false, nextCursor: "", limit: 100 } });
      await (await completed).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.getByText("Late A private body", { exact: true }).count(), 0);
      assert.equal(await page.getByText("A current body", { exact: true }).count(), 0);
      assert.equal(await page.getByText("B current body", { exact: true }).count(), 1);
      assert.equal(await page.getByPlaceholder("Write a private message").inputValue(), "");
    } finally { held.resolve({ data: { items: [], hasMore: false, nextCursor: "" } }); await browser.close(); }
  }
});
