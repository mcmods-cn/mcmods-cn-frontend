import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIReply, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const pageOf = (items: unknown[], limit = 100) => ({ items, limit, hasMore: false, nextCursor: "" });
const timestamp = "2026-10-02T00:00:00Z";
const markdownProviders: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: { toc: true, tocMinDepth: 2, tocMaxDepth: 3 } };
};
const controlledPage = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? markdownProviders(request));
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

// These exercise the shipped React components with explicit transport fixtures.
// They do not establish database persistence or real AI provider behavior.
test("OCT02 Markdown literal markers do not throw or become custom references; TOC anchors match real headings", { timeout: 30_000 }, async () => {
  const browser = await controlledPage(({ path }) => {
    if (path === "/api/v1/auth/me") return { status: 401, error: "Not authenticated" };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/playground`);
    const source = "# Same\n\n## Same\n\n```md\n## Fake fenced heading\n*[CODE]: must remain literal\n[icon:health=8]\n[intro:privateid]\n```\n\n### Same\n\nLiteral \uE000MCVIDEO_%\uE001 and \uE000MCINTRO_forgedid1\uE001\n\n[icon:health=4]\n";
    await page.getByRole("textbox", { name: "Editor", exact: true }).fill(source);
    const first = page.locator('a[href="#same-1"]');
    await first.waitFor();
    assert.equal(await page.locator('[id="same-1"]').count(), 1);
    assert.equal(await page.locator('[id="same-2"]').count(), 1);
    assert.equal(await page.locator('a[href="#fake-fenced-heading"]').count(), 0);
    assert.equal(await page.locator(".markdown-preview-grid").last().textContent().then(text => text?.includes("\uE000MCVIDEO_%\uE001")), true);
    assert.equal(await page.locator(".markdown-preview-grid iframe").count(), 0);
    assert.equal(await page.locator(".markdown-preview-grid .mc-icon-token").count(), 1);
    assert.match(await page.locator(".markdown-preview-grid pre").innerText(), /\*\[CODE\]: must remain literal/);
    assert.match(await page.locator(".markdown-preview-grid code").last().textContent() || "", /\[icon:health=8\]/);
    assert.equal(await page.locator(".markdown-preview-grid .markdown-intro-reference").count(), 0);
  } finally { await browser.close(); }
});

test("OCT02 private messages preserve new input during a send and clear bodies on a cookie-session account change", { timeout: 30_000 }, async () => {
  let actor = "actor-a";
  let sends = 0;
  const sent = Promise.withResolvers<APIReply>();
  const sending = Promise.withResolvers<void>();
  const newActorConversations = Promise.withResolvers<APIReply>();
  const newActorStarted = Promise.withResolvers<void>();
  const conversation = { id: "conv-private", partnerId: "partner", username: "Private partner", avatarUrl: "", onlineStatus: "offline", lastMessage: "Private preview", unreadCount: 0, canMessage: true };
  const browser = await controlledPage(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, email: `${actor}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/notifications") return { data: pageOf([], 50) };
    if (path === "/api/v1/messages/conversations") {
      if (actor === "actor-b") { newActorStarted.resolve(); return newActorConversations.promise; }
      return { data: pageOf([conversation], 30) };
    }
    if (path.endsWith("/presence")) return { data: {} };
    if (path === "/api/v1/messages/conversations/conv-private") {
      if (method === "POST") { sends++; sending.resolve(); return sent.promise; }
      return { data: pageOf([{ id: "private-1", conversationId: conversation.id, body: "Actor A private body", senderId: "partner", recipientId: "actor-a", createdAt: timestamp }]) };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/messages`);
    await page.getByRole("button", { name: "Private chats", exact: true }).click();
    await page.getByRole("button", { name: /Private partner/ }).click();
    await page.getByText("Actor A private body", { exact: true }).waitFor();
    const draft = page.getByPlaceholder("Write a private message");
    await draft.fill("First submitted input");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await sending.promise;
    await draft.fill("New input while send pending");
    await page.locator("form").last().evaluate(form => { (form as HTMLFormElement).requestSubmit(); });
    assert.equal(sends, 1);
    sent.resolve({ data: { message: { id: "sent-1", conversationId: conversation.id, body: "First submitted input", senderId: "actor-a", recipientId: "partner", createdAt: timestamp } } });
    await page.getByText("First submitted input", { exact: true }).waitFor();
    assert.equal(await draft.inputValue(), "New input while send pending");
    actor = "actor-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor-b" })));
    await newActorStarted.promise;
    await page.waitForFunction(() => Boolean(document.querySelector('a[href="/user/actor-b"]')));
    assert.equal(await page.getByText("Actor A private body", { exact: true }).count(), 0);
    assert.equal(await page.getByText("First submitted input", { exact: true }).count(), 0);
    assert.equal(await page.getByPlaceholder("Write a private message").count(), 0);
    newActorConversations.resolve({ data: pageOf([], 30) });
  } finally { sent.resolve({ data: {} }); newActorConversations.resolve({ data: pageOf([], 30) }); await browser.close(); }
});

test("OCT02 failed resource loading cannot expose an empty editor or autosave; retry hydrates the original record", { timeout: 30_000 }, async () => {
  let loads = 0;
  let drafts = 0;
  const section = { publicId: "oct02sect", versionPublicId: "oct02vers", templatePublicId: "oct02tmpl", templateCode: "items", templateBuiltin: true, templateI18nKey: "", parentPublicId: "", defaultLocale: "en-US", displayMode: "compact", ordinal: 0, status: "active", localizations: [], resourceCount: 1 };
  const browser = await controlledPage(({ path, method }) => {
    if (path === "/api/v1/mods/fixture-mod/content-sections") return { data: { items: [section] } };
    if (path === "/api/v1/mods/fixture-mod/content-templates") return { data: { items: [{ publicId: "oct02tmpl", code: "items", builtin: true, i18nKey: "", defaultLocale: "en-US", defaultDisplayMode: "compact", definition: { resourceKinds: ["minecraft.item"], entryTypes: [] }, status: "active", localizations: [] }] } };
    if (path === "/api/v1/mods/fixture-mod/content-resources/oct02item") {
      loads++;
      if (loads === 1) return { status: 503, code: "SERVICE_UNAVAILABLE", error: "Resource fixture unavailable" };
      return { data: { entityId: "oct02item", publicId: "oct02item", kindCode: "minecraft.item", canonicalId: "fixture:original_item", details: [{ versionPublicId: "oct02vers", sectionPublicId: "oct02sect", entryTypeCode: "default", definitionSchemaVersion: 1, defaultLocale: "en-US", definition: {}, status: "active", localizations: [{ locale: "en-US", name: "Original resource", summary: "", contentMarkdown: "Original resource body" }] }], versions: [{ publicId: "oct02vers", hasDetail: true }], capabilities: {} } };
    }
    if (path === "/api/v1/users/me/drafts" && method === "POST") { drafts++; return { data: { updatedAt: timestamp } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/resources/oct02item/edit?version=oct02vers&section=oct02sect`);
    await page.getByText("Resource fixture unavailable", { exact: true }).waitFor();
    assert.equal(await page.locator("form textarea").count(), 0);
    assert.equal(drafts, 0);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.locator('input[value="fixture:original_item"]').waitFor();
    await page.locator('input[value="Original resource"]').waitFor();
    assert.equal(loads, 2);
  } finally { await browser.close(); }
});

test("OCT02 clipboard rejection is visible and does not claim a successful copy", { timeout: 30_000 }, async () => {
  const browser = await controlledPage(() => undefined);
  try {
    const { page } = browser;
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new DOMException("Test clipboard denied", "NotAllowedError")) } }));
    await page.goto(`${fixture.origin}/tools/plantuml`);
    await page.getByRole("button", { name: "Copy source", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Copy failed" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Copied", exact: true }).count(), 0);
    assert.match(await page.getByRole("alert").filter({ hasText: "Copy failed" }).textContent() || "", /copy/i);
  } finally { await browser.close(); }
});

test("OCT02 existing project load failures keep empty drafts unavailable across all project editors", { timeout: 45_000 }, async () => {
  for (const [collection, endpoint] of [["mods", "/api/v1/mods/failed-project/editor"], ["modpacks", "/api/v1/modpacks/failed-project/editor"], ["plugins", "/api/v1/content-projects/plugin/failed-project/editor"]]) {
    let loads = 0;
    let saves = 0;
    const browser = await controlledPage(({ path, method }) => {
      if (path === endpoint) { loads++; return { status: 503, error: "Original project temporarily unavailable" }; }
      if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
      if (path === "/api/v1/users/me/drafts" && method === "POST") { saves++; return { data: { updatedAt: timestamp } }; }
    });
    try {
      await browser.page.goto(`${fixture.origin}/${collection}/failed-project/edit`);
      await browser.page.getByText("Original project temporarily unavailable", { exact: true }).waitFor();
      assert.equal(await browser.page.locator('form input[maxlength="32"]').count(), 0);
      assert.equal(saves, 0, "Failed original reads must never autosave an empty replacement");
      await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
      await browser.page.getByText("Original project temporarily unavailable", { exact: true }).waitFor();
      assert.equal(loads, 2);
      assert.equal(saves, 0);
    } finally { await browser.close(); }
  }
});

test("OCT02 account settings load failures remain visible, retryable and cannot save guessed notification defaults", { timeout: 30_000 }, async () => {
  let notifications = 0;
  let writes = 0;
  const browser = await controlledPage(({ path, method }) => {
    if (path === "/api/v1/users/me/notification-settings") {
      if (method !== "GET") writes++;
      notifications++;
      return { status: 503, error: "Account notification fixture unavailable" };
    }
    if (path === "/api/v1/users/me/profile-settings" || path === "/api/v1/users/me/overview") return { status: 503, error: "Account profile fixture unavailable" };
    if (path === "/api/v1/users/me/files") return { status: 503, error: "Account files fixture unavailable" };
    if (path === "/api/v1/users/me/files/quota") return { status: 503, error: "Account quota fixture unavailable" };
  });
  try {
    await browser.page.goto(`${fixture.origin}/user?section=settings`);
    const loadError = browser.page.getByRole("alert").filter({ hasText: "Account notification fixture unavailable" });
    await loadError.waitFor();
    assert.match(await loadError.textContent() || "", /Account notification fixture unavailable/);
    const checkbox = browser.page.locator('input[type="checkbox"]').first();
    assert.equal(await checkbox.isDisabled(), true);
    const retried = browser.page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/users/me/notification-settings");
    await browser.page.getByRole("button", { name: "Retry", exact: true }).click();
    await retried;
    assert.equal(notifications, 2);
    assert.equal(writes, 0);
    await browser.page.getByRole("button", { name: "File manager", exact: true }).click();
    await browser.page.getByRole("status").getByText("Account files fixture unavailable", { exact: true }).waitFor();
  } finally { await browser.close(); }
});
