import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const empty = { data: { items: [], total: 0, hasMore: false, nextCursor: "" } };

const publicCatalog: APIHandler = ({ path }) => {
  if (path === "/api/v1/auth/me") return { status: 401, error: "Guest" };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [], loaders: [] } };
  if (["/api/v1/mods", "/api/v1/modpacks", "/api/v1/community/posts", "/api/v1/content-projects/plugin", "/api/v1/servers"].includes(path)) return empty;
};
before(() => fixture.start());
after(() => fixture.close());

test("each home search category passes the original query to its existing catalog", { timeout: 60_000 }, async () => {
  const browser = await fixture.page(publicCatalog, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const { page } = browser;
  try {
    for (const [catalog, endpoint] of [["mods", "mods"], ["modpacks", "modpacks"], ["tutorials", "community/posts"], ["servers", "servers"]]) {
      const query = "图 文 & +";
      await page.goto(fixture.origin);
      const form = page.getByRole("search");
      const category = form.getByRole("combobox", { name: "Search category" });
      await category.selectOption("/" + catalog);
      await category.focus();
      await page.keyboard.press("Tab");
      const keywords = form.getByRole("searchbox", { name: "Keywords" });
      assert.equal(await keywords.evaluate((input) => input === document.activeElement), true);
      await keywords.fill("  " + query + "  ");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const observed = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/v1/" + endpoint && url.searchParams.get("q") === query && (catalog !== "tutorials" || url.searchParams.get("kind") === "tutorial");
      });
      await keywords.press("Enter");
      assert.equal((await observed).status(), 200);
      await page.waitForURL(url => url.pathname === "/" + catalog && url.searchParams.get("q") === query);
      await page.goBack();
      await form.waitFor();
    }
    const form = page.getByRole("search");
    await form.getByRole("combobox").selectOption("/servers");
    await form.getByRole("searchbox").fill("  ");
    await form.getByRole("button").tap();
    await page.waitForURL(url => url.pathname === "/servers" && !url.searchParams.has("q"));
  } finally { await browser.close(); }
});

test("the homepage renders settled sections immediately and retries only failed sources", async () => {
  const delayedNews = Promise.withResolvers<APIReply>();
  let hotReads = 0, pluginReads = 0;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/community/posts" && request.url.searchParams.get("kind") === "news") return delayedNews.promise;
    if (request.path === "/api/v1/content-projects/plugin") {
      pluginReads++;
      return pluginReads === 1 ? { status: 503, error: "Synthetic plugin index outage" } : empty;
    }
    if (request.path === "/api/v1/mods") hotReads++;
    return publicCatalog(request);
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin);
    const hot = page.getByRole("region", { name: "Popular mods" });
    const recent = page.getByRole("region", { name: "Latest modpacks and plugins" });
    await hot.getByText(/no popular resources/i).waitFor();
    await recent.getByRole("status").waitFor();
    assert.equal(await recent.getByText(/no newly submitted resources/i).count(), 0);
    assert.equal(await page.getByRole("region", { name: "Latest news" }).getAttribute("aria-busy"), "true");
    const readsBeforeRetry = hotReads;
    await recent.getByRole("button", { name: "Retry" }).click();
    await recent.getByText(/no newly submitted resources/i).waitFor();
    assert.equal(pluginReads, 2);
    assert.equal(hotReads, readsBeforeRetry);
    delayedNews.resolve(empty);
    await page.getByRole("region", { name: "Latest news" }).getByText(/no published news/i).waitFor();
  } finally {
    delayedNews.resolve(empty);
    await browser.close();
  }
});

for (const collection of ["mods", "modpacks"]) {
  test(`the ${collection} catalog shows measured site activity and keeps an absent projection distinct from zero`, async () => {
    const base = {
      secondaryName: "", abbreviation: "CAT", summary: "Synthetic public catalog item", environment: "bothRequired",
      primaryCategory: "technology", officialStatus: "active", sourceStatus: "open", license: "MIT", defaultLocale: "en-US",
      updatedAt: "2026-11-20T12:00:00Z", createdAt: "2026-11-20T12:00:00Z", reviewStatus: "approved",
      modrinthProjectId: "example-provider-id", tags: [], authors: [], compatibilities: [], searchKeywords: [],
      modIds: [], galleryImages: [], relationshipGroups: [], links: [], hasGallery: false,
    };
    const samples = [
      { name: "Measured project", stats: { downloads: 73, views: 10, favorites: 0, comments: 2, rating: 4.5, ratingCount: 2 } },
      { name: "Unrated project", stats: { downloads: 0, views: 0, favorites: 0, comments: 0, rating: null, ratingCount: 0 } },
      { name: "Project without a projection" },
    ];
    const reads: string[] = [];
    const browser = await fixture.page(request => {
      if (request.path.startsWith("/api/v1/content-metrics/")) reads.push(request.path);
      if (request.path !== `/api/v1/${collection}`) return publicCatalog(request);
      return { data: { total: samples.length, items: samples.map(({ name, ...projection }, i) => ({
        ...base, id: `entry000${i}`, uniqueId: `entry000${i}`, siteId: `entry-${i}`, primaryName: name, ...projection,
      })) } };
    }, { viewport: { width: 1366, height: 900 } });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/${collection}`);
      const card = (name: string) => page.locator('article[role="link"]').filter({ hasText: name });
      const measured = card(samples[0].name);
      const unrated = card(samples[1].name);
      const unmeasured = card(samples[2].name);
      await unmeasured.waitFor();
      const evidence = process.env.MCMODS_CATALOG_STATS_SCREENSHOTS;
      if (evidence) {
        await measured.screenshot({ path: `${evidence}/${collection}-desktop.png` });
        await page.setViewportSize({ width: 390, height: 844 });
        await measured.screenshot({ path: `${evidence}/${collection}-mobile.png` });
        await page.setViewportSize({ width: 1366, height: 900 });
      }
      const downloads = measured.getByRole("link", { name: "Downloads", exact: true });
      assert.ok(await downloads.evaluate((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        const text = range.getBoundingClientRect();
        const button = link.getBoundingClientRect();
        return text.left >= button.left && text.right <= button.right;
      }), "the desktop download label fits inside its link");
      for (const emptyLabel of ["Versions:", "Loaders:", "Author:"]) {
        assert.equal(await measured.getByText(emptyLabel, { exact: true }).count(), 0);
      }
      // Each term and value belongs to one metric, independent of hidden mobile actions.
      const metric = (row: typeof measured, label: string) => row.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("+ dd");
      assert.equal(await metric(measured, "On-site downloads").textContent({ timeout: 4000 }), "73");
      assert.equal(await metric(measured, "Favorites").textContent(), "0");
      assert.equal(await metric(measured, "Comments").textContent(), "2");
      assert.equal(await metric(measured, "Rating").textContent(), "4.5");
      assert.equal(await metric(unrated, "On-site downloads").textContent(), "0");
      assert.equal(await unrated.locator("dt").filter({ hasText: /^Rating$/ }).count(), 0);
      assert.equal(await unmeasured.locator("dl, dt").count(), 0);
      assert.equal(await unmeasured.getByText(/Modrinth download count/i).count(), 0);
      assert.deepEqual(reads, []);
    } finally { await browser.close(); }
  });
}
