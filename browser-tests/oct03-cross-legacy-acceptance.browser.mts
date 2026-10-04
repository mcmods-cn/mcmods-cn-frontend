import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-10-03T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }, { code: "1.21.1", type: "release" }], loaders: [] } };
  if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", secondaryLocale: "" } };
  if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "test048u1", username: "Test reviewer", signature: "", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
  if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
  if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
  if (path === "/api/v1/anti-abuse/form-token") return { data: { token: "owned-fixture-form", fieldName: "website", expiresAt: "2027-01-01T00:00:00Z" } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
async function panel(page: Page, name: string, group: string) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="workbench"]').waitFor();
  if (!await page.locator(`[data-admin-panel="${name}"]`).count()) await page.locator(`[data-admin-group="${group}"]`).click();
  await page.locator(`[data-admin-panel="${name}"]`).click();
}
const settle = (page: Page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Real standalone React pages and native events. API/provider responses below
// are explicit synthetic fixtures: these cases do not prove PG persistence,
// server authorization, commercial OSS behavior or real translation quality.
test("OCT03 BUG139 server queue deduplicates bounded cursors and cancels stale selected details", { timeout: 30_000 }, async () => {
  const held = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const queries: string[] = [];
  let detailReads = 0;
  const row = (id: string) => ({ id, name: `Server ${id}`, address: `${id}.example.invalid`, shortDescription: `Summary ${id}`, minecraftVersions: ["1.21"], dedicatedClient: false, languages: ["en"], primaryTag: "survival", hasWhitelist: false, onlineMode: true, modded: false, loader: "", reviewStatus: "pending", reviewNote: "", submitterId: "user1", submitterUsername: "Synthetic author", proofFileCount: 0, linkCount: 0, modCount: 0, createdAt: stamp });
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/admin/server-reviews") {
      assert.equal(url.searchParams.get("limit"), "50");
      queries.push(url.search);
      if (url.searchParams.get("status") === "approved") return { data: { items: [], hasMore: false, nextCursor: "" } };
      if (url.searchParams.get("cursor")) { assert.equal(url.searchParams.get("cursor"), "opaque+/next"); return { data: { items: [row("b"), row("c")], hasMore: false, nextCursor: "" } }; }
      return { data: { items: [row("a"), row("b")], hasMore: true, nextCursor: "opaque+/next" } };
    }
    if (path === "/api/v1/admin/server-reviews/a") { detailReads++; started.resolve(); return held.promise; }
  });
  try {
    const { page } = browser;
    await panel(page, "reviews-server", "reviews");
    await page.getByRole("heading", { name: "Server a", exact: true }).waitFor();
    assert.equal(detailReads, 0, "queue summaries must not request full bodies eagerly");
    await page.getByRole("button", { name: "Load more server reviews", exact: true }).click();
    await page.getByRole("heading", { name: "Server c", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Server b", exact: true }).count(), 1);
    await page.locator("article").filter({ has: page.getByRole("heading", { name: "Server a", exact: true }) }).getByRole("button", { name: "Load review details", exact: true }).click();
    await started.promise;
    assert.equal(detailReads, 1);
    await page.locator('select:has(option[value="rejected"])').selectOption("approved");
    await page.getByText("There are no server review records in this state.", { exact: true }).waitFor();
    held.resolve({ data: { ...row("a"), bodyMarkdown: "Late private proof body", proofText: "Late owner evidence", proofFiles: [], links: [], mods: [] } });
    await settle(page);
    assert.equal(await page.getByText("Late private proof body", { exact: true }).count(), 0);
    assert.equal(queries.length, 3);
  } finally { held.resolve({ data: {} }); await browser.close(); }
});

test("OCT03 BUG142 file batch preserves successful IDs through creation failure and partial207", { timeout: 30_000 }, async () => {
  const uploads: string[] = [];
  const creations: string[][] = [];
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/log-shares/me") return { data: { items: [], total: 0, limit: 30, offset: 0 } };
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      const request = JSON.parse(body) as { originalName: string };
      uploads.push(request.originalName);
      if (request.originalName === "broken.log") return { status: 503, error: "Controlled broken upload" };
      return { data: { uploadRequired: false, file: { id: request.originalName, originalName: request.originalName, url: "https://owned.example.invalid/file" } } };
    }
    if (path === "/api/v1/log-shares/files" && method === "POST") {
      const ids = (JSON.parse(body) as { fileIds: string[] }).fileIds;
      creations.push(ids);
      if (creations.length === 1) return { status: 503, error: "Controlled create unavailable" };
      if (creations.length === 2) return { status: 207, data: { items: ids.map(id => id === "first.log" ? { fileId: id, status: "ready", publicCode: "first0001", expiresAt: stamp } : { fileId: id, status: "failed", error: "Controlled last item failure" }) } };
      assert.deepEqual(ids, ["last.log"]);
      return { data: { items: [{ fileId: "last.log", status: "ready", publicCode: "last00001", expiresAt: stamp }] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/logs`);
    await page.getByRole("button", { name: /Upload files/, exact: false }).click();
    await page.locator('input[type="file"]').setInputFiles(["first.log", "broken.log", "last.log"].map(name => ({ name, mimeType: "text/plain", buffer: Buffer.from(`Synthetic ${name}\n`) })));
    const save = page.getByRole("button", { name: "Redact and save", exact: true });
    await save.click();
    await page.getByText("Controlled create unavailable", { exact: true }).first().waitFor();
    assert.deepEqual(creations[0], ["first.log", "last.log"]);
    await save.click();
    await page.getByRole("link", { name: "Check redacted preview", exact: true }).waitFor();
    await page.getByText("Controlled last item failure", { exact: true }).first().waitFor();
    assert.equal(uploads.filter(name => name === "first.log").length, 1);
    assert.equal(uploads.filter(name => name === "last.log").length, 1);
    await save.click();
    await page.waitForFunction(() => document.querySelectorAll('a[href="/log/s/last00001"]').length === 1);
    assert.deepEqual(creations, [["first.log", "last.log"], ["first.log", "last.log"], ["last.log"]]);
    assert.equal(await page.locator('a[href="/log/s/first0001"]').count(), 1, "ready sibling survives another item's retry");
    assert.equal(uploads.filter(name => name === "first.log").length, 1);
    assert.equal(uploads.filter(name => name === "last.log").length, 1);
  } finally { await browser.close(); }
});

test("OCT03 PERF066 viewer replaces one chunk, navigates cursor history and copies only loaded bytes", { timeout: 30_000 }, async () => {
  const held = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const cursors: string[] = [];
  let firstReads = 0;
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/log-shares/s/chunk0001") return { data: { publicCode: "chunk0001", sourceType: "paste", title: "Synthetic bounded logs", originalName: "", status: "ready", redactionVersion: 2, redactionCounts: {}, createdAt: stamp, expiresAt: "2027-01-01T00:00:00Z", downloadable: false, entries: [0, 1].map(index => ({ index, name: `Entry ${index}`, contentType: "text/plain", byteSize: 40, lineCount: 2, checksum: "synthetic" })) } };
    if (path === "/api/v1/log-shares/s/chunk0001/entries/0/content") {
      const cursor = url.searchParams.get("cursor") || "";
      cursors.push(cursor);
      if (cursor) return { data: { text: "Second visible needle\nSecond remainder", characterOffset: 40, hasMore: false, nextCursor: "" } };
      if (++firstReads === 3) { started.resolve(); return held.promise; }
      return { data: { text: "First visible needle\nFirst remainder", characterOffset: 0, hasMore: true, nextCursor: "next+/opaque" } };
    }
    if (path === "/api/v1/log-shares/s/chunk0001/entries/1/content") return { data: { text: "Other entry only", characterOffset: 0, hasMore: false, nextCursor: "" } };
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as Window & { copiedChunk?: string }).copiedChunk = text; } } }));
    await page.goto(`${fixture.origin}/log/s/chunk0001`);
    const pre = page.locator("main pre");
    await pre.filter({ hasText: "First visible needle" }).waitFor();
    await page.getByRole("button", { name: /Next/, exact: false }).last().click();
    await pre.filter({ hasText: "Second visible needle" }).waitFor();
    assert.doesNotMatch(await pre.textContent() || "", /First/);
    await page.getByRole("searchbox").fill("needle");
    assert.equal(await pre.textContent(), "Second visible needle");
    await page.getByRole("button", { name: /Copy/, exact: false }).click();
    assert.equal(await page.evaluate(() => (window as Window & { copiedChunk?: string }).copiedChunk), "Second visible needle\nSecond remainder", "copy retains only the current loaded chunk, not earlier pages");
    await page.getByRole("button", { name: /Previous/, exact: false }).last().click();
    await pre.filter({ hasText: "First visible needle" }).waitFor();
    assert.deepEqual(cursors, ["", "next+/opaque", ""]);
    await page.getByRole("button", { name: "Entry 1", exact: true }).click();
    await pre.filter({ hasText: "Other entry only" }).waitFor();
    await page.getByRole("button", { name: "Entry 0", exact: true }).click();
    await started.promise;
    await page.getByRole("button", { name: "Entry 1", exact: true }).click();
    await pre.filter({ hasText: "Other entry only" }).waitFor();
    held.resolve({ data: { text: "Stale cancelled entry", characterOffset: 0, hasMore: false, nextCursor: "" } });
    await settle(page);
    assert.equal(await pre.textContent(), "Other entry only");
  } finally { held.resolve({ data: {} }); await browser.close(); }
});

test("OCT03 BUG149 task reward rename rejects occupied currency and preserves both amounts", { timeout: 30_000 }, async () => {
  const writes: Record<string, unknown>[] = [];
  const task = { publicId: "task00001", code: "synthetic-task", name: "Synthetic task", description: "", icon: "", translations: {}, refreshPeriod: "never", condition: { action: "view", objectType: "mod", metric: "count", target: 1, objectPublicId: "" }, rewards: { experience: 0, currencies: { gold: 7, diamond: 11 } }, status: "active" };
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/admin/tasks") return { data: { items: [task] } };
    if (path === "/api/v1/admin/economy/currencies") return { data: { items: ["gold", "diamond", "emerald"].map(code => ({ publicId: code, code, name: code, translations: {}, unit: "unit", precision: 0, status: "active" })) } };
    if (path === "/api/v1/admin/tasks/task00001" && method === "PUT") { writes.push(JSON.parse(body)); return { status: 409, code: "HTTP_409", error: "Controlled task conflict" }; }
  });
  try {
    const { page } = browser;
    await panel(page, "tasks", "progression");
    await page.getByText("Synthetic task", { exact: true }).click();
    const rewards = page.getByRole("heading", { name: "Rewards", exact: true }).locator("..");
    const gold = rewards.locator("select").first();
    assert.equal(await gold.locator('option[value="diamond"]').isDisabled(), true);
    await gold.evaluate(select => { (select as HTMLSelectElement).value = "diamond"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await gold.inputValue(), "gold");
    const amounts = rewards.locator('input[type="number"]');
    assert.deepEqual(await amounts.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value)), ["0", "7", "11"]);
    if (await page.getByRole("alertdialog").count()) await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    await gold.selectOption("emerald");
    await page.getByRole("button", { name: "Save", exact: true }).last().click();
    await page.getByText("This action conflicts with the current state. Reload and try again.", { exact: true }).waitFor();
    assert.deepEqual((writes[0].rewards as { currencies: Record<string, number> }).currencies, { emerald: 7, diamond: 11 });
    assert.deepEqual(await amounts.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value)), ["0", "11", "7"]);
  } finally { await browser.close(); }
});

const post = { id: "post00001", kind: "discussion", title: "Synthetic discussion", bodyMarkdown: "Synthetic post body", sourceLocale: "en-US", reviewStatus: "approved", canEdit: false, canResolve: false, authorName: "Synthetic author", resources: [], minecraftVersions: [], tags: [], coverUrl: "", createdAt: stamp, updatedAt: stamp };
const comment = (id: string, body: string) => ({ id, floorNumber: 1, depth: 0, body, deleted: false, author: { id: "other0001", username: "Other commenter", avatarUrl: "", onlineStatus: "hidden" }, reactions: {}, userReactions: [], childCount: 0, descendantCount: 0, heatScore: 0, hasMoreReplies: false, pinned: false, canEdit: false, canDelete: false, canPin: false, canReply: true, canReact: true, canReport: true, canWatch: false, createdAt: stamp, updatedAt: stamp, attachments: [] });
const comments = (items = [comment("comment01", "Synthetic comment body")]) => ({ items, total: items.length, target: { type: "community_post", key: "post00001", title: post.title, url: "/discussions/post00001" }, nextCursor: "", capabilities: { canCreate: true } });
const postReads: APIHandler = ({ path }) => {
  if (path === "/api/v1/community/posts/post00001") return { data: post };
  if (path === "/api/v1/projects/post00001/follow") return { data: { following: false, notificationsEnabled: false } };
  if (path === "/api/v1/review-locks/community_post/post00001") return { data: { locked: false, subscribed: false, canSubscribe: false } };
  if (path === "/api/v1/comment-targets/community_post/post00001/comments") return { data: comments() };
};

test("OCT03 LEGACY016 actual post and comment report buttons share reasons and unified POST", { timeout: 30_000 }, async () => {
  const reports: Array<Record<string, unknown>> = [];
  const reasonTypes: string[] = [];
  const browser = await controlled(request => {
    const { path, method, body, url } = request;
    if (path === "/api/v1/reports/reasons") { reasonTypes.push(url.searchParams.get("targetType") || ""); return { data: { items: [{ code: "spam", i18nKey: "reports.reasons.spam", requiresCustomText: false }] } }; }
    if (path === "/api/v1/reports" && method === "POST") { reports.push(JSON.parse(body)); return { data: { id: `report${reports.length}` } }; }
    return postReads(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/post00001`);
    await page.getByText("Synthetic comment body", { exact: true }).waitFor();
    for (const [index, type, id] of [[0, "discussion", "post00001"], [1, "comment", "comment01"]] as const) {
      await page.getByRole("button", { name: "Report", exact: true }).nth(index).click();
      const dialog = page.getByRole("dialog", { name: "Submit report", exact: true });
      await dialog.getByRole("combobox", { name: "Reason", exact: true }).selectOption("spam");
      await dialog.getByRole("button", { name: "Submit report", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(reports.at(-1)?.targetType, type);
      assert.equal(reports.at(-1)?.targetId, id);
      assert.equal(reports.at(-1)?.reasonCode, "spam");
    }
    assert.deepEqual(reasonTypes, ["discussion", "comment"]);
    assert.equal(reports.length, 2);
  } finally { await browser.close(); }
});

const mod = { id: "internal-only", uniqueId: "publicmod01", siteId: "synthetic-mod", primaryName: "Synthetic mod", secondaryName: "", abbreviation: "", summary: "Synthetic summary", modIds: [], defaultLocale: "en-US", localizations: [], environment: "both", primaryCategory: "technology", compatibilities: [], officialStatus: "official", sourceStatus: "open", license: "MIT", iconUrl: "", bodyMarkdown: "", searchKeywords: [], submissionMethod: "manual", reviewStatus: "approved", createdAt: stamp, updatedAt: stamp, tags: [], authors: [], links: [], relationshipGroups: [], galleryImages: [] };
test("OCT03 LEGACY018 FP047 canonical multi-folder retry and cookie actor clear private membership", { timeout: 30_000 }, async () => {
  let actorID = "test048u1";
  const writes: Array<Record<string, unknown>> = [];
  const newActorSummary = Promise.withResolvers<APIReply>();
  const newActorStarted = Promise.withResolvers<void>();
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actorID, username: actorID, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/mods") return { data: { items: [mod], total: 1 } };
    if (path === "/api/v1/users/me/favorite-collections") return { data: { items: ["first", "second", "third"].map(id => ({ id, name: `Collection ${id}`, isDefault: false, isPublic: false })), hasMore: false, nextCursor: "", limit: 50 } };
    if (path === "/api/v1/users/me/favorites/summary") {
      assert.equal((JSON.parse(body) as { entityType: string }).entityType, "mod");
      if (actorID !== "test048u1") { newActorStarted.resolve(); return newActorSummary.promise; }
      return { data: { entityPublicIds: [mod.uniqueId], collectionIdsByEntity: { [mod.uniqueId]: ["first"] } } };
    }
    if (path === "/api/v1/users/me/favorites" && method === "PATCH") { writes.push(JSON.parse(body)); return writes.length === 1 ? { status: 503, error: "Controlled favorite save failure" } : { data: { saved: true, selected: true } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods`);
    const favorite = page.getByRole("button", { name: "Favorited", exact: true });
    await page.getByRole("heading", { name: /Synthetic mod/ }).first().waitFor();
    await favorite.click();
    const dialog = page.getByRole("dialog", { name: "Choose collections", exact: true });
    await dialog.getByLabel("Collection first", { exact: true }).uncheck();
    await dialog.getByLabel("Collection second", { exact: true }).check();
    await dialog.getByLabel("Collection third", { exact: true }).check();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Controlled favorite save failure" }).waitFor();
    assert.equal(await dialog.getByLabel("Collection first", { exact: true }).isChecked(), false);
    assert.equal(await dialog.getByLabel("Collection second", { exact: true }).isChecked(), true);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(writes[0], { entityType: "mod", entityPublicId: "publicmod01", addCollectionIds: ["second", "third"], removeCollectionIds: ["first"] });
    assert.deepEqual(writes[1], writes[0]);
    actorID = "second-actor";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:second-actor" })));
    await newActorStarted.promise;
    assert.equal(await page.getByRole("button", { name: "Favorited", exact: true }).count(), 0, "previous account's private favorite set must clear before the second response");
    newActorSummary.resolve({ data: { entityPublicIds: [], collectionIdsByEntity: {} } });
  } finally { newActorSummary.resolve({ data: { entityPublicIds: [], collectionIdsByEntity: {} } }); await browser.close(); }
});

test("OCT03 FP055 pending comment and reply preserve newly typed input; reaction guards same tick and actor scope", { timeout: 30_000 }, async () => {
  const submitted = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const reaction = Promise.withResolvers<APIReply>();
  const reacted = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<APIReply>();
  const replied = Promise.withResolvers<void>();
  const watch = Promise.withResolvers<APIReply>();
  const watched = Promise.withResolvers<void>();
  const oldSort = Promise.withResolvers<APIReply>();
  const oldSortStarted = Promise.withResolvers<void>();
  const writes: Array<{ body: string; parentId?: string; attachmentFileIds: string[] }> = [];
  let reactionWrites = 0;
  let watchWrites = 0;
  let actor = "test048u1";
  const browser = await controlled(request => {
    const { path, method, body, url } = request;
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/comment-targets/community_post/post00001/comments") {
      if (method === "POST") {
        const request = JSON.parse(body) as { body: string; parentId?: string; attachmentFileIds: string[] };
        writes.push(request);
        if (request.parentId) { replied.resolve(); return reply.promise; }
        if (writes.length > 2) return { data: comment("comment06", request.body) };
        started.resolve(); return submitted.promise;
      }
      assert.equal(url.searchParams.get("limit"), "20");
      if (url.searchParams.get("sort") === "oldest") { oldSortStarted.resolve(); return oldSort.promise; }
      if (url.searchParams.get("sort") === "hot") return { data: comments([comment("comment04", "Current hot ordering")]) };
      return { data: comments([{ ...comment("comment01", "Synthetic comment body"), reactions: { thumbs_up: 1 }, canWatch: true }]) };
    }
    if (path === "/api/v1/comments/comment01/reaction") { reactionWrites++; reacted.resolve(); return reaction.promise; }
    if (path === "/api/v1/comments/comment01/watch") { watchWrites++; watched.resolve(); return watch.promise; }
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      const upload = JSON.parse(body) as { originalName: string };
      return { data: { uploadRequired: false, file: { id: upload.originalName, originalName: upload.originalName, sizeBytes: 8, contentType: "text/plain" } } };
    }
    return postReads(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/post00001`);
    const input = page.getByPlaceholder("Write a comment. Markdown is supported.");
    const attachmentInput = page.locator('input[type="file"]').first();
    await attachmentInput.setInputFiles({ name: "submitted.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic") });
    await page.getByText("submitted.txt", { exact: true }).waitFor();
    await input.fill("Submitted snapshot");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await started.promise;
    await input.fill("New unsent draft");
    await attachmentInput.setInputFiles({ name: "unsent.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic") });
    await page.getByText("unsent.txt", { exact: true }).waitFor();
    submitted.resolve({ data: comment("comment02", "Submitted snapshot") });
    await page.getByText("Submitted snapshot", { exact: true }).waitFor();
    assert.equal(await input.inputValue(), "New unsent draft");
    assert.equal(writes[0].body, "Submitted snapshot");
    assert.deepEqual(writes[0].attachmentFileIds, ["submitted.txt"]);
    assert.equal(await page.getByText("submitted.txt", { exact: true }).count(), 0);
    assert.equal(await page.getByText("unsent.txt", { exact: true }).count(), 1);
    const parent = page.locator('[data-comment-id="comment01"]');
    await parent.getByRole("button", { name: "Reply", exact: true }).click();
    const replyForm = page.locator('form').filter({ has: page.getByText("Replying to Other commenter", { exact: true }) });
    const replyInput = replyForm.getByPlaceholder("Write a comment. Markdown is supported.");
    await replyInput.fill("Submitted reply snapshot");
    await replyForm.getByRole("button", { name: "Reply", exact: true }).click();
    await replied.promise;
    await replyInput.fill("New unsent reply");
    reply.resolve({ data: { ...comment("comment03", "Submitted reply snapshot"), parentId: "comment01", rootId: "comment01", depth: 1 } });
    await page.getByText("Submitted reply snapshot", { exact: true }).waitFor();
    assert.equal(await replyInput.inputValue(), "New unsent reply");
    assert.equal(writes[1].parentId, "comment01");
    await replyForm.getByRole("button", { name: "Cancel", exact: true }).click();
    const thumb = page.getByRole("button", { name: "👍 1", exact: true });
    await thumb.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await reacted.promise;
    assert.equal(reactionWrites, 1, "same-tick native clicks share the in-flight mutation guard");
    await parent.getByRole("button", { name: "Watch", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await watched.promise;
    assert.equal(watchWrites, 1);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await page.getByText("New unsent draft", { exact: true }).waitFor();
    watch.resolve({ data: { active: true, mutedForever: false, unreadCount: 0, watchedReplies: 0 } });
    await parent.getByRole("button", { name: "Watching", exact: true }).waitFor();
    assert.equal(await page.getByText("New unsent draft", { exact: true }).count(), 1, "watch acknowledgement must preserve a concurrently published comment");
    actor = "second-commenter";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:second-commenter" })));
    await page.getByText("Submitted snapshot", { exact: true }).waitFor({ state: "detached" });
    await thumb.waitFor();
    reaction.resolve({ data: {} });
    await settle(page);
    assert.equal(await page.getByRole("button", { name: "👍 2", exact: true }).count(), 0, "the old actor's acknowledgement cannot update the new actor's list");
    assert.equal(await page.getByRole("button", { name: "Watching", exact: true }).count(), 0);
    await page.getByRole("combobox", { name: "Sort", exact: true }).selectOption("oldest");
    await oldSortStarted.promise;
    await page.getByRole("combobox", { name: "Sort", exact: true }).selectOption("hot");
    await page.getByText("Current hot ordering", { exact: true }).waitFor();
    oldSort.resolve({ data: comments([comment("comment05", "Late old ordering")]) });
    await settle(page);
    assert.equal(await page.getByText("Late old ordering", { exact: true }).count(), 0);
  } finally { submitted.resolve({ data: comment("comment02", "Submitted snapshot") }); reply.resolve({ data: comment("comment03", "Submitted reply snapshot") }); reaction.resolve({ data: {} }); watch.resolve({ data: {} }); oldSort.resolve({ data: comments([]) }); await browser.close(); }
});

const publicProfile = (name: string) => ({ id: "actor0001", username: name, status: "active", createdAt: stamp, followers: 1, following: 0, blocked: 0, isOwn: false, isFollowing: false, isBlocked: false, canBlock: false, canFollow: false, canMessage: false, avatarUrl: "", signature: "Synthetic public signature", profileBackgroundUrl: "", onlineStatus: "hidden" });

test("OCT03 FP047 public profile identity reload clears old actor's relationship snapshot", { timeout: 30_000 }, async () => {
  let actor = "test048u1";
  const delayed = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/users/actor0001/profile") {
      if (actor === "test048u1") return { data: { ...publicProfile("Public identity"), isFollowing: true } };
      started.resolve(); return delayed.promise;
    }
    if (path === "/api/v1/users/actor0001/player-profiles") return { data: { items: [] } };
    if (path === "/api/v1/users/actor0001/showcase") return { data: { claimedAuthors: [], developerProjects: [], editorProjects: [], uploads: [], posts: [], contributions: { year: 2026, from: stamp, to: stamp, total: 0, days: [], years: [2026], recentActivity: [], recentActivityTruncated: false } } };
    if (path === "/api/v1/users/actor0001/favorite-collections") return { data: { items: [], limit: 20, hasMore: false, nextCursor: "" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user/actor0001`);
    await page.getByRole("heading", { name: "Public identity", exact: true }).waitFor();
    await page.getByRole("button", { name: "Unfollow", exact: true }).waitFor();
    actor = "profile-second-actor";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:profile-second-actor" })));
    await started.promise;
    assert.equal(await page.getByRole("button", { name: "Unfollow", exact: true }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "Public identity", exact: true }).count(), 0);
    delayed.resolve({ data: publicProfile("Public identity") });
    await page.getByRole("heading", { name: "Public identity", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Unfollow", exact: true }).count(), 0);
  } finally { delayed.resolve({ data: publicProfile("Public identity") }); await browser.close(); }
});

test("OCT03 FP035 translation polling stops after90s and explicit refresh never submits another translation", { timeout: 30_000 }, async () => {
  let requests = 0;
  let contentReads = 0;
  let taskReads = 0;
  const browser = await controlled(({ path, method }) => {
    if (path === "/api/v1/tags/tag000001") return { data: { publicId: "tag000001", canonicalId: "synthetic:tag", registry: "minecraft:item", defaultLocale: "zh-CN", reviewStatus: "approved", localizations: [], members: [] } };
    if (path === "/api/v1/comment-targets/tag/tag000001/comments") return { data: { ...comments([]), target: { type: "tag", key: "tag000001", title: "Synthetic tag", url: "/mods-tag?publicId=tag000001" } } };
    if (path === "/api/v1/content/tag000001/translations" && method === "POST") { requests++; return { data: { taskId: "task-one", status: "queued" } }; }
    if (path === "/api/v1/content/tag000001") {
      contentReads++;
      return { data: { publicId: "tag000001", entityType: "tag", requestedLocale: "en-US", resolvedLocale: "zh-CN", defaultLocale: "zh-CN", resolution: "missing", available: [], editableLocales: [], translation: requests ? { status: "queued", taskId: "task-one", automatic: true, canRequest: true } : { status: "request_required", automatic: false, canRequest: true } } };
    }
    if (path === "/api/v1/content/translations/task-one") { taskReads++; return { data: { taskId: "task-one", status: "queued" } }; }
  });
  try {
    const { page } = browser;
    const initial = new Date("2026-10-03T01:00:00Z");
    await page.clock.install({ time: initial });
    await page.goto(`${fixture.origin}/mods-tag?publicId=tag000001`);
    await page.getByRole("button", { name: "Translate", exact: true }).click();
    await page.getByText(/AI translation in progress/).waitFor();
    const firstTaskResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/content/translations/task-one");
    await page.clock.runFor(1801);
    await firstTaskResponse;
    assert.equal(taskReads, 1);
    await page.clock.setSystemTime(new Date(initial.getTime() + 90_001));
    await page.clock.runFor(1801);
    await page.getByRole("alert").filter({ hasText: "Automatic status checks stopped" }).waitFor();
    const stoppedReads = taskReads;
    await page.clock.runFor(10_000);
    assert.equal(taskReads, stoppedReads);
    const previousContentReads = contentReads;
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Automatic status checks stopped" }).waitFor({ state: "detached" });
    assert.equal(contentReads, previousContentReads + 1);
    assert.equal(requests, 1, "refresh is a status GET, not a billable POST retry");
  } finally { await browser.close(); }
});

test("OCT03 FP035 network clears old account and locale payload while replacement is pending", { timeout: 30_000 }, async () => {
  let actor = "test048u1";
  let stage = 0;
  const actorPage = Promise.withResolvers<APIReply>();
  const actorStarted = Promise.withResolvers<void>();
  const localePage = Promise.withResolvers<APIReply>();
  const localeStarted = Promise.withResolvers<void>();
  const payload = (name: string) => ({ items: [{ id: "follower01", username: name, signature: "", avatarUrl: "" }], hasMore: false, nextCursor: "", limit: 24 });
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: { id: actor, username: actor, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [] } };
    if (path === "/api/v1/users/actor0001/profile") return { data: publicProfile("Network owner") };
    if (path === "/api/v1/users/actor0001/followers") {
      assert.equal(url.searchParams.get("limit"), "24");
      if (stage === 0) return { data: payload("Previous viewer payload") };
      if (stage === 1) { actorStarted.resolve(); return actorPage.promise; }
      localeStarted.resolve(); return localePage.promise;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user/actor0001/followers`);
    await page.getByText("Previous viewer payload", { exact: true }).waitFor();
    stage = 1; actor = "network-second-actor";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:network-second-actor" })));
    await actorStarted.promise;
    assert.equal(await page.getByText("Previous viewer payload", { exact: true }).count(), 0);
    actorPage.resolve({ data: payload("Second viewer payload") });
    await page.getByText("Second viewer payload", { exact: true }).waitFor();
    stage = 2;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await localeStarted.promise;
    assert.equal(await page.getByText("Second viewer payload", { exact: true }).count(), 0);
    localePage.resolve({ data: payload("新语言受控结果") });
    await page.getByText("新语言受控结果", { exact: true }).waitFor();
  } finally { actorPage.resolve({ data: payload("Second viewer payload") }); localePage.resolve({ data: payload("新语言受控结果") }); await browser.close(); }
});

test("OCT03 FP061 export preview is bound to version and loader, busy modal retains focus and failed polling is visible", { timeout: 30_000 }, async () => {
  const firstPreview = Promise.withResolvers<APIReply>();
  const inspectStarted = Promise.withResolvers<void>();
  let inspections = 0;
  let creations = 0;
  let detailReads = 0;
  let history = false;
  const item = { sourceProjectType: "mod", sourceProjectName: "Synthetic export mod", resultType: "exported", selectedFileName: "synthetic.jar" };
  const preview = (loader: string) => ({ previewId: `preview-${loader}`, previewHash: `hash-${loader}`, expiresAt: "2027-01-01T00:00:00Z", collectionId: "collection01", collectionName: "Synthetic collection", minecraftVersion: "1.21", loader, loaderVersion: "1.0", allowCompatibleOnly: false, reportVersion: 1, rebuildSource: "current_collection", collectionItemCount: 1, exportedModCount: 1, autoDependencyCount: 0, skippedItemCount: 0, failedItemCount: 0, items: [item] });
  const task = (status: string) => ({ id: "task-one", collectionId: "collection01", packName: "Synthetic historical pack", packVersion: "1.0", minecraftVersion: "1.21", loader: "fabric", loaderVersion: "1.0", allowCompatibleOnly: false, reportVersion: 1, status, collectionItemCount: 1, exportedModCount: 1, autoDependencyCount: 0, skippedItemCount: 0, failedItemCount: 0, finalFileCount: 1, fileSize: 128, createdAt: stamp });
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/users/me/favorite-collections") return { data: { items: [{ id: "collection01", name: "Synthetic collection", isPublic: false, isDefault: false }], limit: 20, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/users/me/favorite-collections/collection01/items") return { data: { items: [], limit: 20, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/users/me/favorite-collections/collection01/modpack-exports/preflight") {
      inspections++;
      const request = JSON.parse(body) as { minecraftVersion: string; loader: string };
      assert.equal(request.minecraftVersion, "1.21");
      if (inspections === 1) { assert.equal(request.loader, "neoforge"); inspectStarted.resolve(); return firstPreview.promise; }
      assert.equal(request.loader, "fabric"); return { data: preview("fabric") };
    }
    if (path === "/api/v1/users/me/favorite-collections/collection01/modpack-exports" && method === "POST") {
      creations++; const request = JSON.parse(body) as Record<string, unknown>;
      assert.equal(request.loader, "fabric"); assert.equal(request.previewId, "preview-fabric");
      return { data: { taskId: "task-one", status: "pending", preview: preview("fabric") } };
    }
    if (path === "/api/v1/users/me/modpack-exports/task-one") {
      detailReads++;
      if (history) return { data: { task: task("ready"), items: [item], downloadAvailable: false } };
      return detailReads === 1 ? { data: { task: task("pending"), items: [], downloadAvailable: false } } : { status: 503, error: "Controlled export status unavailable" };
    }
    if (path === "/api/v1/users/me/modpack-exports") { history = true; return { data: { items: [task("ready")], limit: 30, hasMore: false, nextCursor: "" } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=favorites`);
    const trigger = page.getByRole("button", { name: "Export as Modrinth modpack", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Export Modrinth modpack", exact: true });
    await dialog.locator('button[aria-haspopup="dialog"]').click();
    await page.getByRole("dialog", { name: "Select Minecraft versions", exact: true }).getByRole("button", { name: /^1\.21\s/ }).click();
    await dialog.getByRole("button", { name: "Check compatibility", exact: true }).click();
    await inspectStarted.promise;
    assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 1);
    assert.equal(await dialog.evaluate(node => (node as HTMLDialogElement).open), true, "busy Escape must retain the native modal");
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => ({ inside: Boolean(document.querySelector("dialog[open]")?.contains(document.activeElement)), activeTag: document.activeElement?.tagName, nativeModalOpen: Boolean(document.querySelector("dialog[open]")) }));
    assert.equal(focus.inside, true, `busy modal focus: ${JSON.stringify(focus)}`);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, "busy reverse Tab also remains in the dialog");
    firstPreview.resolve({ data: preview("neoforge") });
    await dialog.getByRole("button", { name: "Create modpack", exact: true }).waitFor();
    await dialog.locator('button[aria-haspopup="dialog"]').click();
    await page.getByRole("dialog", { name: "Select Minecraft versions", exact: true }).getByRole("button", { name: /^1\.21\.1\s/ }).click();
    assert.equal(await dialog.getByRole("button", { name: "Create modpack", exact: true }).count(), 0, "changing Minecraft version invalidates the previous preview");
    await dialog.locator('button[aria-haspopup="dialog"]').click();
    await page.getByRole("dialog", { name: "Select Minecraft versions", exact: true }).getByRole("button", { name: /^1\.21\s/ }).click();
    await dialog.getByRole("combobox", { name: "Mod loader", exact: true }).selectOption("fabric");
    assert.equal(await dialog.getByRole("button", { name: "Create modpack", exact: true }).count(), 0);
    assert.equal(creations, 0);
    await dialog.getByRole("button", { name: "Check compatibility", exact: true }).click();
    await dialog.getByRole("button", { name: "Create modpack", exact: true }).click();
    await dialog.getByText("Waiting", { exact: true }).waitFor();
    await dialog.getByText("Controlled export status unavailable", { exact: true }).waitFor();
    assert.equal(creations, 1);
    assert.equal(inspections, 2);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(button => button === document.activeElement), true);
    await trigger.click();
    await dialog.getByRole("button", { name: "Export history", exact: true }).click();
    await dialog.getByRole("button", { name: /Synthetic historical pack/, exact: false }).click();
    await dialog.getByText("Export ready", { exact: true }).waitFor();
    assert.equal(creations, 1, "opening a historical task only reads persisted results");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(button => button === document.activeElement), true);
  } finally { firstPreview.resolve({ data: preview("neoforge") }); await browser.close(); }
});
