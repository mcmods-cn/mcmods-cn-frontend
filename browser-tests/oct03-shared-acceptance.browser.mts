import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

// Actual standalone production pages; only the declared project API transport
// is deterministic. These assertions do not establish server authorization,
// database persistence, paid provider availability or translation quality.
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
async function panel(page: Page, name: string, group: string) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="workbench"]').waitFor();
  if (await page.locator(`[data-admin-panel="${name}"]`).count() === 0) await page.locator(`[data-admin-group="${group}"]`).click();
  await page.locator(`[data-admin-panel="${name}"]`).click();
}
async function changeLanguage(page: Page, locale: "zh-CN" | "en-US") {
  await page.evaluate(() => {
    if (Reflect.has(window, "oct03LocaleObservations")) return;
    const events: Array<{ eventValue: string | null; cookieLocale?: string }> = [];
    Reflect.set(window, "oct03LocaleObservations", events);
    window.addEventListener("storage", event => { if (event.key === "mcmods-ui-locale-sync") events.push({ eventValue: event.newValue, cookieLocale: document.cookie.match(/(?:^|; )mcmods-ui-locale=([^;]+)/)?.[1] }); });
  });
  const currentLocale = await page.evaluate(() => document.documentElement.lang);
  const languagePage = await page.context().newPage();
  try {
    await languagePage.goto(`${fixture.origin}/login`);
    // Observe a real client state transition before changing the SSR-rendered
    // selector, so an action before React hydration cannot be mistaken for a
    // language-sync failure.
    await languagePage.getByRole("button", { name: /^(Register|注册)$/, exact: true }).click();
    await languagePage.locator('input[maxlength="32"]').waitFor();
    await languagePage.waitForFunction(locale => document.documentElement.lang === locale, currentLocale);
    await languagePage.getByRole("combobox", { name: /^(Language|语言)$/, exact: true }).selectOption(locale);
    await languagePage.waitForFunction(locale => document.documentElement.lang === locale, locale);
    await page.waitForFunction(locale => document.documentElement.lang === locale, locale).catch(async error => { console.error("Locale sync diagnostic", { requested: locale, source: await languagePage.evaluate(() => document.documentElement.lang), target: await page.evaluate(() => document.documentElement.lang), url: page.url(), observed: await page.evaluate(() => Reflect.get(window, "oct03LocaleObservations")), cookieLocale: await page.evaluate(() => document.cookie.match(/(?:^|; )mcmods-ui-locale=([^;]+)/)?.[1]) }); throw error; });
  } finally { await languagePage.close(); }
}
async function closeNotice(page: Page) {
  const notice = page.getByRole("alertdialog");
  if (await notice.count()) await notice.getByRole("button", { name: /^(Close|关闭)$/, exact: true }).click();
}
function actor(id: string, permissions: string[] = ["*"]) {
  return { id, username: `Actor ${id}`, email: `${id}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: permissions.map(code => ({ code, allow: true, priority: 100 })) };
}
const oss = (bucket: string) => ({ enabled: false, region: "cn-beijing", endpoint: "https://oss-cn-beijing.aliyuncs.com", publicEndpoint: "", bucket, accessKeyId: "", prefix: "fixture", useCName: false, downloadUrlTtlMinutes: 10, downloadUrlMode: "oss_presigned", allowedExtensions: [".png"], hasAccessKeySecret: false, hasSecurityToken: false });

function logReply(id: number, text: string, resetNeeded = false): APIReply {
  return { data: { items: [{ id, createdAt: "2026-10-03T00:00:00Z", level: "info", line: text }], lastId: id, oldestId: id, resetNeeded } };
}
test("OCT03 FS030 slow runtime polling is serial and stale filters cannot publish or reschedule", { timeout: 30_000 }, async () => {
  const initialStarted = Promise.withResolvers<void>();
  const initialRelease = Promise.withResolvers<void>();
  const initialFinished = Promise.withResolvers<void>();
  let reads = 0;
  const requests: Array<{ query: string; after: string | null }> = [];
  const browser = await fixture.page(async ({ path, url }) => {
    if (path === "/api/v1/admin/runtime-logs") {
      reads++;
      requests.push({ query: url.searchParams.get("q") ?? "", after: url.searchParams.get("afterId") });
      if (reads === 1) {
        initialStarted.resolve(); await initialRelease.promise; initialFinished.resolve();
        return logReply(99, "OLD FILTER MUST NOT RETURN");
      }
      return logReply(7, "CURRENT FILTER ENTRY");
    }
  });
  try {
    const { page } = browser;
    await page.clock.install();
    await panel(page, "logs-system", "logs");
    await page.clock.runFor(350);
    await initialStarted.promise;
    await page.clock.fastForward(20_000);
    assert.equal(reads, 1, "a still-pending response must not overlap recurring polls");
    await page.getByPlaceholder("Search runtime log output", { exact: true }).fill("current");
    await page.clock.runFor(350);
    await page.getByRole("log").locator("div").filter({ hasText: "CURRENT FILTER ENTRY" }).waitFor();
    initialRelease.resolve(); await initialFinished.promise;
    await page.clock.runFor(100);
    assert.equal(await page.getByText("OLD FILTER MUST NOT RETURN", { exact: false }).count(), 0);
    await page.clock.runFor(2600);
    await page.getByRole("log").locator("div").filter({ hasText: "CURRENT FILTER ENTRY" }).waitFor();
    assert.deepEqual(requests.slice(0, 3), [{ query: "", after: null }, { query: "current", after: null }, { query: "current", after: "7" }]);
    assert.equal(await page.getByRole("log").locator("div").filter({ hasText: "CURRENT FILTER ENTRY" }).count(), 1, "cursor overlap must deduplicate the visible record");
    await page.locator('[data-admin-panel="overview"]').click();
    const stoppedAt = reads;
    await page.clock.fastForward(20_000);
    assert.equal(reads, stoppedAt, "unmount must cancel future polling");
  } finally { initialRelease.resolve(); await browser.close(); }
});

test("OCT03 FS023 pack and sticker failures retain state, freeze duplicate writes and retry explicitly", { timeout: 30_000 }, async () => {
  const pending = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let packStatus = "active";
  let stickerStatus = "active";
  let writes = 0;
  let reads = 0;
  let failDelete = true;
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (path === "/api/v1/admin/stickers") {
      reads++;
      return { data: { locales: ["en-US"], packs: [{ code: "fixture", status: packStatus, sortOrder: 0, translations: { "en-US": "Synthetic pack" }, stickers: [{ code: "wave", status: stickerStatus, sortOrder: 0, imageFileId: "image001", mimeType: "image/png", sizeBytes: 1, sha256: "fixture", translations: { "en-US": "Synthetic wave" } }] }] } };
    }
    if (path === "/api/v1/oss/files/image001/content") return { bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"), contentType: "image/png" };
    if (path === "/api/v1/admin/sticker-packs/fixture" && method === "PUT") {
      writes++;
      if (writes === 1) { pending.resolve(); await release.promise; return { status: 503, error: "Synthetic pack write rejected" }; }
      packStatus = JSON.parse(body).status; return { data: {} };
    }
    if (path === "/api/v1/admin/sticker-packs/fixture/stickers/wave") {
      writes++;
      if (method === "DELETE") return failDelete ? { status: 503, error: "Synthetic sticker delete rejected" } : { data: {} };
      if (stickerStatus === "active") { stickerStatus = "retry-pending"; return { status: 503, error: "Synthetic sticker write rejected" }; }
      stickerStatus = JSON.parse(body).status; return { data: {} };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "stickers", "content");
    const article = page.locator("article").filter({ has: page.getByRole("heading", { name: "Synthetic pack", exact: true }) });
    const packToggle = article.getByRole("button", { name: "Disable", exact: true }).first();
    await packToggle.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error("Expected a button"); button.click(); button.click(); });
    await pending.promise;
    assert.equal(writes, 1);
    assert.equal(await packToggle.isDisabled(), true);
    release.resolve();
    await page.getByText("Synthetic pack write rejected", { exact: true }).first().waitFor();
    await closeNotice(page);
    assert.equal(reads, 1, "failed mutations must not replace the original catalog");
    await packToggle.click();
    await article.getByRole("button", { name: "Enable", exact: true }).waitFor();
    assert.equal(reads, 2);
    const sticker = article.locator('div.rounded-lg').filter({ has: page.getByText("Synthetic wave", { exact: true }) }).first();
    await sticker.getByRole("button", { name: "Disable", exact: true }).click();
    await page.getByText("Synthetic sticker write rejected", { exact: true }).first().waitFor();
    await closeNotice(page);
    assert.equal(await sticker.getByRole("button", { name: "Disable", exact: true }).count(), 1);
    await sticker.getByRole("button", { name: "Disable", exact: true }).click();
    await sticker.getByRole("button", { name: "Enable", exact: true }).waitFor();
    const beforeDelete = writes;
    page.once("dialog", dialog => void dialog.dismiss());
    await sticker.getByRole("button", { name: "Delete", exact: true }).click();
    assert.equal(writes, beforeDelete);
    page.once("dialog", dialog => void dialog.accept());
    await sticker.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Synthetic sticker delete rejected", { exact: true }).first().waitFor();
    await closeNotice(page);
    assert.equal(await sticker.getByText("Synthetic wave", { exact: true }).count(), 1);
    assert.equal(writes, beforeDelete + 1);
    failDelete = false;
  } finally { release.resolve(); await browser.close(); }
});

test("OCT03 FS021 limited reviewer, sticker and AI roles bootstrap without forbidden reads or logout", { timeout: 40_000 }, async () => {
  for (const role of [
    { permissions: ["admin.access", "project.review"], panel: "reviews-content", group: "reviews", endpoint: "/api/v1/reviews/content", reply: { total: 0, facets: { categories: [], operations: [], projectTypes: [] }, items: [] } },
    { permissions: ["admin.access", "sticker.manage"], panel: "stickers", group: "content", endpoint: "/api/v1/admin/stickers", reply: { locales: ["en-US"], packs: [] } },
    { permissions: ["admin.access", "ai.read"], panel: "ai-task-logs", group: "ai", endpoint: "/api/v1/admin/ai/tasks", reply: [] },
  ]) {
    const forbidden: string[] = [];
    let authReads = 0;
    const browser = await fixture.page(({ path }) => {
      if (path === "/api/v1/auth/me") { authReads++; return { data: actor("limited001", role.permissions) }; }
      if (["/api/v1/admin/config", "/api/v1/admin/permissions", "/api/v1/admin/users"].includes(path)) { forbidden.push(path); return { status: 403, error: "This role cannot read this endpoint" }; }
      if (path === "/api/v1/admin/ai/config") return { data: { enabled: false, providers: [], models: [], taskModels: [] } };
      if (path === role.endpoint) return { data: role.reply };
    });
    try {
      await panel(browser.page, role.panel, role.group);
      await browser.page.locator(`[data-admin-panel="${role.panel}"]`).waitFor();
      await browser.page.getByText("Actor limited001", { exact: false }).last().waitFor();
      assert.equal(new URL(browser.page.url()).pathname, "/admin");
      assert.deepEqual(forbidden, []);
      assert.equal(authReads, 1, "normal bootstrap should share one authentication lookup");
      assert.equal(await browser.page.locator('[data-admin-panel="general-settings"]').count(), 0);
      assert.equal(await browser.page.locator('[data-admin-panel="users"]').count(), 0);
    } finally { await browser.close(); }
  }
});

const role = { code: "fixture_role", name: "Synthetic role", description: "", weight: 0, parents: [], permissions: [], permissionEntries: [], translations: {} };
const task = { publicId: "task001", code: "original_task", name: "Synthetic task", description: "Synthetic description", icon: "", translations: { "en-US": { name: "Synthetic task", description: "Synthetic description" } }, refreshPeriod: "daily", condition: { action: "view", metric: "count", target: 1 }, rewards: { experience: 1, currencies: {} }, status: "active" };
test("OCT03 FS024 economy, task, permission-default and role-track drafts survive two UI language switches", { timeout: 60_000 }, async () => {
  for (const kind of ["economy", "task", "defaults", "track"] as const) {
    const counts = new Map<string, number>();
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    const browser = await fixture.page(({ path, method, body }) => {
      if ((method === "PUT" || method === "POST") && path.startsWith("/api/v1/admin/")) {
        writes.push({ path, body: JSON.parse(body) as Record<string, unknown> });
        return { status: 503, error: "Synthetic save rejection; keep the draft", code: "HTTP_503" };
      }
      counts.set(path, (counts.get(path) ?? 0) + 1);
      if (path === "/api/v1/admin/permissions") return { data: { roles: [role], permissions: [] } };
      if (path === "/api/v1/admin/economy/config") return { data: { checkin: { enabled: true, currency: "gold", amount: 1, minimumHours: 24 }, downloadRewards: [] } };
      if (path === "/api/v1/admin/economy/currencies") return { data: { items: [] } };
      if (path === "/api/v1/admin/tasks") return { data: { items: [task] } };
      if (path === "/api/v1/admin/permission-defaults") return { data: { registeredRole: "", bannedRole: "" } };
      if (path === "/api/v1/admin/levels/config") return { data: { roleTrackCode: "", levelThresholds: [] } };
      if (path === "/api/v1/admin/role-tracks") return { data: [{ code: "fixture_track", name: "Synthetic track", description: "Original", roles: [] }] };
    });
    try {
      const { page } = browser;
      let input;
      let dataPath;
      if (kind === "economy") {
        await panel(page, "economy-config", "economy");
        input = page.locator('input[type="number"]').first();
        await input.fill("37"); dataPath = "/api/v1/admin/economy/config";
      } else if (kind === "task") {
        await panel(page, "tasks", "progression");
        await page.getByRole("button", { name: /Synthetic task/ }).click();
        input = page.locator("input.field.font-mono").first();
        await input.fill("manual_task"); dataPath = "/api/v1/admin/tasks";
      } else if (kind === "defaults") {
        await panel(page, "permission-settings", "permission");
        input = page.locator('select').first();
        await input.selectOption("fixture_role"); dataPath = "/api/v1/admin/permission-defaults";
      } else {
        await panel(page, "role-tracks", "permission");
        await page.getByRole("button", { name: /Synthetic track/ }).click();
        input = page.locator("input").nth(1);
        await input.fill("Manual track"); dataPath = "/api/v1/admin/role-tracks";
      }
      const expected = kind === "economy" ? "37" : kind === "task" ? "manual_task" : kind === "defaults" ? "fixture_role" : "Manual track";
      await changeLanguage(page, "zh-CN");
      assert.equal(await input.inputValue(), expected, `${kind} must preserve unsaved edits in zh-CN`);
      await changeLanguage(page, "en-US");
      assert.equal(await input.inputValue(), expected, `${kind} must preserve unsaved edits when returning to en-US`);
      assert.equal(counts.get(dataPath), 1, `${kind} must not repeat initialization on UI language changes`);
      assert.equal(writes.length, 0, "Only this form may submit while the preference changes");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("alertdialog").filter({ hasText: kind === "economy" || kind === "task" ? "This service is temporarily unavailable. Try again later." : "Synthetic save rejection; keep the draft" }).waitFor();
      await closeNotice(page);
      assert.equal(await input.inputValue(), expected, `${kind} must preserve input after the real submit handler fails`);
      assert.equal(writes.length, 1);
      if (kind === "economy") assert.equal((writes[0].body.checkin as { amount: number }).amount, 37);
      if (kind === "task") assert.equal(writes[0].body.code, "manual_task");
      if (kind === "defaults") assert.equal(writes[0].path, "/api/v1/admin/levels/config", "existing sequential save starts with levels, without clearing default selection on failure");
      if (kind === "track") assert.equal(writes[0].body.name, "Manual track");
    } finally { await browser.close(); }
  }
});

test("OCT03 FS027 notification-template read failure, locale drafts and actor replacement preserve the save gate", { timeout: 40_000 }, async () => {
  let identity = "actor001";
  let reads = 0;
  let writes = 0;
  const actorBStarted = Promise.withResolvers<void>();
  const actorBRelease = Promise.withResolvers<void>();
  const browser = await fixture.page(async ({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor(identity) };
    if (path === "/api/v1/admin/config/notifications") {
      if (method === "PUT") { writes++; return { status: 503, error: "Synthetic template save failure" }; }
      reads++;
      if (reads === 1) return { status: 503, error: "Synthetic first template read failure" };
      if (identity === "actor002") { actorBStarted.resolve(); await actorBRelease.promise; }
      return { data: { templates: [{ code: `notice_${identity}`, translations: { "zh-CN": { title: "源文", body: "源正文" }, "en-US": { title: "Original title", body: "Original body" } } }] } };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "notification-templates", "notifications");
    await page.getByText("Synthetic first template read failure", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    await closeNotice(page);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const targetTitle = page.locator('input').last();
    const targetBody = page.locator('textarea').last();
    await targetTitle.fill("Manual notification title");
    await targetBody.fill("Manual notification body");
    await changeLanguage(page, "zh-CN");
    assert.equal(await targetTitle.inputValue(), "Manual notification title");
    assert.equal(await targetBody.inputValue(), "Manual notification body");
    await changeLanguage(page, "en-US");
    assert.equal(reads, 2);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Synthetic template save failure", { exact: true }).first().waitFor();
    await closeNotice(page);
    assert.equal(await targetTitle.inputValue(), "Manual notification title");
    identity = "actor002";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor002" })));
    await actorBStarted.promise;
    assert.equal(await page.locator('input[value="Manual notification title"]').count(), 0);
    assert.equal(await page.getByText("notice_actor001", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    assert.equal(writes, 1);
    actorBRelease.resolve();
    await page.getByText("notice_actor002", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isEnabled(), true);
    assert.equal(await targetTitle.inputValue(), "Original title");
  } finally { actorBRelease.resolve(); await browser.close(); }
});

test("OCT03 FS027 old OSS reads cannot unlock or replace a new actor's configuration", { timeout: 30_000 }, async () => {
  let identity = "actor001";
  let writes = 0;
  const firstStarted = Promise.withResolvers<void>();
  const firstRelease = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const secondRelease = Promise.withResolvers<void>();
  const firstFinished = Promise.withResolvers<void>();
  const browser = await fixture.page(async ({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor(identity) };
    if (path === "/api/v1/admin/config/oss") {
      if (method === "PUT") { writes++; return { data: oss("saved") }; }
      const requestedActor = identity;
      if (requestedActor === "actor001") { firstStarted.resolve(); await firstRelease.promise; firstFinished.resolve(); }
      else { secondStarted.resolve(); await secondRelease.promise; }
      return { data: oss(`bucket_${requestedActor}`) };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "oss-config", "oss");
    await firstStarted.promise;
    const save = page.getByRole("button", { name: "Save OSS config", exact: true });
    assert.equal(await save.isDisabled(), true);
    identity = "actor002";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor002" })));
    await secondStarted.promise;
    firstRelease.resolve(); await firstFinished.promise;
    await page.getByText(/Actor actor002/).last().waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.equal(await page.locator('input[value="bucket_actor001"]').count(), 0);
    secondRelease.resolve();
    await page.locator('input[value="bucket_actor002"]').waitFor();
    assert.equal(await save.isEnabled(), true);
    assert.equal(writes, 0);
  } finally { firstRelease.resolve(); secondRelease.resolve(); await browser.close(); }
});

test("OCT03 FS029 target switches discard late permissions and failed targets cannot save another user's draft", { timeout: 30_000 }, async () => {
  const firstStarted = Promise.withResolvers<void>();
  const firstRelease = Promise.withResolvers<void>();
  const firstFinished = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const secondRelease = Promise.withResolvers<void>();
  let secondReads = 0;
  const writes: Array<{ path: string; body: unknown }> = [];
  const permissionData = (code: string) => ({ roles: [], groupPermissions: [], roleBindings: [], directPermissions: [{ code, allow: true, source: "manual", editable: true }], effectivePermissionRules: [] });
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (path === "/api/v1/admin/users") return { data: ["target001", "target002"].map(id => ({ id, username: `Target ${id}`, email: `${id}@example.invalid`, status: "active", roleCodes: [] })) };
    if (path.endsWith("/permissions") && path.startsWith("/api/v1/admin/users/")) {
      if (method === "PUT") { writes.push({ path, body: JSON.parse(body) }); return { data: { ok: true } }; }
      if (path.includes("target001")) { firstStarted.resolve(); await firstRelease.promise; firstFinished.resolve(); return { data: permissionData("only.first.target") }; }
      if (++secondReads === 1) { secondStarted.resolve(); await secondRelease.promise; return { status: 503, error: "Synthetic target permission read failed" }; }
      return { data: permissionData("only.second.target") };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "user-roles", "permission");
    await firstStarted.promise;
    await page.getByRole("button", { name: /Target target002/ }).click();
    await secondStarted.promise;
    const save = page.getByRole("button", { name: "Save user permissions", exact: true });
    assert.equal(await save.isDisabled(), true);
    firstRelease.resolve(); await firstFinished.promise;
    secondRelease.resolve();
    await page.getByText("Synthetic target permission read failed", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("only.first.target", { exact: true }).count(), 0);
    assert.equal(await save.isDisabled(), true);
    assert.equal(writes.length, 0);
    await closeNotice(page);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("only.second.target", { exact: true }).waitFor();
    assert.equal(await save.isEnabled(), true);
    await save.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error("Expected button"); button.click(); button.click(); });
    await page.getByText("User permissions saved.", { exact: true }).waitFor();
    assert.deepEqual(writes, [{ path: "/api/v1/admin/users/target002/permissions", body: { permissions: [{ code: "only.second.target", allow: true, source: "manual", editable: true }] } }]);
  } finally { firstRelease.resolve(); secondRelease.resolve(); await browser.close(); }
});

test("OCT03 FS032 registration separates interface language from content preference and admin labels show content languages", { timeout: 30_000 }, async () => {
  let registration: Record<string, unknown> | undefined;
  const user = { id: "target032", username: "Language fixture", email: "language@example.invalid", status: "active", roleCodes: [], emailVerified: false };
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/auth/register" && method === "POST") { registration = JSON.parse(body) as Record<string, unknown>; return { status: 503, error: "Synthetic registration rejected" }; }
    if (path === "/api/v1/admin/users") return { data: [user] };
    if (path === "/api/v1/admin/users/target032") return { data: { user, country: "CN", timezone: "Asia/Shanghai", primaryLanguage: "ja-JP", secondaryLanguage: "de-DE", preferredUILanguage: "fr-FR", registrationIp: "", registrationCountryCode: "", registrationCity: "", oauthProviders: [], rootPermissions: [] } };
    if (path === "/api/v1/admin/users/target032/balances") return { data: { items: [] } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/login`);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.getByRole("textbox", { name: "Username", exact: true }).fill("synthetic_language");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("language@example.invalid");
    await page.locator('input[inputmode="numeric"]').fill("123456");
    await page.locator('input[type="password"]').fill("Synthetic-password-032");
    await page.getByRole("combobox", { name: "Interface language", exact: true }).selectOption("fr-FR");
    assert.equal(await page.getByRole("combobox", { name: "Second content language", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByText("Synthetic registration rejected", { exact: true }).waitFor();
    assert.equal(registration?.preferredUILanguage, "fr-FR");
    assert.equal(registration?.preferredContentLanguage, "zh-CN");
    assert.equal(Object.hasOwn(registration ?? {}, "secondaryContentLanguage"), false, "UI preference must not masquerade as a second content language");
    await panel(page, "users", "users");
    await page.getByRole("button", { name: "Language fixture", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const first = dialog.getByText("First content language", { exact: true }).locator("..");
    const second = dialog.getByText("Second content language", { exact: true }).locator("..");
    assert.match(await first.innerText(), /ja-JP/);
    assert.match(await second.innerText(), /de-DE/);
    assert.equal(await second.getByText("fr-FR", { exact: true }).count(), 0);
    await changeLanguage(page, "zh-CN");
    assert.equal(await dialog.getByText("ja-JP", { exact: true }).count(), 1);
    assert.equal(await dialog.getByText("de-DE", { exact: true }).count(), 1);
    assert.equal(await dialog.getByText("fr-FR", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});

test("OCT03 ARCH031 and BUG117 ban-reason failures gate actions, retry locale reads and reset only after creation", { timeout: 30_000 }, async () => {
  let reasons = 0;
  let listReads = 0;
  let writes = 0;
  let createFails = true;
  const bodies: Array<Record<string, unknown>> = [];
  const locales: string[] = [];
  const browser = await fixture.page(({ path, method, body, url }) => {
    if (path === "/api/v1/admin/ban-reasons") {
      reasons++; locales.push(url.searchParams.get("locale") ?? "");
      if (reasons === 1) return { status: 503, error: "Synthetic ban-reason read failed" };
      return { data: { items: [{ code: "harassment", label: url.searchParams.get("locale") === "zh-CN" ? "合成封禁原因" : "Synthetic ban reason", sortOrder: 1 }] } };
    }
    if (path === "/api/v1/admin/bans") {
      if (method === "POST") {
        writes++; bodies.push(JSON.parse(body) as Record<string, unknown>);
        return createFails ? { status: 503, error: "Synthetic ban write failed" } : { data: { id: "ban001" } };
      }
      if (++listReads > 1) return { status: 503, error: "Synthetic list refresh failed after creation" };
      return { data: { items: [], limit: 30, hasMore: false, nextCursor: "" } };
    }
  });
  try {
    const { page } = browser;
    await panel(page, "bans", "reviews");
    const submit = page.getByRole("button", { name: "Create ban", exact: true });
    await page.getByRole("alert").filter({ hasText: "Synthetic ban-reason read failed" }).waitFor();
    assert.equal(await submit.isDisabled(), true);
    assert.equal(writes, 0);
    await closeNotice(page);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.locator('select[name="reasonCode"]').selectOption("harassment");
    const userID = page.locator('input[name="userId"]');
    await userID.fill("synthetic-target");
    await page.locator('textarea[name="internalNote"]').fill("Unsaved synthetic note");
    await changeLanguage(page, "zh-CN");
    await page.locator('select[name="reasonCode"] option').filter({ hasText: "合成封禁原因" }).waitFor({ state: "attached" });
    assert.equal(await userID.inputValue(), "synthetic-target");
    await changeLanguage(page, "en-US");
    await page.locator('select[name="reasonCode"]').selectOption("harassment");
    await submit.click();
    await page.getByRole("status").filter({ hasText: "Synthetic ban write failed" }).waitFor();
    assert.equal(await userID.inputValue(), "synthetic-target");
    createFails = false;
    await closeNotice(page);
    await submit.click();
    await page.getByRole("status").filter({ hasText: "Synthetic list refresh failed after creation" }).waitFor();
    assert.equal(await userID.inputValue(), "", "successful create must reset the captured real React form even when the later list read fails");
    assert.equal(await page.locator('textarea[name="internalNote"]').inputValue(), "");
    assert.equal(writes, 2);
    assert.equal(listReads, 2);
    assert.equal(bodies[1].internalNote, "Unsaved synthetic note");
    assert.deepEqual(locales, ["en-US", "en-US", "zh-CN", "en-US"]);
  } finally { await browser.close(); }
});

test("OCT03 locale storage hints carry the validated preference even before another tab sees its cookie", { timeout: 20_000 }, async () => {
  const browser = await fixture.page(() => undefined);
  try {
    const { page } = browser;
    await panel(page, "overview", "workbench");
    await page.getByText(/Test reviewer/).last().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en-US");
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-ui-locale-sync", newValue: "1760000000000:fr-FR" })));
    // A valid same-origin preference hint is delivered while this renderer's
    // cookie snapshot is still the previous value. The actual production
    // external-store subscription, React render and lang update must apply it.
    await page.waitForFunction(() => document.documentElement.lang === "fr-FR");
    assert.equal(await page.evaluate(() => document.cookie.match(/(?:^|; )mcmods-ui-locale=([^;]+)/)?.[1]), "fr-FR");
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-ui-locale-sync", newValue: "1760000000001:javascript:alert(1)" })));
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr-FR");
  } finally { await browser.close(); }
});

test("OCT03 FS011 all six corrected upload notices wait for security scanning and pending files stay disabled", { timeout: 60_000 }, async () => {
  for (const [locale, notice] of [
    ["de-DE", "Die Datei wurde hochgeladen. Nach erfolgreicher Sicherheitsprüfung steht sie zum Download bereit."],
    ["ru-RU", "Файл загружен. Скачивание станет доступно после успешной проверки безопасности."],
    ["ja-JP", "ファイルをアップロードしました。セキュリティスキャンに合格するとダウンロードできるようになります。"],
    ["fr-FR", "Le fichier a été importé. Il sera disponible au téléchargement après validation de l’analyse de sécurité."],
    ["zh-TW", "檔案已上傳，通過安全掃描後將自動開放下載。"],
    ["es-ES", "El archivo se ha subido. Estará disponible para descargar tras superar el análisis de seguridad."],
  ]) {
    let registered = false;
    let presigns = 0;
    let registrations = 0;
    let downloads = 0;
    const file = { id: "download001", source: "internal", displayName: "Synthetic pending file", fileName: "fixture.jar", versionName: "1.0", releaseChannel: "release", gameVersions: ["1.21"], loaders: ["fabric"], publishedAt: "2026-10-03T00:00:00Z", sizeBytes: 9, downloadCount: 0, downloadCountSource: "internal", scanStatus: "pending", downloadPath: "/api/v1/projects/mod/m00000011/files/download001/download" };
    const basePath = "/api/v1/projects/mod/m00000011/files";
    const browser = await fixture.page(({ path, method, url, body }) => {
      if (path === "/api/v1/auth/me") return { data: actor("upload011", ["project.file.upload"]) };
      if (path === "/api/v1/mods/upload-notice") return { data: {
        id: "m00000011", uniqueId: "m00000011", siteId: "upload-notice", primaryName: "Synthetic upload notice", secondaryName: "", abbreviation: "SN", summary: "", modIds: [], defaultLocale: "en-US", localizations: [], environment: "bothRequired", primaryCategory: "utility", compatibilities: [{ loader: "fabric", versions: ["1.21"] }], officialStatus: "active", sourceStatus: "closed", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "", githubProjectPath: "", iconUrl: "", bodyMarkdown: "", searchKeywords: [], submissionMethod: "manual", reviewStatus: "approved", createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", tags: [], authors: [], links: [], relationshipGroups: [], galleryImages: [],
      } };
      if (path === "/api/v1/content/m00000011") return { status: 404, error: "No synthetic localized business content" };
      if (path === "/api/v1/projects/m00000011/follow") return { data: { followed: false, notificationsEnabled: false } };
      if (path === "/api/v1/content-metrics/m00000011" || path === "/api/v1/content-metrics/m00000011/view") return { status: 503, error: "Synthetic metrics unavailable" };
      if (path === "/api/v1/ratings/mod/m00000011") return { status: 503, error: "Synthetic ratings unavailable" };
      if (path === "/api/v1/comment-targets/mod/m00000011/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
      if (path === basePath && method === "GET") return { data: { items: registered && url.searchParams.get("source") === "internal" ? [file] : [], source: url.searchParams.get("source"), limit: 20, hasMore: false, nextCursor: "", versions: ["1.21"], loaders: ["fabric"], providers: { internal: true, modrinth: false, curseforge: false }, warnings: {}, canUpload: true, uploadPermission: "project.file.upload" } };
      if (path === `${basePath}/uploads/presign`) {
        presigns++;
        assert.equal(JSON.parse(body).originalName, "fixture.jar");
        // Use the declared pre-existing synthetic file/dedup branch. This
        // proves the real form/registration/notice, not object-storage PUT.
        return { data: { uploadRequired: false, file: { id: "oss011", originalName: "fixture.jar", sizeBytes: 9 } } };
      }
      if (path === basePath && method === "POST") {
        registrations++;
        const input = JSON.parse(body);
        assert.equal(input.ossFileId, "oss011");
        assert.equal(input.versionName, "1.0");
        assert.deepEqual(input.gameVersions, ["1.21"]);
        assert.deepEqual(input.loaders, ["fabric"]);
        registered = true;
        return { data: file };
      }
      if (path === file.downloadPath) { downloads++; return { status: 403, error: "Pending files are not downloadable" }; }
    });
    try {
      const { page } = browser;
      await page.context().addCookies([{ name: "mcmods-ui-locale", value: locale, url: fixture.origin }]);
      await page.goto(`${fixture.origin}/mods/upload-notice?tab=downloads`);
      await page.getByRole("heading", { name: "[SN] Synthetic upload notice", exact: true }).waitFor();
      const uploadDetails = page.locator("details").filter({ has: page.locator("form") });
      await uploadDetails.locator("summary").click();
      const form = uploadDetails.locator("form");
      await form.locator('input[type="file"]').setInputFiles({ name: "fixture.jar", mimeType: "application/java-archive", buffer: Buffer.from("synthetic") });
      await form.locator('input[placeholder="1.0.0"]').fill("1.0");
      await form.locator('button[type="submit"]').click();
      await page.getByText(notice, { exact: true }).waitFor();
      const row = page.locator("div.flex.flex-col.gap-3").filter({ has: page.getByText("Synthetic pending file", { exact: true }) });
      assert.equal(await row.locator("button.button-primary").isDisabled(), true, `${locale} must keep pending content unavailable`);
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
      assert.equal(presigns, 1); assert.equal(registrations, 1); assert.equal(downloads, 0);
    } finally { await browser.close(); }
  }
});
