import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

// Production React/Next and native browser events, explicitly controlled API.
// These tests exercise UI failure scheduling; they make no HTTP/PG auth claim.
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const stamp = "2026-11-01T00:00:00Z";
const historyPath = "/api/v1/mods/historymod/content-resources/resource1/history";
const historyURL = "/mods/historymod/resources/resource1/history?version=version1";
const ordinary = (id = "historyA") => ({ id, username: id, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 });
const row = (reason: string, version = 3) => ({ id: `history-revision-${version}`, version, status: "approved", origin: "manual", source: "", submittedByName: "Ordinary author", createdAt: stamp, current: version === 3, reason });
const result = (reason: string, version: number, nextCursor = "") => ({ data: { items: [row(reason, version)], limit: 50, hasMore: !!nextCursor, nextCursor } });
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("RPH-006 initial503 and deep503 preserve the last successful page and exact retry cursor", { timeout: 30_000 }, async () => {
  const requests: string[] = [];
  const attempts = new Map<string, number>();
  const browser = await fixture.page(({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: ordinary() };
    if (path !== historyPath) return undefined;
    const cursor = url.searchParams.get("cursor") || "";
    requests.push(cursor);
    const attempt = (attempts.get(cursor) || 0) + 1;
    attempts.set(cursor, attempt);
    if (cursor === "" && attempt === 1) return { status: 503, error: "Owned initial503" };
    if (cursor === "third" && attempt === 1) return { status: 503, error: "Owned deep503" };
    if (!cursor) return result("First successful page", 3, "second");
    if (cursor === "second") return result("Second successful page", 2, "third");
    assert.equal(cursor, "third");
    return result("Third recovered page", 1);
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + historyURL);
    await page.getByText("Owned initial503", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("First successful page", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Second successful page", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Owned deep503", { exact: false }).waitFor();
    assert.equal(await page.getByText("Second successful page", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Page 2", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Previous", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Third recovered page", { exact: true }).waitFor();
    assert.equal(await page.getByText("Page 3", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByText("Second successful page", { exact: true }).waitFor();
    assert.deepEqual(requests, ["", "", "second", "third", "third", "second"]);
  } finally { await browser.close(); }
});

test("RPH-006 a disconnected history request recovers the same page without discarding its cursor", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: ordinary() };
    if (path === historyPath) return result(url.searchParams.has("cursor") ? "Recovered after disconnect" : "Stable first page", url.searchParams.has("cursor") ? 1 : 2, url.searchParams.has("cursor") ? "" : "second");
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + historyURL);
    await page.getByText("Stable first page", { exact: true }).waitFor();
    let disconnected = false;
    await page.context().route(url => url.pathname === historyPath, async route => {
      if (!disconnected && new URL(route.request().url()).searchParams.get("cursor") === "second") {
        disconnected = true;
        await route.abort("internetdisconnected");
      } else await route.fallback();
    });
    const failed = page.waitForEvent("requestfailed", { predicate: request => new URL(request.url()).pathname === historyPath });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const request = await failed;
    assert.equal(request.failure()?.errorText, "net::ERR_INTERNET_DISCONNECTED");
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(await page.getByText("Stable first page", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Page 1", { exact: true }).count(), 1);
    const recovered = page.waitForRequest(request => new URL(request.url()).pathname === historyPath && new URL(request.url()).searchParams.get("cursor") === "second");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await recovered;
    await page.getByText("Recovered after disconnect", { exact: true }).waitFor();
  } finally { await browser.close(); }
});

test("RPH-006 rapid Next is bounded and late accountA history cannot replace accountB content", { timeout: 30_000 }, async () => {
  let actor = "historyA";
  const captured = gate(), release = gate(), handlerReturned = gate();
  const requests: Array<{ actor: string; cursor: string }> = [];
  const browser = await fixture.page(async ({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: ordinary(actor) };
    if (path !== historyPath) return undefined;
    const owner = actor;
    const cursor = url.searchParams.get("cursor") || "";
    requests.push({ actor: owner, cursor });
    if (owner === "historyA" && cursor === "second") {
      captured.resolve();
      await release.promise;
      handlerReturned.resolve();
      return result("A late private history", 1);
    }
    return result(owner === "historyA" ? "A current private history" : "B current private history", 3, owner === "historyA" ? "second" : "");
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + historyURL);
    await page.getByText("A current private history", { exact: true }).waitFor();
    const next = page.getByRole("button", { name: "Next", exact: true });
    // Two real DOM click events in one browser task, rather than flaky sleep.
    await next.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await captured.promise;
    assert.equal(await next.isDisabled(), true);
    assert.equal(requests.filter(x => x.actor === "historyA" && x.cursor === "second").length, 1);
    const aborted = page.waitForEvent("requestfailed", { predicate: request => new URL(request.url()).pathname === historyPath && new URL(request.url()).searchParams.get("cursor") === "second" });
    actor = "historyB";
    // The application's existing cross-tab protocol, not an injected Auth store.
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:controlled-other-tab" })));
    await page.getByText("B current private history", { exact: true }).waitFor();
    const oldRequest = await aborted;
    assert.equal(oldRequest.failure()?.errorText, "net::ERR_ABORTED");
    release.resolve();
    await handlerReturned.promise;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByText("A current private history", { exact: true }).count(), 0);
    assert.equal(await page.getByText("A late private history", { exact: true }).count(), 0);
    assert.equal(await page.getByText("B current private history", { exact: true }).count(), 1);
    assert.deepEqual(requests, [{ actor: "historyA", cursor: "" }, { actor: "historyA", cursor: "second" }, { actor: "historyB", cursor: "" }]);
  } finally { release.resolve(); await browser.close(); }
});

for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "fr-FR", "de-DE", "es-ES", "ru-RU"]) {
  test(`REM-005 ordinary reader comparison labels and columns remain readable at390px in${locale}`, { timeout: 30_000 }, async () => {
    const handler: APIHandler = ({ path }) => {
      if (path === "/api/v1/auth/me") return { data: ordinary() };
      if (path === "/api/v1/mods/comparemod/revisions/compare") return { data: {
        before: { version: 1, snapshot: { defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Original actual contract field" }], galleryImages: [] } },
        after: { version: 2, snapshot: { defaultLocale: "zh-CN", localizations: [{ locale: "zh-CN", name: "Changed actual contract field" }], galleryImages: [] } },
        changedFields: ["defaultLocale", "localizations"],
      } };
    };
    const browser = await fixture.page(handler);
    try {
      const { page } = browser;
      await page.context().addCookies([{ name: "mcmods-ui-locale", value: locale, url: fixture.origin }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${fixture.origin}/mods/comparemod/compare?before=before01&after=after01`);
      await page.locator("pre").first().waitFor();
      const labels = await page.locator("main strong").allTextContents();
      assert.equal(labels.length, 3);
      assert.equal(labels.some(label => !label.trim() || label.includes("mods.history.fields.")), false);
      for (const row of await page.locator("main .grid").all()) {
        const children = row.locator(":scope > *");
        if (await children.count() !== 3) continue;
        const first = await children.nth(0).boundingBox(), second = await children.nth(1).boundingBox();
        assert(first && second);
        assert(first.x + first.width <= second.x + 0.5);
      }
    } finally { await browser.close(); }
  });
}

test("a failed mod revision continuation keeps the confirmed page and comparison selection", { timeout: 30_000 }, async () => {
  const reads: string[] = [];
  let attempts = 0;
  const browser = await fixture.page(({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: ordinary() };
    if (path !== "/api/v1/mods/historymod/revisions") return;
    const cursor = url.searchParams.get("cursor") || ""; reads.push(cursor);
    if (cursor && ++attempts === 1) return { status: 503, error: "Revision continuation unavailable" };
    return { data: { items: [{ id: cursor ? "revision1" : "revision2", version: cursor ? 1 : 2, status: "approved",
      submittedByName: "Reviewer", createdAt: stamp, changeReason: cursor ? "Earlier change" : "Latest change" }], limit: 50, hasMore: !cursor, nextCursor: cursor ? "" : "opaque+/=" } };
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/mods/historymod/history");
    await page.getByText("Latest change", { exact: true }).waitFor();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("alert").getByText("Revision continuation unavailable").waitFor();
    assert.equal(await page.getByRole("checkbox").isChecked(), true);
    assert.equal(await page.getByText("Latest change", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Earlier change", { exact: true }).waitFor();
    await page.getByRole("checkbox").check();
    await page.locator('a[href$="before=revision1&after=revision2"]').waitFor();
    assert.deepEqual(reads, ["", "opaque+/=", "opaque+/="]);
  } finally { await browser.close(); }
});
