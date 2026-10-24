import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const stamp = "2026-10-24T00:00:00Z";
const common: APIHandler = ({ path, method }) => {
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.20.1", type: "release" }], loaders: [] } };
  if (path === "/api/v1/creator-roles") return { data: { items: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/users/me/drafts") return { data: method === "POST" ? { updatedAt: stamp } : { items: [] } };
};

// Controlled HTTP providers with the real production frontend. These do not
// assert PostgreSQL, real providers, independent review, or game export.
for (const [type, route, providers] of [
  ["plugin", "plugins", ["modrinth", "curseforge"]], ["map", "maps", ["curseforge"]],
  ["resource_pack", "resource-packs", ["modrinth", "curseforge"]], ["shader_pack", "shaders", ["modrinth", "curseforge"]],
  ["datapack", "datapacks", ["modrinth", "curseforge"]], ["addon", "addons", ["modrinth", "curseforge"]],
] as const) for (const provider of providers) test(`TP-008 ${type}/${provider} edits and submits null collections safely`, { timeout: 30_000 }, async () => {
  let submitted: Record<string, unknown> | undefined;
  const browser = await fixture.page(request => {
    const { path, method, body } = request;
    if (path === `/api/v1/content-project-imports/${type}`) return { data: { id: "nulljob", status: "completed", progress: 100, result: {
      projectType: type, siteId: "nullimport", defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Imported project", summary: "", bodyMarkdown: "" }],
      abbreviation: "", minecraftVersions: ["1.20.1"], loaders: [], categories: [], features: [], resolution: "16x", performance: "low", mapSize: "small",
      officialStatus: "active", sourceStatus: "open", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "", iconUrl: "", searchKeywords: null,
      submissionMethod: provider, authors: null, links: null, galleryImages: null, parentProjects: null,
    } } };
    if (path === `/api/v1/content-projects/${type}` && method === "POST") { submitted = JSON.parse(body); return { status: 503, error: "Synthetic write barrier" }; }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/${route}/new?method=${provider}&url=${encodeURIComponent("https://provider.example.test/project")}`);
    await page.locator('input[value="Imported project"]').waitFor();
    await page.locator('input[value="Imported project"]').fill("Edited imported project");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.getByText("Synthetic write barrier", { exact: true }).waitFor();
    assert(submitted);
    assert.deepEqual(submitted.galleryImages, []);
    assert.deepEqual(submitted.parentProjects, []);
    assert.deepEqual(submitted.authors, []);
    assert.equal((submitted.localizations as Array<{ name: string }>)[0].name, "Edited imported project");
  } finally { await browser.close(); }
});

test("RPH-006 failed history pagination retains its successful page and retries the same cursor", { timeout: 30_000 }, async () => {
  const requests: string[] = [];
  let fail = true;
  const browser = await fixture.page(({ path, url }) => {
    if (path === "/api/v1/mods/historymod/content-resources/resource1/history") {
      const cursor = url.searchParams.get("cursor") || "";
      requests.push(cursor);
      if (cursor && fail) { fail = false; return { status: 503, error: "Synthetic history outage" }; }
      return { data: { items: [{ id: cursor ? "second" : "first", version: cursor ? 1 : 2, status: "approved", origin: "manual", source: "", submittedByName: "Synthetic author", createdAt: stamp, current: !cursor, reason: cursor ? "Second page" : "Successful first page" }], limit: 50, hasMore: !cursor, nextCursor: cursor ? "" : "cursor-page-two" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/historymod/resources/resource1/history?version=version1`);
    await page.getByText("Successful first page", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Synthetic history outage", { exact: false }).waitFor();
    assert.equal(await page.getByText("Successful first page", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Page 1", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Second page", { exact: true }).waitFor();
    assert.deepEqual(requests, ["", "cursor-page-two", "cursor-page-two"]);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByText("Successful first page", { exact: true }).waitFor();
  } finally { await browser.close(); }
});

test("CONT-003 and GR-010 direct recipe links render exact recipe with independent pointer and visual geometry", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/catalog/recipes/recipe01/render") return { data: {
      publicId: "recipe01", recipeTypePublicId: "type01", recipeId: "audit:exact_recipe", recipeIdSource: "minecraft_recipe", recipeIdCanonical: true, semanticFingerprint: "synthetic", revisionId: "revision1", modSiteId: "", note: "Exact recipe reached",
      layout: { canvas: { width: 100, height: 80 }, layout_kind: "shaped", slots: [{ role: "input", ingredient_present: true, rect: { x: 10, y: 20, width: 24, height: 30 }, visual_rect: { x: 12, y: 25, width: 16, height: 18 }, alternatives: [{ id: "audit:fluid", kind: "fluid", amount: 250, names: { en_us: "Audit fluid" } }] }] },
    } };
  }, { hasTouch: true });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?recipePublicId=recipe01`);
    await page.getByText("Exact recipe reached", { exact: true }).waitFor();
    const slot = page.locator('#recipe-recipe01 span[tabindex="0"]');
    assert.equal(await slot.count(), 1);
    assert.deepEqual(await slot.evaluate(node => ({ left: (node as HTMLElement).style.left, top: (node as HTMLElement).style.top, width: (node as HTMLElement).style.width, height: (node as HTMLElement).style.height })), { left: "20px", top: "40px", width: "48px", height: "60px" });
    const visual = slot.locator('span.pointer-events-none.absolute');
    assert.equal(await visual.evaluate(node => (node as HTMLElement).style.left), "4px");
    assert.equal(await visual.evaluate(node => (node as HTMLElement).style.width), "32px");
    await slot.focus();
    assert.equal(await slot.evaluate(node => node === document.activeElement), true);
    await page.reload();
    await page.getByText("Exact recipe reached", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await slot.tap({ position: { x: 1, y: 1 } });
  } finally { await browser.close(); }
});

test("REM-004 transient auth 429 offers explicit recovery using the existing cookie", { timeout: 30_000 }, async () => {
  let reads = 0;
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/auth/me") {
      reads++;
      return reads === 1 ? { status: 429, error: "Synthetic cooldown", headers: { "retry-after": "0" } } : { data: { id: "recovered1", username: "Recovered identity", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    }
    if (path === "/api/v1/catalog/recipes/missing01/render") return { status: 404, error: "Synthetic unavailable recipe" };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?recipePublicId=missing01`);
    await page.getByText("Sign-in status is temporarily unavailable. Retry after the server cooldown.", { exact: false }).waitFor();
    await page.getByRole("status").filter({ hasText: "Sign-in status" }).getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("link", { name: "Recovered identity", exact: true }).waitFor();
    assert.equal(reads, 2);
  } finally { await browser.close(); }
});

test("REM-002 Mod challenge preserves input and the same submission key through rejection and retry", { timeout: 30_000 }, async () => {
  const writes: Array<{ key?: string; proof?: string; body: unknown }> = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/mods" && request.method === "POST") {
      writes.push({ key: request.headers["idempotency-key"], proof: request.headers["x-anti-abuse-challenge"], body: JSON.parse(request.body) });
      if (writes.length === 1) return { status: 403, code: "challenge_required", error: "Synthetic verification required", details: { challenge: { id: "challenge1", provider: "proof", prompt: "2 + 3", expiresAt: "2099-01-01T00:00:00Z" } } };
      if (writes.at(-1)?.proof !== "challenge1:5") return { status: 403, code: "challenge_invalid", error: "Synthetic wrong answer" };
      return { status: 503, error: "Synthetic persistence barrier after correct proof" };
    }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/new`);
    await page.locator('input[maxlength="100"]').fill("challenge-mod");
    await page.locator('input[maxlength="160"]').first().fill("Challenge Mod");
    await page.locator('input[maxlength="128"]').fill("challenge_mod");
    await page.locator('main form').first().locator('button[type="submit"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Complete human verification", exact: true });
    await dialog.waitFor();
    await dialog.locator("input").fill("4");
    await dialog.getByRole("button", { name: "Verify and continue", exact: true }).click();
    await page.getByText("Synthetic wrong answer", { exact: true }).waitFor();
    await dialog.locator("input").fill("5");
    await dialog.getByRole("button", { name: "Verify and continue", exact: true }).click();
    await page.getByText("Synthetic persistence barrier after correct proof", { exact: true }).waitFor();
    assert.equal(writes.length, 3);
    assert(writes[0].key);
    assert.equal(writes[0].key, writes[1].key);
    assert.equal(writes[0].key, writes[2].key);
    assert.deepEqual(writes[0].body, writes[2].body);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator('input[maxlength="160"]').first().inputValue(), "Challenge Mod");
  } finally { await browser.close(); }
});

test("REM-003 missing default-language name is located before any write and no translation is invented", { timeout: 30_000 }, async () => {
  let writes = 0;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/mods" && request.method === "POST") { writes++; return { status: 503, error: "Unexpected write" }; }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/new`);
    await page.locator('input[maxlength="100"]').fill("localized-mod");
    await page.locator('input[maxlength="160"]').first().fill("Official original name");
    await page.locator('input[maxlength="128"]').fill("localized_mod");
    await page.locator('textarea[maxlength="500"]').fill("A summary without a localized name");
    await page.locator('main form').first().locator('button[type="submit"]').first().click();
    await page.getByText("Enter a name in the default content language before submitting localized content.", { exact: true }).waitFor();
    assert.equal(writes, 0);
    assert.equal(await page.locator('input[maxlength="160"]').nth(1).inputValue(), "");
  } finally { await browser.close(); }
});

test("GR-008 import history renders the exact authorized revision, package, target and change scope", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => path === "/api/v1/export-revisions/importrev1" ? { data: {
    id: "importrev1", revisionNo: 7, status: "pending", modSiteId: "historymod", sourceKind: "mcmods_exporter", namespace: "audit", minecraftVersion: "1.20.1", loader: "forge", targetVersionPublicId: "target001", targetVersionLabel: "1.2.3 · 1.20.1 · Forge", package: { sha256: "a".repeat(64), archiveName: "original-game-package.zip" }, counts: { resources: 3 }, resourceChanges: { added: 1, changed: 2, removed: 0 }, previousRevisionId: "importrev0",
  } } : undefined);
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/historymod/history?importRevisionId=importrev1`);
    await page.getByText("original-game-package.zip", { exact: true }).waitFor();
    assert.equal(await page.getByText("1.2.3 · 1.20.1 · Forge · 1.20.1 · forge", { exact: true }).count(), 1);
    assert.equal(await page.getByText("a".repeat(64), { exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "View previous import revision", exact: true }).getAttribute("href"), "/mods/historymod/history?importRevisionId=importrev0");
  } finally { await browser.close(); }
});

test("CMP-004 moderation UI approves, rejects and restores through explicit queue states", { timeout: 30_000 }, async () => {
  const decisions: string[] = [];
  const browser = await fixture.page(({ path, method, body, url }) => {
    if (path === "/api/v1/admin/comments/pending") return { data: { items: [{ id: "comment1", body: url.searchParams.get("status") === "hidden" ? "Rejected comment" : "Pending comment", status: url.searchParams.get("status"), authorId: "ordinary1", createdAt: stamp, target: { type: "mod", key: "mod001", title: "Target Mod", url: "/mods/target-mod" } }] } };
    if (path === "/api/v1/comments/comment1/review" && method === "PATCH") { decisions.push(JSON.parse(body).status); return { data: { status: decisions.at(-1) } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/comments/moderation`);
    await page.getByText("Pending comment", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByText("Pending comment", { exact: true }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Pending comment", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page.getByText("Pending comment", { exact: true }).waitFor({ state: "detached" });
    await page.getByRole("combobox", { name: "Queue status", exact: true }).selectOption("hidden");
    await page.getByText("Rejected comment", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Restore to review queue", exact: true }).click();
    await page.getByText("Rejected comment", { exact: true }).waitFor({ state: "detached" });
    assert.deepEqual(decisions, ["approved", "rejected", "restore"]);
  } finally { await browser.close(); }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("MSG-R01 real cross-tab storage and a transport barrier keep late account-A unread results out of account B", { timeout: 30_000 }, async () => {
  let actor = "A";
  const oldUnread = deferred<{ data: { total: number; notifications: number } }>();
  const oldStarted = deferred<void>();
  const browser = await fixture.page(({ path }) => {
    const requestActor = actor;
    if (path === "/api/v1/auth/me") return { data: { id: `actor${requestActor}001`, username: `Actor ${requestActor}`, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    if (path === "/api/v1/me/unread-summary") {
      if (requestActor === "A") { oldStarted.resolve(); return oldUnread.promise; }
      return { data: { total: 2, notifications: 0 } };
    }
    if (path === "/api/v1/notifications") return { data: { items: [{ id: `notice${requestActor}001`, kind: "system", title: `Notification for actor ${requestActor}`, body: `Private notification ${requestActor}`, sourceLocale: "en-US", read: true, data: {}, actors: [], createdAt: stamp, updatedAt: stamp, translationAllowed: false }], limit: 50, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/messages/conversations") return { data: { items: [], limit: 30, hasMore: false, nextCursor: "" } };
  });
  const switcher = await browser.page.context().newPage();
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/messages`);
    await oldStarted.promise;
    await page.getByText("Notification for actor A", { exact: true }).waitFor();
    // A second same-origin document writes real localStorage. The application
    // under test receives the browser's actual cross-tab storage event.
    await switcher.goto(`${fixture.origin}/robots.txt`);
    actor = "B";
    await switcher.evaluate(() => localStorage.setItem("mcmods-auth-sync", `login:${Date.now()}:actor-B`));
    await page.getByText("Notification for actor B", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Mark all as read", exact: true }).isDisabled(), true);
    const late = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/me/unread-summary");
    oldUnread.resolve({ data: { total: 73, notifications: 73 } });
    await (await late).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("Notification for actor B", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Notification for actor A", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Mark all as read", exact: true }).isDisabled(), true);
    assert.match(await page.locator('a[title="Message center"]').innerText(), /Messages\s*2/);
  } finally { oldUnread.resolve({ data: { total: 73, notifications: 73 } }); await switcher.close(); await browser.close(); }
});

for (const [kind, route] of [["tutorial", "tutorials"], ["issue", "issues"], ["news", "news"], ["discussion", "discussions"]]) test(`CMP-002 ordinary ${kind} author enters the unlocked production editor`, { timeout: 30_000 }, async () => {
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: { id: "ordinaryauthor", username: "Ordinary author", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    if (request.path === "/api/v1/community/posts/authorpost1") return { data: { id: "authorpost1", kind, category: "general", title: "Author editable content", sourceLocale: "en-US", bodyMarkdown: "Author-owned body", minecraftVersions: [], projects: [], resources: [], publishedRevisionId: "baserev1", reviewStatus: "approved", author: { id: "ordinaryauthor", username: "Ordinary author" } } };
    if (request.path === "/api/v1/review-locks/community_post/authorpost1") return { data: { locked: false, canSubscribe: false, subscribed: false } };
    if (request.path === "/api/v1/community/post-categories") return { data: { kind, items: ["general"] } };
    if (request.path === "/api/v1/economy/currencies") return { data: { items: [] } };
    return common(request);
  });
  try {
    await browser.page.goto(`${fixture.origin}/${route}/authorpost1/edit`);
    await browser.page.locator('input[value="Author editable content"]').waitFor();
    await browser.page.locator('input[value="Author editable content"]').fill("Preserved author edit");
    assert.equal(await browser.page.locator('input[value="Preserved author edit"]').isEditable(), true);
  } finally { await browser.close(); }
});

test("OSS-001 creator preview decodes authorized bytes, recovers expiration, and persists only the stable reference", { timeout: 30_000 }, async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#4b8ad9cc" } }).png().toBuffer();
  let refreshes = 0;
  let unsignedReads = 0;
  let saved: { avatarUrl?: string; avatarFileId?: string } | undefined;
  const browser = await fixture.page(request => {
    const { path, method, body, url } = request;
    if (path === "/private-avatar.png") {
      if (url.searchParams.get("preview") === "fresh") return { bytes: png, contentType: "image/png" };
      if (!url.search) unsignedReads++;
      return { status: 403, error: "Synthetic expired preview" };
    }
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      const payload = JSON.parse(body);
      return { data: { uploadRequired: false, objectKey: "private/avatar.png", storageUrl: "https://oss.mcmods.cn/private-avatar.png", accessUrl: "https://oss.mcmods.cn/private-avatar.png?preview=expired", originalName: payload.originalName, sizeBytes: payload.sizeBytes, sha256: payload.sha256, file: { id: "avatarfile01", objectKey: "private/avatar.png", storageUrl: "https://oss.mcmods.cn/private-avatar.png", accessUrl: "https://oss.mcmods.cn/private-avatar.png?preview=expired", status: "active", scanStatus: "clean" } } };
    }
    if (path === "/api/v1/users/me/files/presign") { refreshes++; assert.equal(JSON.parse(body).objectKey, "private/avatar.png"); return { data: { url: "https://oss.mcmods.cn/private-avatar.png?preview=fresh" } }; }
    if (path === "/api/v1/creators" && method === "POST") { saved = JSON.parse(body); return { status: 503, error: "Synthetic creator write barrier" }; }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/authors/new`);
    await page.locator('input[maxlength="160"]').fill("Avatar test author");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "synthetic-avatar.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Crop and upload", exact: true }).click();
    const preview = page.locator('img[src="https://oss.mcmods.cn/private-avatar.png?preview=fresh"]');
    await preview.waitFor();
    await page.waitForFunction(() => { const image = document.querySelector<HTMLImageElement>('img[src="https://oss.mcmods.cn/private-avatar.png?preview=fresh"]'); return Boolean(image?.complete && image.naturalWidth > 0); });
    assert.equal(refreshes, 1);
    assert.equal(unsignedReads, 0);
    await page.locator('main form').first().locator('button[type="submit"]').first().click();
    await page.getByText("Synthetic creator write barrier", { exact: true }).waitFor();
    assert.equal(saved?.avatarUrl, "https://oss.mcmods.cn/private-avatar.png");
    assert.equal(saved?.avatarFileId, "avatarfile01");
  } finally { await browser.close(); }
});

for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "fr-FR", "de-DE", "es-ES", "ru-RU"]) test(`REM-005 comparison labels and narrow-screen columns use ${locale} fallback`, { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => path === "/api/v1/mods/comparemod/revisions/compare" ? { data: { before: { version: 1, snapshot: { defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "before" }], galleryImages: [] } }, after: { version: 2, snapshot: { defaultLocale: "zh-CN", localizations: [{ locale: "zh-CN", name: "after" }], galleryImages: [] } }, changedFields: ["defaultLocale", "localizations"] } } : undefined);
  try {
    const { page } = browser;
    await page.context().addCookies([{ name: "mcmods-ui-locale", value: locale, url: fixture.origin }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.origin}/mods/comparemod/compare?before=before01&after=after01`);
    await page.locator("pre").first().waitFor();
    const labels = await page.locator("main strong").allTextContents();
    assert.equal(labels.length, 3);
    assert.equal(labels.some(label => label.includes("mods.history.fields.")), false);
    for (const row of await page.locator("main .grid").all()) {
      const children = row.locator(":scope > *");
      if (await children.count() !== 3) continue;
      const first = await children.nth(0).boundingBox();
      const second = await children.nth(1).boundingBox();
      assert(first && second);
      assert(first.x + first.width <= second.x + 0.5, "field labels must not overlap the value column");
    }
  } finally { await browser.close(); }
});

const communityProviders: APIHandler = request => {
  if (request.path === "/api/v1/community/post-categories") return { data: { kind: "discussion", items: ["help"] } };
  if (request.path === "/api/v1/economy/currencies") return { data: { items: [] } };
  return common(request);
};

test("RPH-004 choosing a block preserves the unresolved item with identical Minecraft text", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/catalog/resources") return { data: { items: request.url.searchParams.get("kindCode") === "minecraft.block" ? [{ publicId: "block0001", id: "audit:shared", kind: "minecraft.block", registry: "blocks", names: { "en-US": "Audit Block" } }] : [], total: request.url.searchParams.get("kindCode") === "minecraft.block" ? 1 : 0, limit: 40, offset: 0 } };
    if (request.path === "/api/v1/catalog/resource-presentations") return { data: { items: [] } };
    return communityProviders(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/new`);
    await page.getByRole("button", { name: "Select related resources", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cannot find the resource?", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Enter a resource ID 1", exact: true }).fill("audit:shared");
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Resource type", exact: true }).selectOption("minecraft.block");
    await dialog.getByRole("button", { name: /Audit Block .*audit:shared/ }).click();
    assert.match(await dialog.innerText(), /Select: 2/);
  } finally { await browser.close(); }
});

test("RPH-005 production picker hydrates shuffled aliases using stable input mapping", { timeout: 30_000 }, async () => {
  let hydrated = false;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/review-locks/community_post/aliaspost01") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (request.path === "/api/v1/community/posts/aliaspost01") return { data: { id: "aliaspost01", kind: "discussion", category: "help", title: "Alias selection", sourceLocale: "en-US", bodyMarkdown: "Synthetic alias body", minecraftVersions: [], projects: [], resources: [{ kind: "minecraft.item", identifier: "legacy:first", unresolved: true }, { kind: "minecraft.item", identifier: "legacy:second", unresolved: true }], canEdit: true, publishedRevisionId: "basealias1" } };
    if (request.path === "/api/v1/catalog/resources") return { data: { items: [], total: 0, limit: 40, offset: 0 } };
    if (request.path === "/api/v1/catalog/resource-presentations") {
      const body = JSON.parse(request.body);
      assert.deepEqual(body.items.map((item: { id: string }) => item.id), ["legacy:first", "legacy:second"]);
      hydrated = true;
      const canonical = { publicId: "canonical01", id: "canonical:widget", kind: "minecraft.item", registry: "items", names: { "en-US": "Canonical Widget" }, resolvedName: "Canonical Widget" };
      return { data: { items: [{ ...canonical, inputIndex: 1 }, { ...canonical, inputIndex: 0 }], unresolvedInputIndices: [] } };
    }
    return communityProviders(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/aliaspost01/edit`);
    await page.getByRole("button", { name: "Select related resources", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Canonical Widget · canonical:widget", exact: true }).waitFor();
    assert.equal(hydrated, true);
    assert.match(await dialog.innerText(), /Select: 1/);
    assert.equal(await dialog.getByRole("button", { name: "Canonical Widget · canonical:widget", exact: true }).count(), 1);
  } finally { await browser.close(); }
});

test("RPH-001 changelog submission preserves the baseline read by the editor", { timeout: 30_000 }, async () => {
  let sent: { baseRevisionId: string; projectVersion: string } | undefined;
  const target = { type: "mod", id: "project001", name: "Changelog target", url: "/mods/changelogmod", canEdit: true };
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/changelogs/changelog01") {
      if (request.method === "PUT") { sent = JSON.parse(request.body); return { status: 503, error: "Synthetic changelog write barrier" }; }
      return { data: { target, item: { id: "changelog01", publishedRevisionId: "basechangelog1", eventAt: stamp, minecraftVersions: ["1.20.1"], projectVersion: "1.0.0", defaultLocale: "en-US", localizations: [{ locale: "en-US", bodyMarkdown: "Original changelog body" }] } } };
    }
    if (request.path === "/api/v1/changelogs") return { data: { target, categories: [], items: [], limit: 20, hasMore: false, nextCursor: "" } };
    if (request.path === "/api/v1/review-locks/project_changelog/changelog01") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/changelogs/changelog01/edit`);
    await page.getByLabel("Mod / project version", { exact: true }).fill("1.0.1");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByText("Synthetic changelog write barrier", { exact: true }).waitFor();
    assert.equal(sent?.baseRevisionId, "basechangelog1");
    assert.equal(sent?.projectVersion, "1.0.1");
  } finally { await browser.close(); }
});

test("RPH-007 data-version links distinguish Mod versions and retain selected versions through navigation", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/mods/versionmod/content-resources/res001") return { data: { publicId: "res001", canonicalId: "audit:versioned", kindCode: "minecraft.item", capabilities: { editResource: false }, details: [], versions: ["1.0.0", "2.0.0"].map((modVersion, index) => ({ publicId: `version000${index + 1}`, label: "1.20.1 · fabric", minecraftVersions: ["1.20.1"], loaders: ["fabric"], modVersion, sourceKind: "manual", hasDetail: false })) } };
    if (path === "/api/v1/mods/versionmod/content-resources/res001/similar") return { data: { groupId: "", items: [] } };
    if (path === "/api/v1/content-metrics/res001" || path === "/api/v1/content-metrics/res001/view") return { status: 404, error: "Synthetic untracked resource" };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/versionmod/resources/res001?version=version0001`);
    const first = page.getByRole("link", { name: "1.0.0 · 1.20.1 · fabric", exact: true });
    const second = page.getByRole("link", { name: "2.0.0 · 1.20.1 · fabric", exact: true });
    await second.waitFor();
    assert.equal(await first.getAttribute("aria-current"), "page");
    await second.click();
    await page.waitForURL(url => url.searchParams.get("version") === "version0002");
    assert.equal(await second.getAttribute("aria-current"), "page");
    await page.reload();
    await second.waitFor();
    assert.equal(await second.getAttribute("aria-current"), "page");
    await page.goBack();
    await page.waitForURL(url => url.searchParams.get("version") === "version0001");
    await first.and(page.locator('[aria-current="page"]')).waitFor();
    assert.equal(await first.getAttribute("aria-current"), "page");
  } finally { await browser.close(); }
});

test("TP-007 production Mod list decodes configured API icons and preserves empty-icon placeholders", { timeout: 30_000 }, async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#48aacc" } }).png().toBuffer();
  const iconReads: string[] = [];
  const browser = await fixture.page(request => {
    const { path } = request;
    if (path === "/api/v1/modpacks/icon-pack") return { data: {
      id: "iconpack01", siteId: "icon-pack", primaryName: "Icon test pack", secondaryName: "", abbreviation: "", summary: "Synthetic icon contract", defaultLocale: "en-US", environment: "bothRequired", primaryCategory: "technology", packType: "native", packagingMethod: "modrinth", compatibilities: [], tags: [], searchKeywords: [], authors: [], officialStatus: "active", sourceStatus: "open", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "", iconUrl: "", bodyMarkdown: "", submissionMethod: "modrinth", links: [], galleryImages: [], reviewStatus: "approved", createdAt: stamp, updatedAt: stamp, canEdit: false,
      mods: [true, false].map((hasIcon, index) => ({ modPublicId: `iconmod0${index}`, modSiteId: hasIcon ? "has-icon" : "no-icon", modName: hasIcon ? "Resolved with icon" : "Resolved no icon", iconUrl: hasIcon ? "https://oss.mcmods.cn/stable-reference.png" : "", provider: "modrinth", identifier: hasIcon ? "audit:icon" : "audit:empty", resolved: true, clientRequired: true, serverRequired: true })),
    } };
    if (path === "/api/v1/mods/has-icon/icon" || path === "/api/v1/mods/no-icon/icon") { iconReads.push(path); return { bytes: png, contentType: "image/png" }; }
    if (path === "/api/v1/projects/iconpack01/follow") return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/ratings/modpack/iconpack01" || path === "/api/v1/content-metrics/iconpack01" || path === "/api/v1/content-metrics/iconpack01/view") return { status: 404, error: "Synthetic optional statistics unavailable" };
    if (path === "/api/v1/comment-targets/modpack/iconpack01/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/modpacks/icon-pack?tab=mods`);
    await page.getByText("Resolved with icon", { exact: true }).waitFor();
    const image = page.locator('img[src="https://api.example.test/api/v1/mods/has-icon/icon"]');
    await image.waitFor();
    await page.waitForFunction(() => { const image = document.querySelector<HTMLImageElement>('img[src="https://api.example.test/api/v1/mods/has-icon/icon"]'); return Boolean(image?.complete && image.naturalWidth === 32); });
    assert.equal(iconReads.includes("/api/v1/mods/has-icon/icon"), true);
    assert.equal(iconReads.includes("/api/v1/mods/no-icon/icon"), false);
    assert.equal(await page.getByText("Resolved no icon", { exact: true }).count(), 1);
    await page.reload();
    await image.waitFor();
  } finally { await browser.close(); }
});
