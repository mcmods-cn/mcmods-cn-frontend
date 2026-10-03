import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

// Real production React routes with explicit synthetic project API transport.
// This is not a real provider call or a database transaction test; the matching
// aggregate transaction regression is separately bound to isolated PostgreSQL.
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const pageOf = (items: unknown[], limit = 50) => ({ items, limit, hasMore: false, nextCursor: "" });
const actor = (id: string) => ({ id, username: id, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 });
const notice = (id: string) => ({ id, kind: "system", title: `Synthetic notice ${id}`, body: "Synthetic original body", sourceLocale: "zh-CN", read: true, data: {}, actors: [], createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", translationAllowed: true });
const balance = (remainingTokens: number) => ({ usedTokens: 1000 - remainingTokens, reservedTokens: 0, limitTokens: 1000, remainingTokens, unlimited: false });

test("OCT03 BUG048 a late balance for actor A cannot replace actor B's initial balance", { timeout: 30_000 }, async () => {
  let identity = "actor_balance_a";
  const firstStarted = Promise.withResolvers<void>();
  const firstRelease = Promise.withResolvers<void>();
  const firstFinished = Promise.withResolvers<void>();
  const reads: string[] = [];
  let translations = 0;
  const browser = await fixture.page(async ({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: actor(identity) };
    if (path === "/api/v1/messages/conversations") return { data: pageOf([], 30) };
    if (path === "/api/v1/notifications") return { data: pageOf([notice(identity)]) };
    if (path === "/api/v1/notifications/ai-balance") {
      const owner = identity; reads.push(owner);
      if (owner === "actor_balance_a") { firstStarted.resolve(); await firstRelease.promise; firstFinished.resolve(); }
      return { data: balance(owner === "actor_balance_a" ? 111 : 222) };
    }
    if (path.endsWith("/translate") && method === "POST") { translations++; return { status: 503, error: "Translation is not requested in this test" }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/messages`);
    await firstStarted.promise;
    identity = "actor_balance_b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor_balance_b" })));
    await page.getByText("Synthetic notice actor_balance_b", { exact: true }).waitFor();
    await page.getByText("222", { exact: true }).waitFor();
    firstRelease.resolve(); await firstFinished.promise;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("111", { exact: true }).count(), 0);
    assert.equal(await page.getByText("222", { exact: true }).count(), 1);
    assert.deepEqual(reads, ["actor_balance_a", "actor_balance_b"]);
    assert.equal(translations, 0);
  } finally { firstRelease.resolve(); await browser.close(); }
});

test("OCT03 BUG048 queued translation refreshes balance on success and failure while cached reads do not", { timeout: 40_000 }, async () => {
  for (const outcome of ["completed", "failed", "cached"] as const) {
    let balanceReads = 0;
    let taskReads = 0;
    let translationRequests = 0;
    const browser = await fixture.page(({ path, method, body }) => {
      if (path === "/api/v1/messages/conversations") return { data: pageOf([], 30) };
      if (path === "/api/v1/notifications") return { data: pageOf([notice("notice048")]) };
      if (path === "/api/v1/notifications/ai-balance") {
        balanceReads++;
        if (outcome === "failed" && balanceReads > 1) return { status: 503, error: "Synthetic balance refresh failed" };
        return { data: balance(balanceReads === 1 ? 500 : 400) };
      }
      if (path === "/api/v1/notifications/notice048/translate") {
        assert.equal(method, "POST"); assert.equal(JSON.parse(body).targetLocale, "en-US");
        translationRequests++;
        return { data: outcome === "cached" ? { cached: true, translation: { title: "Cached synthetic title", body: "Cached body" } } : { cached: false, taskId: "task048" } };
      }
      if (path === "/api/v1/notifications/translations/task048") {
        taskReads++;
        return { data: outcome === "failed" ? { status: "failed", error: "Synthetic translation failed" } : { status: "completed", translation: { title: "Completed synthetic title", body: "Completed body" } } };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/messages`);
      await page.getByText("500", { exact: true }).waitFor();
      await page.getByRole("button", { name: "AI translate", exact: true }).click();
      if (outcome === "failed") {
        await page.getByText("Synthetic translation failed", { exact: true }).waitFor();
        await page.getByRole("button", { name: "AI translate", exact: true }).waitFor({ state: "visible" });
        assert.equal(await page.getByText("Synthetic balance refresh failed", { exact: true }).count(), 0, "the cleanup refresh must preserve the original translation failure");
        assert.equal(await page.getByText("500", { exact: true }).count(), 1);
      } else {
        await page.getByText(outcome === "cached" ? "Cached synthetic title" : "Completed synthetic title", { exact: true }).waitFor();
        if (outcome === "completed") await page.getByText("400", { exact: true }).waitFor();
      }
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "AI translate" && !button.disabled));
      assert.equal(translationRequests, 1);
      assert.equal(balanceReads, outcome === "cached" ? 1 : 2);
      assert.equal(taskReads, outcome === "cached" ? 0 : 1);
    } finally { await browser.close(); }
  }
});

test("OCT03 BUG136 skin and blueprint editors save one aggregate snapshot, retain failed drafts and reload both languages", { timeout: 45_000 }, async () => {
  for (const kind of ["skin", "blueprint"] as const) {
    const plural = kind === "skin" ? "skins" : "blueprints";
    const id = kind === "skin" ? "skin0136" : "blue0136";
    let versions = [
      { locale: "en-US", name: "Original English", summary: "English introduction", contentMarkdown: "Original English Markdown", provenance: "human", reviewStatus: "approved", editable: true },
      { locale: "zh-CN", name: "中文原稿", summary: "中文介绍", contentMarkdown: "中文正文", provenance: "human", reviewStatus: "approved", editable: true },
    ];
    const base = kind === "skin"
      ? { publicId: id, kind: "skin", model: "default", name: "Original English", description: "English introduction", tags: [], visibility: "public", reviewStatus: "approved", canEdit: true }
      : { id, title: "Original English", description: "Original English Markdown", sourceFormat: "nbt", status: "ready", canEdit: true, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z" };
    let fail = true;
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writes: Array<Record<string, unknown>> = [];
    let separateContentWrites = 0;
    const browser = await fixture.page(async ({ path, method, body }) => {
      if (path === "/api/v1/auth/me") return { data: actor("asset136") };
      if (path === `/api/v1/review-locks/${kind}/${id}`) return { data: { locked: false, subscribed: false, canSubscribe: false } };
      if (path === `/api/v1/${plural}/${id}/content`) {
        if (method !== "GET") { separateContentWrites++; return { status: 500, error: "Separate content writes are not part of the aggregate contract" }; }
        return { data: { defaultLocale: "en-US", resolvedLocale: "en-US", available: versions } };
      }
      if (path === `/api/v1/${plural}/${id}`) {
        if (method === "PUT") {
          const payload = JSON.parse(body) as Record<string, unknown>; writes.push(payload);
          if (fail) { started.resolve(); await release.promise; return { status: 503, error: "Synthetic aggregate save rejected" }; }
          const localizations = payload.localizations as Array<{ locale: string; name: string; summary: string; contentMarkdown: string }>;
          versions = localizations.map(item => ({ ...item, provenance: "human", reviewStatus: "approved", editable: true }));
          return { data: base };
        }
        return { data: base };
      }
      if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
      if (path === "/api/v1/stickers") return { data: { packs: [] } };
      if (path === "/api/v1/markdown/config") return { data: {} };
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/${plural}/${id}/edit`);
      const english = page.getByRole("textbox", { name: "Name (en-US)", exact: true });
      await english.fill("Saved English draft");
      await page.getByRole("textbox", { name: "Introduction (en-US)", exact: true }).fill("Saved English introduction");
      await page.getByRole("tab", { name: "简体中文", exact: true }).click();
      const chinese = page.getByRole("textbox", { name: "Name (zh-CN)", exact: true });
      await chinese.fill("已保存中文草稿");
      await page.getByRole("textbox", { name: "Introduction (zh-CN)", exact: true }).fill("已保存中文介绍");
      const submit = page.getByRole("button", { name: "Submit changes", exact: true });
      await submit.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error("Expected submit button"); button.click(); button.click(); });
      await started.promise;
      assert.equal(writes.length, 1);
      assert.equal(await chinese.isDisabled(), true);
      assert.deepEqual(versions.map(item => item.name), ["Original English", "中文原稿"], "rejected transport has not changed fixture persistence");
      release.resolve();
      await page.getByText("Synthetic aggregate save rejected", { exact: true }).first().waitFor();
      if (await page.getByRole("alertdialog").count()) await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(await chinese.inputValue(), "已保存中文草稿");
      fail = false;
      await submit.click();
      await page.getByText("Submitted. Language versions that require review will be published after approval.", { exact: true }).waitFor();
      assert.equal(writes.length, 2);
      assert.equal(separateContentWrites, 0);
      assert.equal(writes[1].defaultLocale, "en-US");
      const sent = writes[1].localizations as Array<{ locale: string; name: string }>;
      assert.deepEqual(sent.map(({ locale, name }) => ({ locale, name })), [{ locale: "en-US", name: "Saved English draft" }, { locale: "zh-CN", name: "已保存中文草稿" }]);
      assert.equal(writes[1][kind === "skin" ? "name" : "title"], "Saved English draft");
      await page.reload();
      await english.waitFor();
      assert.equal(await english.inputValue(), "Saved English draft");
      await page.getByRole("tab", { name: "简体中文", exact: true }).click();
      assert.equal(await chinese.inputValue(), "已保存中文草稿");
      await page.getByRole("textbox", { name: "Introduction (zh-CN)", exact: true }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Introduction (zh-CN)", exact: true }).inputValue(), "已保存中文介绍");
    } finally { release.resolve(); await browser.close(); }
  }
});

test("OCT03 BUG130 creator pages deduplicate boundaries, retain the current scope and retry a failed filtered read", { timeout: 30_000 }, async () => {
  const summary = (publicId: string, name: string) => ({ publicId, name, kind: "author", avatarUrl: "", reviewStatus: "approved", workCount: 2, claimed: false });
  const requests: Array<{ query: string; cursor: string; limit: string | null }> = [];
  const slowStarted = Promise.withResolvers<void>();
  const slowRelease = Promise.withResolvers<void>();
  const slowFinished = Promise.withResolvers<void>();
  let failCurrent = true;
  const browser = await fixture.page(async ({ path, url }) => {
    if (path !== "/api/v1/creators") return;
    const query = url.searchParams.get("query") || "";
    const cursor = url.searchParams.get("cursor") || "";
    requests.push({ query, cursor, limit: url.searchParams.get("limit") });
    assert.equal(url.searchParams.get("sort"), "name");
    assert.equal(url.searchParams.get("order"), "asc");
    if (query === "slow") { slowStarted.resolve(); await slowRelease.promise; slowFinished.resolve(); return { data: { items: [summary("late0130", "Late old query")], hasMore: true, nextCursor: "stale-cursor" } }; }
    if (query === "current") {
      assert.equal(cursor, "", "a cursor from the old scope must never accompany a new query");
      if (failCurrent) return { status: 503, error: "Synthetic current creator read failed" };
      return { data: { items: [summary("now0130", "Current filtered creator")], hasMore: false, nextCursor: "", counts: { author: 1, team: 0 } } };
    }
    assert.equal(query, "");
    if (!cursor) return { data: { items: [summary("one0130", "Creator one"), summary("two0130", "Creator two")], hasMore: true, nextCursor: "page-two", counts: { author: 3, team: 0 } } };
    assert.equal(cursor, "page-two");
    return { data: { items: [summary("two0130", "Creator two"), summary("three130", "Creator three")], hasMore: false, nextCursor: "", counts: { author: 3, team: 0 } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/authors`);
    await page.getByText("Creator one", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Load more authors and teams", exact: true }).click();
    await page.getByText("Creator three", { exact: true }).waitFor();
    assert.equal(await page.getByText("Creator two", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Load more authors and teams", exact: true }).count(), 0);
    await page.getByRole("searchbox", { name: "Search authors or teams", exact: true }).fill("slow");
    await slowStarted.promise;
    await page.getByRole("searchbox", { name: "Search authors or teams", exact: true }).fill("current");
    await page.getByRole("alert").filter({ hasText: "Failed to load authors and teams." }).waitFor();
    slowRelease.resolve(); await slowFinished.promise;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("Late old query", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Creator one", { exact: true }).count(), 0);
    failCurrent = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Current filtered creator", { exact: true }).waitFor();
    assert.equal(await page.getByRole("searchbox").inputValue(), "current");
    assert.deepEqual(requests.map(({ query, cursor }) => ({ query, cursor })), [{ query: "", cursor: "" }, { query: "", cursor: "page-two" }, { query: "slow", cursor: "" }, { query: "current", cursor: "" }, { query: "current", cursor: "" }]);
    assert(requests.every(item => item.limit === "48"));
  } finally { slowRelease.resolve(); await browser.close(); }
});

test("OCT03 FS029 a late role save cannot replace the newly selected role and failed saves retain its draft", { timeout: 30_000 }, async () => {
  let roles = ["first", "second"].map((name, index) => ({ code: `role_${name}`, name: `Synthetic ${name} role`, description: "", translations: {}, weight: index + 1, parents: [], permissions: [], permissionEntries: [] }));
  const pending = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (path === "/api/v1/admin/permissions") return { data: { roles, permissions: [] } };
    if (path.startsWith("/api/v1/admin/roles/") && method === "PUT") {
      const payload = JSON.parse(body) as Record<string, unknown>;
      writes.push({ path, body: payload });
      if (path.endsWith("role_second")) return { status: 503, error: "Synthetic second role save failed" };
      pending.resolve(); await release.promise;
      roles = roles.map(role => role.code === "role_first" ? { ...role, weight: Number(payload.weight) } : role);
      return { data: roles[0] };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="permission"]').click();
    await page.locator('[data-admin-panel="roles"]').click();
    const weight = page.getByRole("spinbutton").first();
    await weight.fill("7");
    const save = page.getByRole("button", { name: "Save permission group", exact: true });
    await save.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error("Expected a submit button"); button.click(); button.click(); });
    await pending.promise;
    assert.equal(writes.length, 1);
    await page.getByRole("button", { name: /Synthetic second role/ }).click();
    assert.equal(await weight.inputValue(), "2");
    release.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLFieldSetElement>("form fieldset")].some(fieldset => !fieldset.disabled));
    assert.equal(await weight.inputValue(), "2", "the first role's successful result must not replace the second role's selection");
    assert.equal(await page.locator('input[value="role_second"]').count(), 1);
    await weight.fill("9");
    await save.click();
    await page.getByText("Synthetic second role save failed", { exact: true }).first().waitFor();
    assert.equal(await weight.inputValue(), "9");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].path, "/api/v1/admin/roles/role_first");
    assert.equal(writes[1].path, "/api/v1/admin/roles/role_second");
    assert.equal(writes[1].body.weight, 9);
  } finally { release.resolve(); await browser.close(); }
});

test("OCT03 BUG114 About content-language changes reject late drafts and preserve the locale captured by an in-flight save", { timeout: 30_000 }, async () => {
  const oldStarted = Promise.withResolvers<void>();
  const oldRelease = Promise.withResolvers<void>();
  const saveStarted = Promise.withResolvers<void>();
  const saveRelease = Promise.withResolvers<void>();
  const reads: string[] = [];
  const writes: Array<{ locale: string; body: Record<string, unknown> }> = [];
  const browser = await fixture.page(async ({ path, method, body }) => {
    if (!path.startsWith("/api/v1/admin/site-affairs/about/")) return;
    const locale = path.split("/").at(-1)!;
    if (method === "PUT") { writes.push({ locale, body: JSON.parse(body) }); saveStarted.resolve(); await saveRelease.promise; return { data: { saved: true } }; }
    reads.push(locale);
    if (locale === "en-US") { oldStarted.resolve(); await oldRelease.promise; }
    return { data: { locale, title: locale === "en-US" ? "Old English draft" : locale === "zh-CN" ? "Current Chinese draft" : "Current German draft", bodyMarkdown: `Synthetic ${locale} body`, status: "draft", revision: locale === "zh-CN" ? 7 : 8 } };
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/site-affairs/about/") && (!init?.method || init.method === "GET")) { const options = { ...init }; delete options.signal; return nativeFetch(input, options); }
        return nativeFetch(input, init);
      };
    });
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="site-affairs"]').click();
    await page.locator('[data-admin-panel="site-about"]').click();
    await oldStarted.promise;
    const input = page.locator("input.field.mt-4");
    const localeSelect = page.locator("select.field.w-auto");
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    assert.equal(await input.isDisabled(), true);
    assert.equal(await save.isDisabled(), true);
    await localeSelect.selectOption("zh-CN");
    await page.locator('input[value="Current Chinese draft"]').waitFor();
    const returned = page.waitForResponse(response => response.url().includes("/site-affairs/about/en-US"));
    oldRelease.resolve(); await (await returned).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await input.inputValue(), "Current Chinese draft");
    await input.fill("Edited Chinese draft");
    await save.click(); await saveStarted.promise;
    assert.equal(await save.isDisabled(), true);
    await localeSelect.selectOption("de-DE");
    await page.locator('input[value="Current German draft"]').waitFor();
    saveRelease.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLInputElement>("input.field.mt-4")].some(input => !input.disabled));
    assert.equal(await input.inputValue(), "Current German draft");
    assert.deepEqual(reads, ["en-US", "zh-CN", "de-DE"], "a late Chinese save must not reload the newly selected German draft");
    assert.deepEqual(writes, [{ locale: "zh-CN", body: { title: "Edited Chinese draft", bodyMarkdown: "Synthetic zh-CN body", publish: false, baseRevision: 7 } }]);
  } finally { oldRelease.resolve(); saveRelease.resolve(); await browser.close(); }
});

test("OCT03 BUG118 report selection rejects late details and a late claim cannot refresh or clear another selected report", { timeout: 30_000 }, async () => {
  const oldStarted = Promise.withResolvers<void>();
  const oldRelease = Promise.withResolvers<void>();
  const claimStarted = Promise.withResolvers<void>();
  const claimRelease = Promise.withResolvers<void>();
  const pagingStarted = Promise.withResolvers<void>();
  const pagingRelease = Promise.withResolvers<void>();
  const resolveStarted = Promise.withResolvers<void>();
  const resolveRelease = Promise.withResolvers<void>();
  const detailReads: string[] = [];
  let reviewingSecond = false;
  let resolved = 0;
  let lists = 0;
  let claims = 0;
  const rows = ["report001", "report002"].map((id, index) => ({ id, targetType: "user", targetId: `target${index}`, reasonCode: "harassment", status: "pending", reporterName: `Reporter ${index}`, createdAt: "2026-10-03T00:00:00Z" }));
  const browser = await fixture.page(async ({ path, method, url, body }) => {
    if (path === "/api/v1/admin/ban-reasons") return { data: { items: [{ code: "harassment", label: "Synthetic reason", sortOrder: 1 }] } };
    if (path === "/api/v1/admin/reports") { lists++; return { data: { items: rows, limit: 50, hasMore: !url.searchParams.has("cursor"), nextCursor: url.searchParams.has("cursor") ? "" : "next-reports" } }; }
    if (path === "/api/v1/admin/reports/report001/claim") { assert.equal(method, "POST"); claims++; claimStarted.resolve(); await claimRelease.promise; return { data: { claimed: true } }; }
    if (path === "/api/v1/admin/reports/report002/resolve") { assert.equal(method, "POST"); assert.equal(JSON.parse(body).note, "Synthetic resolution note"); resolved++; resolveStarted.resolve(); await resolveRelease.promise; return { data: { resolved: true } }; }
    if (path === "/api/v1/admin/reports/report001" || path === "/api/v1/admin/reports/report002") {
      const id = path.split("/").at(-1)!; detailReads.push(id);
      if (id === "report001" && detailReads.filter(value => value === id).length === 1) { oldStarted.resolve(); await oldRelease.promise; }
      if (id === "report001" && detailReads.filter(value => value === id).length === 3) { pagingStarted.resolve(); await pagingRelease.promise; }
      const row = rows.find(row => row.id === id)!;
      return { data: { ...row, detail: `Synthetic detail ${id}`, customReason: "", reporterId: "reporter001", status: id === "report002" && reviewingSecond ? "in_review" : row.status, claimedByCurrentUser: id === "report002" && reviewingSecond, canTakeover: false, evidence: [], reviews: [], actions: [], relatedReports: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (/\/admin\/reports\/report00[12](?:\?|$)/.test(url)) { const options = { ...init }; delete options.signal; return nativeFetch(input, options); }
        return nativeFetch(input, init);
      };
    });
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="reviews"]').click();
    await page.locator('[data-admin-panel="reports"]').click();
    const first = page.getByRole("button", { name: /Reporter 0/ });
    const second = page.getByRole("button", { name: /Reporter 1/ });
    await first.click(); await oldStarted.promise;
    await second.click();
    await page.getByText("Synthetic detail report002", { exact: true }).waitFor();
    const returned = page.waitForResponse(response => response.url().endsWith("/reports/report001"));
    oldRelease.resolve(); await (await returned).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("Synthetic detail report001", { exact: true }).count(), 0);
    await first.click();
    await page.getByText("Synthetic detail report001", { exact: true }).waitFor();
    const claim = page.getByRole("button", { name: "Claim report", exact: true });
    await claim.click(); await claimStarted.promise;
    await second.click();
    await page.getByText("Synthetic detail report002", { exact: true }).waitFor();
    claimRelease.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === "Claim report" && !button.disabled));
    assert.equal(await page.getByText("Synthetic detail report002", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Synthetic detail report001", { exact: true }).count(), 0);
    assert.deepEqual(detailReads, ["report001", "report002", "report001", "report002"]);
    assert.equal(claims, 1); assert.equal(lists, 1);
    await first.click(); await pagingStarted.promise;
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const latePageDetail = page.waitForResponse(response => response.url().endsWith("/reports/report001"));
    pagingRelease.resolve(); await (await latePageDetail).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("Synthetic detail report001", { exact: true }).count(), 0, "a late detail must not resurrect the selection cleared by pagination");
    reviewingSecond = true;
    await second.click();
    await page.locator('textarea[name="note"]').fill("Synthetic resolution note");
    await page.getByRole("button", { name: "Submit decision", exact: true }).click(); await resolveStarted.promise;
    await first.click();
    await page.getByText("Synthetic detail report001", { exact: true }).waitFor();
    resolveRelease.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === "Claim report" && !button.disabled));
    assert.equal(await page.getByText("Synthetic detail report001", { exact: true }).count(), 1, "a resolved old report must not clear the new selection");
    assert.equal(resolved, 1); assert.equal(lists, 2);
  } finally { oldRelease.resolve(); claimRelease.resolve(); pagingRelease.resolve(); resolveRelease.resolve(); await browser.close(); }
});

test("OCT03 PERF067 editor-application queue uses bounded cursor pages, deduplicates overlap and signs attachments only on demand", { timeout: 30_000 }, async () => {
  const application = (id: string) => ({ id, targetType: "mod", targetId: `target-${id}`, targetName: `Synthetic project ${id}`, targetUrl: `/mods/target-${id}`, userId: `user-${id}`, username: `Applicant ${id}`, proofMarkdown: `Synthetic proof ${id}`, status: "pending", reviewNote: "", attachments: [{ id: `attachment-${id}`, originalName: `proof-${id}.txt`, sizeBytes: 12 }], createdAt: "2026-10-03T00:00:00Z" });
  const cursor = "opaque+/cursor=page2";
  const requests: string[] = [];
  const pageStarted = Promise.withResolvers<void>();
  const pageRelease = Promise.withResolvers<void>();
  let signatures = 0;
  const browser = await fixture.page(async ({ path, method, url }) => {
    if (path === "/api/v1/admin/project-editor-applications") {
      assert.equal(method, "GET");
      assert.equal(url.searchParams.get("status"), "pending");
      assert.equal(url.searchParams.get("limit"), "50");
      assert.equal(url.searchParams.has("offset"), false);
      const current = url.searchParams.get("cursor") || "";
      requests.push(current);
      if (!current) return { data: { items: [application("first"), application("second")], limit: 50, hasMore: true, nextCursor: cursor } };
      assert.equal(current, cursor, "opaque cursors must round-trip through URL encoding");
      pageStarted.resolve(); await pageRelease.promise;
      return { data: { items: [application("second"), application("third")], limit: 50, hasMore: false, nextCursor: "" } };
    }
    if (path.endsWith("/presign")) {
      assert.equal(path, "/api/v1/admin/project-editor-applications/third/attachments/attachment-third/presign");
      assert.equal(method, "POST"); signatures++;
      return { data: { url: "https://www.example.test/synthetic-proof.txt" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="reviews"]').click();
    await page.locator('[data-admin-panel="reviews-editor"]').click();
    await page.getByRole("heading", { name: /^Synthetic project first/ }).waitFor();
    assert.equal(signatures, 0, "listing applications must not sign every attachment");
    const loadMore = page.getByRole("button", { name: "Load more editor applications", exact: true });
    await loadMore.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error("Expected pagination button"); button.click(); button.click(); });
    await pageStarted.promise;
    assert.deepEqual(requests, ["", cursor], "a pending pagination request must exclude duplicate clicks");
    pageRelease.resolve();
    await page.getByRole("heading", { name: /^Synthetic project third/ }).waitFor();
    assert.equal(await page.getByRole("heading", { name: /^Synthetic project second/ }).count(), 1);
    assert.equal(await page.locator("section article").count(), 3);
    assert.equal(await loadMore.count(), 0);
    assert.equal(signatures, 0);
    const signedResponse = page.waitForResponse(response => response.url().includes("/attachment-third/presign"));
    await page.getByRole("button", { name: /^proof-third\.txt ·/ }).click();
    await (await signedResponse).finished();
    assert.equal(signatures, 1);
    assert.deepEqual(requests, ["", cursor]);
  } finally { pageRelease.resolve(); await browser.close(); }
});
