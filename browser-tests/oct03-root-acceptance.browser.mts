import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

const reader = { id: "acceptance-reader", username: "Synthetic reader", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 };
const skin = { publicId: "skin0001", kind: "skin", model: "default", name: "Recovered synthetic skin", description: "Synthetic description", tags: [], visibility: "public", reviewStatus: "approved", textureHash: "", downloads: 0, createdAt: "2026-10-01T00:00:00Z", canEdit: false, canUse: true, inWardrobe: false };
const profile = { publicId: "play0001", name: "Recovered synthetic player", uuid: "00000000-0000-4000-8000-000000000001", bio: "Synthetic profile", visibility: "public", isDefault: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const emptyComments = { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } };
const server = { id: "server0001", name: "Synthetic server", shortDescription: "Synthetic list summary", languages: ["en-US"], primaryTag: "survival", minecraftVersions: ["1.21"], minecraftVersion: "1.21", online: true, playersOnline: 1, playersMax: 20, address: "play.example.invalid:25565", bodyMarkdown: "", dedicatedClient: false, hasWhitelist: false, onlineMode: true, motd: "Synthetic server", modded: false, modListComplete: true, links: [], mods: [], canEdit: false, reviewStatus: "approved", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const providers: APIHandler = ({ path, method }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
  if (path === "/api/v1/users/me/drafts") return { data: method === "POST" ? { updatedAt: "2026-10-01T00:00:00Z" } : { items: [] } };
  if (path === "/api/v1/projects/server0001/follow" || path === "/api/v1/projects/plugin0001/follow") return { data: { followed: false, notificationsEnabled: false } };
  if (path === "/api/v1/review-locks/plugin/plugin0001") return { data: { locked: false } };
  if (path === "/api/v1/ratings/plugin/plugin0001" || path === "/api/v1/ratings/minecraft_server/server0001") return { data: { dimensions: [], canRate: false, canViewReviews: false, ratingCount: 0, overallAverage: 0, heatScore: 0, heatComponents: {}, engagement: {} } };
  if (path === "/api/v1/content-metrics/server0001/view" || path === "/api/v1/content-metrics/plugin0001/view") return { data: {} };
  if (path === "/api/v1/content-metrics/server0001" || path === "/api/v1/content-metrics/plugin0001") return { data: { id: path.split("/").at(-1), type: "plugin", createdAt: "2026-10-01T00:00:00Z", editCount: 0, directViews: 0, childViews: 0, totalViews: 0, recentEditors: [], editors: [], developers: [], tutorials: [], issues: [], news: [], discussions: [] } };
  if (path === "/api/v1/comment-targets/plugin/plugin0001/comments") return { data: emptyComments };
  if (path === "/api/v1/changelogs") return { data: { target: { type: "minecraft_server", id: server.id, name: server.name, url: `/servers/${server.id}`, canEdit: false }, categories: [], items: [], limit: 20, hasMore: false, nextCursor: "" } };
};
const providerPage = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? providers(request));

test("OCT02-R-016: skin detail retries the failed texture read without writing", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: reader };
    if (path === "/api/v1/skins/skin0001") {
      if (method !== "GET") writes++;
      assert.equal(method, "GET");
      return ++reads === 1 ? { status: 503, error: "Synthetic texture read unavailable" } : { data: skin };
    }
    if (path === "/api/v1/users/me/player-profiles") return { data: [profile] };
    if (path === "/api/v1/content/skin0001") return { status: 404, error: "No localized fixture" };
    if (path === "/api/v1/projects/skin0001/follow") return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/comment-targets/skin/skin0001/comments") return { data: emptyComments };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/skins/skin0001`);
    await page.getByText("Synthetic texture read unavailable", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: skin.name, exact: true }).waitFor();
    assert.equal(reads, 2);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("OCT02-R-016: profile-list failure remains visible beside a skin and retry restores application choices", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: reader };
    if (path === "/api/v1/skins/skin0001") return { data: skin };
    if (path === "/api/v1/users/me/player-profiles") {
      assert.equal(method, "GET");
      return ++reads === 1 ? { status: 503, error: "Synthetic profile list unavailable" } : { data: [profile] };
    }
    if (path === "/api/v1/content/skin0001") return { status: 404, error: "No localized fixture" };
    if (path === "/api/v1/projects/skin0001/follow") return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/comment-targets/skin/skin0001/comments") return { data: emptyComments };
    if (path.startsWith("/api/v1/users/me/player-profiles/")) { writes++; return { data: profile }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/skins/skin0001`);
    await page.getByRole("heading", { name: skin.name, exact: true }).waitFor();
    await page.getByRole("alert").filter({ hasText: "Synthetic profile list unavailable" }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Apply to player profile", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const select = page.getByRole("combobox", { name: "Apply to player profile", exact: true });
    await select.waitFor();
    assert.equal(await select.inputValue(), profile.publicId);
    assert.equal(await page.getByRole("alert").filter({ hasText: "Synthetic profile list unavailable" }).count(), 0);
    assert.equal(reads, 2);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("OCT02-R-016: player detail retries a failed read and renders the persisted identifier", { timeout: 30_000 }, async () => {
  let reads = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: reader };
    if (path === "/api/v1/player-profiles/play0001") {
      assert.equal(method, "GET");
      return ++reads === 1 ? { status: 503, error: "Synthetic player read unavailable" } : { data: profile };
    }
    if (path === "/api/v1/comment-targets/player_profile/play0001/comments") return { data: emptyComments };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/players/play0001`);
    await page.getByText("Synthetic player read unavailable", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: profile.name, exact: true }).waitFor();
    await page.getByText(profile.uuid, { exact: true }).waitFor();
    assert.equal(reads, 2);
  } finally { await browser.close(); }
});

test("OCT02-FP-018: saving one profile field preserves other drafts and edits made during the request", { timeout: 30_000 }, async () => {
  const firstWrite = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const writes: Record<string, unknown>[] = [];
  const settings = { publicId: reader.id, username: "OriginalName", signature: "Original signature", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: ["", "", "", "", "", ""], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false };
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: reader };
    if (path === "/api/v1/users/me/profile-settings") {
      if (method === "GET") return { data: settings };
      assert.equal(method, "PUT");
      writes.push(JSON.parse(body));
      if (writes.length === 1) { started.resolve(); return firstWrite.promise; }
      return { status: 503, error: "Synthetic profile save unavailable" };
    }
    if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
    if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
    if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", secondaryLocale: "zh-CN", editableLocales: ["en-US", "zh-CN"] } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=settings`);
    const name = page.locator("#profile-username");
    const signature = page.locator("#profile-signature");
    await name.fill("OtherDraftName");
    await signature.fill("Submitted signature");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await started.promise;
    await signature.fill("Newer signature during request");
    await name.fill("NewerNameDraft");
    firstWrite.resolve({ data: { ...settings, signature: "Submitted signature" } });
    await page.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();
    assert.equal(await signature.inputValue(), "Newer signature during request");
    assert.equal(await name.inputValue(), "NewerNameDraft");
    assert.deepEqual(writes, [{ signature: "Submitted signature" }]);
    await page.getByRole("button", { name: "Save username", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Synthetic profile save unavailable" }).waitFor();
    assert.equal(await signature.inputValue(), "Newer signature during request");
    assert.equal(await name.inputValue(), "NewerNameDraft");
    assert.deepEqual(writes[1], { username: "NewerNameDraft" });
  } finally { firstWrite.resolve({ data: settings }); await browser.close(); }
});

test("OCT02-FP-063: source binding retains its form after await and refresh errors are never replaced by saved or queued", { timeout: 30_000 }, async () => {
  const base = "/api/v1/projects/plugin/plugin0001/automation";
  const pendingBind = Promise.withResolvers<APIReply>();
  const bindStarted = Promise.withResolvers<void>();
  let failRead = false;
  let binds = 0;
  let saves = 0;
  let runs = 0;
  const browser = await providerPage(({ path, method, body }) => {
    if (path === "/api/v1/content-projects/plugin/automation-acceptance") return { data: { id: "plugin0001", projectType: "plugin", siteId: "automation-acceptance", primaryName: "Synthetic automation project", abbreviation: "", defaultLocale: "en-US", localizations: [], summary: "Synthetic project", bodyMarkdown: "", reviewStatus: "approved", canEdit: true, minecraftVersions: [], loaders: [], categories: [], features: [], authors: [], links: [], galleryImages: [], parentProjects: [], license: "MIT", iconUrl: "" } };
    if (path === base && method === "GET") return failRead ? { status: 503, error: "Synthetic automation refresh unavailable" } : { data: { project: { id: "plugin0001", type: "plugin", url: "/plugins/automation-acceptance" }, settings: [], sources: [{ sourceType: "github", externalProjectId: "fixture/project", externalProjectUrl: "https://github.com/fixture/project", verifiedAt: "2026-10-01T00:00:00Z" }] } };
    if (path === `${base}/sources`) {
      assert.equal(method, "POST");
      assert.deepEqual(JSON.parse(body), { sourceType: "github", url: "https://github.com/fixture/new-project" });
      binds++;
      bindStarted.resolve();
      return pendingBind.promise;
    }
    if (path === base && method === "PUT") { saves++; failRead = true; return { data: {} }; }
    if (path === `${base}/runs`) {
      if (method === "POST") { runs++; failRead = true; return { data: {} }; }
      return { data: { items: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/plugins/automation-acceptance`);
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Project auto updates", exact: true }) });
    const source = panel.getByRole("combobox", { name: "Source", exact: true }).first();
    const url = panel.getByRole("textbox", { name: "Modrinth, CurseForge, or GitHub project URL", exact: true });
    await source.selectOption("github");
    await url.fill("https://github.com/fixture/new-project");
    await panel.getByRole("button", { name: "Verify and bind source", exact: true }).click();
    await bindStarted.promise;
    assert.equal(await url.isDisabled(), true);
    pendingBind.resolve({ data: {} });
    await page.waitForFunction(() => { const input = document.querySelector('input[name="url"]'); return input instanceof HTMLInputElement && !input.disabled && input.value === ""; });
    assert.equal(binds, 1);
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "Synthetic automation refresh unavailable" }).waitFor();
    assert.equal(await panel.getByText("Auto-update settings saved.", { exact: true }).count(), 0);
    assert.equal(saves, 1);
    await panel.getByRole("button", { name: "Run now", exact: true }).nth(1).click();
    await panel.getByRole("alert").filter({ hasText: "Synthetic automation refresh unavailable" }).waitFor();
    assert.equal(await panel.getByText("The auto-update run was queued.", { exact: true }).count(), 0);
    assert.equal(runs, 1);
  } finally { pendingBind.resolve({ data: {} }); await browser.close(); }
});

test("OCT02-FP-064: creator debounce never sends an old cursor with the new query", { timeout: 30_000 }, async () => {
  const requests: Array<{ query: string; cursor: string }> = [];
  const browser = await providerPage(({ path, url }) => {
    if (path !== "/api/v1/creators") return;
    const query = url.searchParams.get("query") ?? "";
    const cursor = url.searchParams.get("cursor") ?? "";
    requests.push({ query, cursor });
    return { data: { items: [], counts: { author: 0, team: 0 }, hasMore: true, nextCursor: query ? "new-creator-cursor" : "old-creator-cursor" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/authors`);
    const more = page.getByRole("button", { name: "Load more authors and teams", exact: true });
    await more.waitFor();
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 200));
    await page.getByRole("searchbox").fill("new scope");
    assert.equal(await more.isDisabled(), true, "scope must close the cursor guard before the debounce fires");
    await more.evaluate(element => (element as HTMLButtonElement).click());
    assert.deepEqual(requests.filter(request => request.query), []);
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/creators" && new URL(response.url()).searchParams.get("query") === "new scope");
    await page.clock.runFor(250);
    await refreshed;
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Load more authors and teams" && !button.disabled));
    const appended = page.waitForResponse(response => new URL(response.url()).searchParams.get("cursor") === "new-creator-cursor");
    await more.click();
    await appended;
    assert(requests.some(request => request.query === "new scope" && request.cursor === "new-creator-cursor"));
    assert(!requests.some(request => request.query === "new scope" && request.cursor === "old-creator-cursor"));
  } finally { await browser.close(); }
});

test("OCT02-FP-064: server search disables an old cursor until the new scope has loaded", { timeout: 30_000 }, async () => {
  const pending = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const requests: Array<{ query: string; cursor: string }> = [];
  const browser = await providerPage(({ path, url }) => {
    if (path !== "/api/v1/servers") return;
    const query = url.searchParams.get("q") ?? "";
    const cursor = url.searchParams.get("cursor") ?? "";
    requests.push({ query, cursor });
    if (query === "new scope" && !cursor) { started.resolve(); return pending.promise; }
    return { data: { items: [server], limit: 20, hasMore: true, nextCursor: query ? "new-server-cursor" : "old-server-cursor" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers`);
    const more = page.getByRole("button", { name: "Load more servers", exact: true });
    await more.waitFor();
    await page.locator("#server-search").fill("new scope");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await started.promise;
    assert.equal(await more.isDisabled(), true);
    await more.evaluate(element => (element as HTMLButtonElement).click());
    pending.resolve({ data: { items: [server], limit: 20, hasMore: true, nextCursor: "new-server-cursor" } });
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Load more servers" && !button.disabled));
    const appended = page.waitForResponse(response => new URL(response.url()).searchParams.get("cursor") === "new-server-cursor");
    await more.click();
    await appended;
    assert(!requests.some(request => request.query === "new scope" && request.cursor === "old-server-cursor"));
    assert(requests.some(request => request.query === "new scope" && request.cursor === "new-server-cursor"));
  } finally { pending.resolve({ data: { items: [], limit: 20, hasMore: false, nextCursor: "" } }); await browser.close(); }
});

test("OCT02-FP-065: failed server history leaves the skeleton, retries, and clears the old chart on range change", { timeout: 30_000 }, async () => {
  const pending = Promise.withResolvers<APIReply>();
  const rangeStarted = Promise.withResolvers<void>();
  const ranges: string[] = [];
  let failRead = true;
  const point = { checkedAt: "2026-10-01T00:00:00Z", online: true, latencyMs: 10, playersOnline: 3, playersMax: 20 };
  const browser = await providerPage(({ path, url }) => {
    if (path === "/api/v1/servers/server0001") return { data: server };
    if (path === "/api/v1/servers/server0001/history") {
      const range = url.searchParams.get("range") ?? "";
      ranges.push(range);
      if (failRead) return { status: 503, error: "Synthetic history unavailable" };
      if (range === "7d") { rangeStarted.resolve(); return pending.promise; }
      return { data: { range, points: [point], generatedAt: point.checkedAt } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/server0001`);
    await page.getByRole("alert").filter({ hasText: "Synthetic history unavailable" }).waitFor();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Player history", exact: true }) });
    assert.equal(await section.locator(".animate-pulse").count(), 0);
    failRead = false;
    await section.getByRole("button", { name: "Retry", exact: true }).click();
    const chart = page.getByRole("img", { name: "Server player count over time", exact: true });
    await chart.waitFor();
    const rangeGroup = page.getByRole("group", { name: "Time range", exact: true });
    await rangeGroup.getByRole("button").nth(1).click();
    await rangeStarted.promise;
    assert.equal(await chart.count(), 0, "the old range must not masquerade as the newly requested range");
    pending.resolve({ data: { range: "7d", points: [], generatedAt: point.checkedAt } });
    await section.getByText("There are no status samples in this time range.", { exact: true }).waitFor();
    assert.deepEqual(ranges.slice(-3), ["24h", "24h", "7d"]);
    assert.equal(new URL(page.url()).searchParams.get("range"), "7d");
  } finally { pending.resolve({ data: { range: "7d", points: [], generatedAt: point.checkedAt } }); await browser.close(); }
});

test("OCT02-FP-066: a pending probe cannot run twice or cancel, and probe failure preserves its address", { timeout: 30_000 }, async () => {
  const pending = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  let probes = 0;
  const browser = await providerPage(({ path, method, body }) => {
    if (path === "/api/v1/servers/settings") return { data: { maxProofFiles: 5, maxProofTotalBytes: 10_485_760, nameMaxLength: 80, summaryMaxLength: 240, historyDays: 90, reviewRequired: false } };
    if (path === "/api/v1/servers/probe") {
      assert.equal(method, "POST");
      assert.deepEqual(JSON.parse(body), { address: "play.example.invalid:25565" });
      probes++;
      started.resolve();
      return pending.promise;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/new`);
    const address = page.getByLabel("Server address", { exact: true });
    await address.fill("play.example.invalid:25565");
    await page.getByRole("button", { name: "Connect and check", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(await address.isDisabled(), true);
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    assert.equal(await cancel.isDisabled(), true);
    await cancel.evaluate(button => (button as HTMLButtonElement).click());
    assert.equal(new URL(page.url()).pathname, "/servers/new");
    pending.resolve({ status: 503, error: "Synthetic probe unavailable" });
    await page.getByText("Synthetic probe unavailable", { exact: true }).waitFor();
    assert.equal(probes, 1);
    assert.equal(await address.inputValue(), "play.example.invalid:25565");
    assert.equal(await address.isDisabled(), false);
    assert.equal(await cancel.isEnabled(), true);
  } finally { pending.resolve({ status: 503, error: "Synthetic probe unavailable" }); await browser.close(); }
});

test("OCT02-FP-066: successful server creation still reaches its result when draft completion fails", { timeout: 30_000 }, async () => {
  let creations = 0;
  let completions = 0;
  const browser = await providerPage(({ path, method, body }) => {
    if (path === "/api/v1/servers/settings") return { data: { maxProofFiles: 5, maxProofTotalBytes: 10_485_760, nameMaxLength: 80, summaryMaxLength: 240, historyDays: 90, reviewRequired: false } };
    if (path === "/api/v1/servers/probe") return { data: { address: server.address, motd: server.name, detectedMinecraftVersion: "1.21", minecraftVersion: "1.21", mods: [], online: true, playersOnline: 1, playersMax: 20, latencyMs: 10 } };
    if (path === "/api/v1/servers" && method === "POST") {
      creations++;
      assert.equal(JSON.parse(body).name, server.name);
      return { data: { id: server.id, published: true, reviewStatus: "approved" } };
    }
    if (path === "/api/v1/users/me/drafts/complete") {
      completions++;
      assert.equal(method, "POST");
      assert.equal(JSON.parse(body).reviewTargetPublicId, server.id);
      return { status: 503, error: "Synthetic draft completion unavailable" };
    }
    if (path === "/api/v1/servers/server0001") return { data: server };
    if (path === "/api/v1/servers/server0001/history") return { data: { range: "24h", points: [], generatedAt: "2026-10-01T00:00:00Z" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/new`);
    await page.getByLabel("Server address", { exact: true }).fill(server.address);
    await page.getByRole("button", { name: "Connect and check", exact: true }).click();
    const submit = page.getByRole("button", { name: "Submit for review", exact: true });
    await submit.waitFor();
    await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await page.waitForURL(url => url.pathname === `/servers/${server.id}`);
    await page.getByRole("heading", { name: server.name, exact: true }).waitFor();
    assert.equal(creations, 1, "a secondary draft failure must not make the user retry the successful resource creation");
    assert.equal(completions, 1);
  } finally { await browser.close(); }
});

test("OCT02-FP-045: stale cross-page ports cannot crash advancement linking; pointer cancel and undo restore positions", { timeout: 30_000 }, async () => {
  const section = { publicId: "layout0001", versionPublicId: "version01", templatePublicId: "template1", templateCode: "advancement", templateBuiltin: true, templateI18nKey: "", parentPublicId: "", defaultLocale: "en-US", displayMode: "compact", ordinal: 0, status: "active", publishedRevisionId: "revision1", localizations: [{ locale: "en-US", name: "Synthetic advancement page", summary: "", contentMarkdown: "" }], resourceCount: 3 };
  const node = (id: string, name: string, x = 0) => ({ versionPublicId: section.versionPublicId, resourcePublicId: id, sectionPublicId: section.publicId, label: name, ordinal: x, advancement: { parentResourcePublicId: "", groupId: "group1", x, y: 0 } });
  let writes = 0;
  const browser = await fixture.page(({ path, method, url }) => {
    if (path !== "/api/v1/mods/layout-acceptance/content-sections/layout0001/layout") return;
    if (method === "PATCH") { writes++; return { status: 503, error: "Synthetic layout save unavailable" }; }
    return { data: { section, categories: [], items: url.searchParams.has("cursor") ? [node("child0001", "New child"), node("child0002", "Other child", 1)] : [node("parent001", "Old parent")], total: 3, limit: 500, hasMore: !url.searchParams.has("cursor"), nextCursor: url.searchParams.has("cursor") ? "" : "next-layout-page", capabilities: {} } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/mods/layout-acceptance/data/sections/layout0001/arrange`);
    const oldPort = page.getByRole("button", { name: "Parent connection port for Old parent", exact: true });
    await oldPort.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const inputPort = page.getByRole("button", { name: "Child connection port for New child", exact: true });
    await inputPort.focus();
    await page.keyboard.press("Enter");
    await page.getByText("This link cannot be created: an advancement cannot link to itself or create a cycle.", { exact: true }).waitFor();
    const article = page.locator("article").filter({ hasText: "New child" });
    const handle = article.locator("div.cursor-grab");
    const initialStyle = await article.getAttribute("style");
    await handle.scrollIntoViewIfNeeded();
    const bounds = await handle.boundingBox();
    assert(bounds);
    const touch = await page.context().newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + 60, y: bounds.y + 35 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x + 160, y: bounds.y + 70 }] });
    await page.waitForFunction(style => Array.from(document.querySelectorAll("article")).some(element => element.textContent?.includes("New child") && element.getAttribute("style") !== style), initialStyle);
    assert.notEqual(await article.getAttribute("style"), initialStyle);
    await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await touch.detach();
    assert.equal(await article.getAttribute("style"), initialStyle, "native pointer cancellation must discard the preview");
    await handle.scrollIntoViewIfNeeded();
    const restoredBounds = await handle.boundingBox();
    assert(restoredBounds);
    await page.mouse.move(restoredBounds.x + 60, restoredBounds.y + 35);
    await page.mouse.down();
    await page.mouse.move(restoredBounds.x + 145, restoredBounds.y + 55, { steps: 5 });
    await page.waitForFunction(style => Array.from(document.querySelectorAll("article")).some(element => element.textContent?.includes("New child") && element.getAttribute("style") !== style), initialStyle);
    await page.mouse.up();
    assert.notEqual(await article.getAttribute("style"), initialStyle);
    await page.getByRole("button", { name: "Undo last step", exact: true }).click();
    assert.equal(await article.getAttribute("style"), initialStyle);
    assert.equal(await page.getByRole("button", { name: "Undo last step", exact: true }).isDisabled(), true);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    assert.equal(new URL(page.url()).pathname, "/mods/layout-acceptance/data/sections/layout0001/arrange");
    await page.getByRole("button", { name: "Submit layout for review", exact: true }).first().click();
    await page.getByText("Synthetic layout save unavailable", { exact: true }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await article.getAttribute("style"), initialStyle);
  } finally { await browser.close(); }
});

test("OCT02-FP-045: a saved popup closes once without a second dirty confirmation and sends the real result to its opener", { timeout: 30_000 }, async () => {
  const patch = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const section = { publicId: "layout0001", versionPublicId: "version01", templatePublicId: "template1", templateCode: "advancement", templateBuiltin: true, templateI18nKey: "", parentPublicId: "", defaultLocale: "en-US", displayMode: "compact", ordinal: 0, status: "active", publishedRevisionId: "revision1", localizations: [], resourceCount: 2 };
  let writes = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path !== "/api/v1/mods/layout-acceptance/content-sections/layout0001/layout") return;
    if (method === "PATCH") {
      writes++;
      const value = JSON.parse(body) as { resources: Array<{ resourcePublicId: string; advancement: { parentResourcePublicId: string } }> };
      assert.equal(value.resources.find(resource => resource.resourcePublicId === "child0001")?.advancement.parentResourcePublicId, "parent001");
      started.resolve();
      return patch.promise;
    }
    return { data: { section, categories: [], items: ["parent001", "child0001"].map((id, index) => ({ resourcePublicId: id, versionPublicId: section.versionPublicId, sectionPublicId: section.publicId, label: index ? "New child" : "Old parent", ordinal: index, advancement: { parentResourcePublicId: "", groupId: "group1", x: index, y: 0 } })), total: 2, limit: 500, hasMore: false, nextCursor: "", capabilities: {} } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/login`);
    const received = page.evaluate(() => new Promise<unknown>(resolve => {
      window.addEventListener("message", event => { if (event.origin === location.origin && event.data?.type === "mcmods:content-layout-saved") resolve(event.data); }, { once: true });
    }));
    const opened = page.waitForEvent("popup");
    await page.evaluate(url => { window.open(url, "_blank"); }, `${fixture.origin}/mods/layout-acceptance/data/sections/layout0001/arrange`);
    const popup = await opened;
    const errors: string[] = [];
    const dialogs: string[] = [];
    popup.on("pageerror", error => errors.push(error.message));
    popup.on("dialog", dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
    const parent = popup.getByRole("button", { name: "Parent connection port for Old parent", exact: true });
    await parent.focus();
    await popup.keyboard.press("Enter");
    await popup.getByRole("button", { name: "Child connection port for New child", exact: true }).focus();
    await popup.keyboard.press("Enter");
    await popup.getByRole("button", { name: "Undo last step", exact: true }).waitFor();
    await popup.getByRole("button", { name: "Cancel", exact: true }).first().click();
    assert.deepEqual(dialogs, ["confirm"], "dirty cancellation offers one explicit decision");
    assert.equal(popup.isClosed(), false);
    const submit = popup.getByRole("button", { name: "Submit layout for review", exact: true }).first();
    await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(await submit.isDisabled(), true);
    assert.equal(writes, 1);
    const closed = popup.waitForEvent("close");
    patch.resolve({ data: { publicId: section.publicId, revisionId: "revision2", reviewStatus: "pending", changeRequestId: "change001" } });
    await closed;
    assert.deepEqual(await received, { type: "mcmods:content-layout-saved", siteId: "layout-acceptance", sectionId: section.publicId, result: { publicId: section.publicId, revisionId: "revision2", reviewStatus: "pending", changeRequestId: "change001" } });
    assert.deepEqual(dialogs, ["confirm"], "successful saving must remove the beforeunload dirty warning before closing");
    assert.deepEqual(errors, []);
  } finally { patch.resolve({ status: 503, error: "Synthetic finalizer" }); await browser.close(); }
});
