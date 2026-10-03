import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const target = { type: "mod", id: "target001", name: "Synthetic category project", url: "/mods/category-fixture", canEdit: true };
const categories = Array.from({ length: 101 }, (_, index) => ({ id: `cat${String(index + 1).padStart(6, "0")}`, defaultLocale: "en-US", names: { "en-US": `Category ${index + 1}`, "zh-CN": `分类 ${index + 1}` }, name: `Category ${index + 1}` }));

// Actual production editor with explicit synthetic API transport. Real keyset
// cursor validation and persistence are covered by the backend PostgreSQL tests.
for (const editing of [false, true]) test(`OCT02 category pagination ${editing ? "preserves an existing selection beyond page one" : "retries page two without losing a new draft"}`, { timeout: 30_000 }, async () => {
  let pageReads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method, url }) => {
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/markdown/config") return { data: {} };
    if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
    if (path === "/api/v1/review-locks/project_changelog/catlog001") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/users/me/drafts" && method === "POST") return { data: { id: "draft0001", updatedAt: "2026-10-02T00:00:00Z" } };
    if (path === "/api/v1/changelogs/catlog001") return { data: { target, item: { id: "catlog001", eventAt: "2026-10-02T00:00:00Z", minecraftVersions: ["1.21"], projectVersion: "Existing version", defaultLocale: "en-US", category: categories[100], localizations: [{ locale: "en-US", bodyMarkdown: "Existing body" }] } } };
    if (path === "/api/v1/changelogs") {
      if (method !== "GET") { writes++; return { status: 500, error: "This fixture must not submit a changelog" }; }
      assert.equal(url.searchParams.get("targetType"), "mod");
      assert.equal(url.searchParams.get("targetId"), target.id);
      const locale = url.searchParams.get("locale") || "en-US";
      return { data: { target, categories: categories.slice(0, 100), categoriesHasMore: true, categoriesNextCursor: `category-page-2-${locale}`, items: [], limit: 20, hasMore: false, nextCursor: "" } };
    }
    if (path === "/api/v1/changelogs/categories") {
      assert.equal(method, "GET");
      assert.equal(url.searchParams.get("targetType"), "mod");
      assert.equal(url.searchParams.get("targetId"), target.id);
      assert.equal(url.searchParams.get("locale"), "en-US");
      assert.equal(url.searchParams.get("cursor"), "category-page-2-en-US");
      if (++pageReads === 1) return { status: 503, error: "Synthetic category page unavailable" };
      return { data: { target, categories: [categories[100]], limit: 100, hasMore: false, nextCursor: "" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}${editing ? "/changelogs/catlog001/edit" : "/changelogs/new?targetType=mod&targetId=target001"}`);
    const version = page.locator('input[maxlength="120"]');
    await version.fill("Unsaved category draft");
    if (!editing) await page.getByRole("button", { name: "Use existing tag", exact: true }).click();
    const select = page.getByRole("combobox", { name: "Release tag", exact: true });
    if (editing) assert.equal(await select.inputValue(), "cat000101", "detail category is preserved outside the first 100 options");
    await page.getByRole("button", { name: "Load more categories", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Synthetic category page unavailable" }).waitFor();
    assert.equal(await version.inputValue(), "Unsaved category draft");
    if (editing) assert.equal(await select.inputValue(), "cat000101");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: /^(Load more categories|Loading\.\.\.|Retry)$/ }).waitFor({ state: "detached" });
    await select.locator('option[value="cat000101"]').waitFor({ state: "attached" });
    await select.selectOption("cat000101");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.getByRole("combobox", { name: "标签分类", exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "标签分类", exact: true }).inputValue(), "cat000101");
    assert.equal(await version.inputValue(), "Unsaved category draft");
    assert.equal(pageReads, 2);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});
