import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-01-02T00:00:00Z";
const controlled = (handler: APIHandler) => fixture.page(handler);
async function panel(page: Page, name: string, group: string) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="workbench"]').waitFor();
  if (await page.locator(`[data-admin-panel="${name}"]`).count() === 0) await page.locator(`[data-admin-group="${group}"]`).click();
  await page.locator(`[data-admin-panel="${name}"]`).click();
}

// Production admin screens. Explicit API fixture substitutes do not prove
// permission enforcement, live data correctness or database persistence.
test("TEST047 OCT03-FP001 unresolved reference types retry without resetting filters and repeated searches reject late responses", { timeout: 30_000 }, async () => {
  const types = ["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack", "addon", "community_post", "user", "tag", "recipe_type", "minecraft_server", "skin"];
  let typeReads = 0;
  let searches = 0;
  let listFails = true;
  const old = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const row = (id: string, rawIdentifier: string) => ({ id, rawIdentifier, referenceType: "mod", sourceType: "mod_relationship", sourceId: "synthetic-internal", sourcePublicId: "publicmod01", sourceLabel: "Synthetic source", fieldPath: "relations[0].identifier", status: "pending", createdAt: stamp });
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/admin/unresolved-reference-types") {
      if (++typeReads === 1) return { status: 503, error: "Controlled reference types failure" };
      return { data: { items: types } };
    }
    if (path === "/api/v1/admin/unresolved-references") {
      assert.equal(url.searchParams.get("limit"), "50");
      assert.equal(url.searchParams.has("offset"), false);
      if (listFails) return { status: 503, error: "Controlled reference list failure" };
      if (url.searchParams.get("q") === "same-query") {
        if (++searches === 1) { started.resolve(); return old.promise; }
        return { data: { items: [row("current", "Current matching identifier")], limit: 50, hasMore: false, nextCursor: "" } };
      }
      return { data: { items: [row("first", "Initial identifier")], limit: 50, hasMore: false, nextCursor: "" } };
    }
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => {
      const fetchNative = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/admin/unresolved-references?") && url.includes("q=same-query")) { const options = { ...init }; delete options.signal; return fetchNative(input, options); }
        return fetchNative(input, init);
      };
    });
    await panel(page, "unresolved-references", "content");
    await page.getByRole("alert").filter({ hasText: "Controlled reference types failure" }).waitFor();
    await page.getByRole("searchbox").fill("preserved-filter");
    assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 1, "failed type discovery needs an explicit retry entry point");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('select option[value="skin"]').length === 1);
    assert.equal(typeReads, 2);
    assert.equal(await page.getByRole("searchbox").inputValue(), "preserved-filter");
    const typeSelect = page.locator('select:has(option[value="recipe_type"])');
    assert.equal(await typeSelect.locator("option").count(), 15);
    listFails = false;
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Initial identifier", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Synthetic source", exact: true }).getAttribute("href"), "/publicmod01");
    await page.getByText("mod_relationship · publicmod01 · relations[0].identifier", { exact: true }).waitFor();
    await page.getByRole("searchbox").fill("same-query");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await started.promise;
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Current matching identifier", { exact: true }).waitFor();
    const returned = page.waitForResponse(response => response.url().includes("q=same-query"));
    old.resolve({ data: { items: [row("stale", "Late stale identifier")], limit: 50, hasMore: false, nextCursor: "" } });
    await (await returned).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText("Late stale identifier", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Current matching identifier", { exact: true }).count(), 1);
    assert.equal(searches, 2);
  } finally { old.resolve({ data: { items: [], hasMore: false, nextCursor: "", limit: 50 } }); await browser.close(); }
});

test("BUG138 PERF036 project workbench keyset pages and target/range validation reject mismatched analytics", { timeout: 30_000 }, async () => {
  const held = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  let bReads = 0;
  const cursors: string[] = [];
  const project = (id: string) => ({ id, type: "mod", name: `Project ${id}`, url: `/mods/${id}`, reviewStatus: "approved", views: 20, editCount: 1, heat: 5, rating: 4, favorites: 2, comments: 3, downloads: 1, createdAt: stamp, updatedAt: stamp });
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/admin/dashboard/projects") {
      assert.equal(url.searchParams.get("limit"), "40");
      assert.equal(url.searchParams.has("offset"), false);
      const cursor = url.searchParams.get("cursor") || ""; cursors.push(cursor);
      return { data: { items: cursor ? [project("b")] : [project("a")], limit: 40, hasMore: !cursor, nextCursor: cursor ? "" : "project-next" } };
    }
    if (path === "/api/v1/admin/dashboard/projects/a") { started.resolve(); return held.promise; }
    if (path === "/api/v1/admin/dashboard/projects/b") {
      bReads++;
      if (bReads === 1) return { data: { project: project("wrong"), days: 30, trend: [] } };
      if (bReads === 3) return { data: { project: project("b"), days: 30, trend: [] } }; // wrong requested range
      if (bReads === 4) return { status: 503, error: "Controlled analytics unavailable" };
      return { data: { project: project("b"), days: Number(url.searchParams.get("days")), trend: [] } };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "projects", "workbench");
    await started.promise;
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Project b/ }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Project wrong", exact: true }).count(), 0);
    held.resolve({ data: { project: project("a"), days: 30, trend: [] } });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Project b", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Project a", exact: true }).count(), 0);
    const range = page.locator('select:has(option[value="365"])');
    await range.selectOption("7");
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Project b", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Project b", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Project b", exact: true }).waitFor();
    assert.equal(await range.inputValue(), "7");
    assert.equal(bReads, 5);
    assert.deepEqual(cursors, ["", "project-next"]);
  } finally { held.resolve({ data: { project: project("a"), days: 30, trend: [] } }); await browser.close(); }
});

test("TEST046 About failed reads and CAS conflicts protect the draft across interface-language changes", { timeout: 30_000 }, async () => {
  let failed = true;
  let reads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const browser = await controlled(({ path, method, body }) => {
    if (path !== "/api/v1/admin/site-affairs/about/en-US") return;
    if (method === "PUT") { writes.push(JSON.parse(body)); return { status: 409, code: "SITE_PAGE_EDIT_CONFLICT", error: "Controlled page revision mismatch" }; }
    reads++;
    return failed ? { status: 503, error: "Controlled About read failure" } : { data: { locale: "en-US", title: "Original About title", bodyMarkdown: "Original About body", status: "published", revision: 11 } };
  });
  try {
    const { page } = browser;
    await panel(page, "site-about", "site-affairs");
    await page.getByText("Controlled About read failure", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save draft", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Publish", exact: true }).isDisabled(), true);
    assert.equal(writes.length, 0);
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const title = page.getByPlaceholder("Title", { exact: true });
    await title.fill("Unsaved administrator title");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByText("This content changed in another administrator session. Reload it and review the latest version before saving again.", { exact: true }).waitFor();
    assert.equal(await title.inputValue(), "Unsaved administrator title");
    assert.deepEqual(writes, [{ title: "Unsaved administrator title", bodyMarkdown: "Original About body", publish: false, baseRevision: 11 }]);
    const readsBeforeSwitch = reads;
    const languagePage = await page.context().newPage();
    try {
      await languagePage.goto(`${fixture.origin}/login`);
      await languagePage.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    } finally { await languagePage.close(); }
    assert.equal(await page.getByPlaceholder("标题", { exact: true }).inputValue(), "Unsaved administrator title");
    assert.equal(reads, readsBeforeSwitch, "interface language must not re-read and erase the selected About draft");
  } finally { await browser.close(); }
});

test("TEST046 changelog language drafts, publication flags and CAS remain stable during a cursor round trip", { timeout: 30_000 }, async () => {
  const delayed = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  let rootReads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const changelog = (id: string, title: string) => ({ id, changeDate: "2026-01-02", updatedAt: stamp, status: "published", translations: { "en-US": { title, bodyMarkdown: "English original", status: "published" }, "zh-CN": { title: "中文原文", bodyMarkdown: "中文正文", status: "draft" } } });
  const first = changelog("first", "First current page");
  const browser = await controlled(({ path, method, body, url }) => {
    if (path === "/api/v1/admin/site-affairs/changelogs/first") { assert.equal(method, "PUT"); writes.push(JSON.parse(body)); return { status: 409, code: "SITE_CHANGELOG_EDIT_CONFLICT", error: "Controlled changelog conflict" }; }
    if (path === "/api/v1/admin/site-affairs/changelogs") {
      assert.equal(url.searchParams.get("limit"), "30");
      assert.equal(url.searchParams.has("locale"), false);
      assert.equal(url.searchParams.has("offset"), false);
      if (url.searchParams.get("cursor")) { started.resolve(); return delayed.promise; }
      rootReads++;
      return { data: { items: [first], limit: 30, hasMore: true, nextCursor: "changelog-next" } };
    }
  });
  try {
    const { page } = browser;
    // The controlled transport ignores cancellation on this one request so the
    // response-generation guard is exercised in addition to AbortController.
    await page.addInitScript(() => {
      const fetchNative = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/admin/site-affairs/changelogs?") && url.includes("cursor=")) { const options = { ...init }; delete options.signal; return fetchNative(input, options); }
        return fetchNative(input, init);
      };
    });
    await panel(page, "site-changelogs", "site-affairs");
    await page.getByRole("button", { name: /First current page/ }).click();
    const title = page.getByPlaceholder("Title", { exact: true });
    const contentLanguage = page.locator('form select:has(option[value="zh-CN"])');
    await title.fill("Unsaved English changelog");
    await contentLanguage.selectOption("zh-CN");
    assert.equal(await title.inputValue(), "中文原文");
    assert.equal(await page.getByRole("checkbox", { name: "Publish", exact: true }).isChecked(), false);
    await title.fill("未保存中文标题");
    await contentLanguage.selectOption("en-US");
    assert.equal(await title.inputValue(), "Unsaved English changelog");
    assert.equal(await page.getByRole("checkbox", { name: "Publish", exact: true }).isChecked(), true);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("This content changed in another administrator session. Reload it and review the latest version before saving again.", { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].title, "Unsaved English changelog");
    assert.equal(writes[0].baseUpdatedAt, stamp);
    assert.equal(writes[0].publish, true);
    assert.equal(await title.inputValue(), "Unsaved English changelog");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await started.promise;
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).some(button => button.textContent?.trim() === "Previous" && button.disabled));
    await page.getByRole("button", { name: /First current page/ }).waitFor();
    assert.equal(rootReads, 2);
    const finished = page.waitForResponse(response => response.url().includes("cursor=changelog-next"));
    delayed.resolve({ data: { items: [changelog("stale", "Stale late cursor page")], limit: 30, hasMore: false, nextCursor: "" } });
    await (await finished).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("button", { name: /Stale late cursor page/ }).count(), 0, "late page must not overwrite the current root cursor");
    assert.equal(await page.getByRole("button", { name: /First current page/ }).count(), 1);
    assert.equal(await title.inputValue(), "Unsaved English changelog");
    await contentLanguage.selectOption("zh-CN");
    assert.equal(await title.inputValue(), "未保存中文标题");
  } finally { delayed.resolve({ data: { items: [], limit: 30, hasMore: false, nextCursor: "" } }); await browser.close(); }
});

test("FP034 public About content language rejects a late response from the previous interface locale", { timeout: 30_000 }, async () => {
  const old = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/site-affairs/about") {
      if (url.searchParams.get("locale") === "en-US") { started.resolve(); return old.promise; }
      assert.equal(url.searchParams.get("locale"), "zh-CN");
      return { data: { code: "about", locale: "zh-CN", title: "当前中文站务", bodyMarkdown: "当前中文正文" } };
    }
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/markdown/config") return { data: {} };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/site-affairs/about`);
    await started.promise;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.getByRole("heading", { name: "当前中文站务", exact: true }).waitFor();
    const finished = page.waitForResponse(response => response.url().includes("/site-affairs/about?locale=en-US"));
    old.resolve({ data: { code: "about", locale: "en-US", title: "Late previous English title", bodyMarkdown: "Late previous English body" } });
    await (await finished).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("heading", { name: "Late previous English title", exact: true }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "当前中文站务", exact: true }).count(), 1);
  } finally { old.resolve({ data: {} }); await browser.close(); }
});
