import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("asset editor refuses to replace unread language versions and retries the read", { timeout: 30_000 }, async () => {
  let failed = true;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: { id: "asset-owner", username: "asset-owner", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    if (path === "/api/v1/review-locks/skin/skin0001") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/skins/skin0001") {
      if (method === "PUT") { writes++; return { data: {} }; }
      return { data: { publicId: "skin0001", kind: "skin", model: "default", name: "Synthetic original", description: "Original description", tags: [], visibility: "public", reviewStatus: "approved", canEdit: true } };
    }
    if (path === "/api/v1/skins/skin0001/content") {
      if (failed) return { status: 503, error: "Synthetic content read unavailable" };
      return { data: { defaultLocale: "en-US", resolvedLocale: "en-US", available: [
        { locale: "en-US", name: "Original English", summary: "English description", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true },
        { locale: "zh-CN", name: "中文原稿", summary: "中文描述", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true },
      ] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/skins/skin0001/edit`);
    await page.getByRole("heading", { name: "Edit skin", exact: true }).or(page.getByText("Failed to load editor data.", { exact: true })).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit changes", exact: true }).count(), 0, "a failed localization read must not expose a writable fallback snapshot");
    assert.equal(writes, 0);
    if (await page.getByRole("alertdialog").count()) await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("textbox", { name: "Name (en-US)", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Name (en-US)", exact: true }).inputValue(), "Original English");
    assert.equal(writes, 0, "retry must only re-read the existing content");
  } finally { await browser.close(); }
});

test("skin list retry preserves the submitted filter and only re-reads the list", { timeout: 30_000 }, async () => {
  let failed = false;
  const searches: string[] = [];
  const browser = await fixture.page(({ path, method, url }) => {
    if (path !== "/api/v1/skins") return;
    assert.equal(method, "GET");
    searches.push(url.searchParams.get("q") || "");
    return failed ? { status: 503, error: "Synthetic skin list unavailable" } : { data: { items: [], hasMore: false, nextCursor: "" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/skins`);
    const query = page.getByRole("searchbox");
    await query.fill("synthetic retry filter");
    failed = true;
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Synthetic skin list unavailable" }).waitFor();
    if (await page.getByRole("alertdialog").count()) await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("No textures match these filters.", { exact: true }).waitFor();
    assert.equal(await query.inputValue(), "synthetic retry filter");
    assert.equal(searches.at(-1), "synthetic retry filter");
    assert.equal(searches.filter(value => value === "synthetic retry filter").length, 2);
  } finally { await browser.close(); }
});
