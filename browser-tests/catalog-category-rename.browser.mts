import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

const section = {
  publicId: "section01", versionPublicId: "version01", templatePublicId: "template1", templateCode: "item",
  templateBuiltin: true, templateI18nKey: "", parentPublicId: "", defaultLocale: "en-US",
  displayMode: "compact", ordinal: 0, status: "active", publishedRevisionId: "revision1",
  localizations: [{ locale: "en-US", name: "Workshop", summary: "", contentMarkdown: "" }], resourceCount: 0,
};
const english = { locale: "en-US", name: "Tools", summary: "Used to shape blocks", contentMarkdown: "" };
const chinese = { locale: "zh-CN", name: "工具", summary: "加工方块使用的工具", contentMarkdown: "" };
const category = { ...section, publicId: "category1", parentPublicId: section.publicId, localizations: [english, chinese] };

for (const [name, viewport] of Object.entries({ desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } })) {
  test(`category names keep their descriptions and other translations across a failed save on ${name}`, async () => {
    const patches: { categories: typeof category[] }[] = [];
    const browser = await fixture.page(({ path, method, body }) => {
      if (path !== "/api/v1/mods/workshop/content-sections/section01/layout") return;
      if (method === "PATCH") {
        patches.push(JSON.parse(body));
        return { status: 503, error: "Layout review service unavailable" };
      }
      return { data: { section, categories: [category], items: [], total: 0, limit: 500, hasMore: false, nextCursor: "", capabilities: {} } };
    }, { viewport });
    try {
      const { page } = browser;
      await page.goto(fixture.origin + "/mods/workshop/data/sections/section01/arrange");
      const language = page.getByRole("combobox", { name: "Editing language" });
      const input = page.getByRole("textbox", { name: /^Localized name: / });
      await input.waitFor();
      await language.selectOption("de-DE");
      await input.scrollIntoViewIfNeeded();
      const artifact = process.env.MCMODS_CATEGORY_LAYOUT_ARTIFACTS;
      if (artifact) {
        await mkdir(artifact, { recursive: true });
        await page.screenshot({ path: join(artifact, name + ".png") });
      }
      const missingValue = await input.inputValue();
      const missingHint = await input.getAttribute("placeholder");
      await language.selectOption("en-US");
      await input.fill("Workbench tools");
      const submit = page.getByRole("button", { name: "Submit layout for review", exact: true }).first();
      await submit.click();
      await page.getByText("Layout review service unavailable", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), "Workbench tools");
      assert.deepEqual(patches[0].categories[0].localizations, [{ ...english, name: "Workbench tools" }, chinese]);
      assert.equal(missingValue, "", "an absent German translation must remain empty");
      assert.equal(missingHint, "Localized name · Tools");
      await language.selectOption("de-DE");
      assert.equal(await input.inputValue(), "");
      await input.fill("Werkzeuge");
      await Promise.all([page.waitForResponse(response => response.request().method() === "PATCH"), submit.click()]);
      assert.deepEqual(patches[1].categories[0].localizations, [
        { ...english, name: "Workbench tools" }, chinese, { locale: "de-DE", name: "Werkzeuge", summary: "", contentMarkdown: "" },
      ]);
      assert.equal(patches.length, 2);
    } finally { await browser.close(); }
  });
}

test("the parent selector and drag tree apply the same allowed category moves", async () => {
  const shelf = { ...category, publicId: "category2", ordinal: 11, localizations: [{ ...english, name: "Shelf" }] };
  const patches: { categories: typeof category[] }[] = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path !== "/api/v1/mods/workshop/content-sections/section01/layout") return;
    if (method === "PATCH") {
      patches.push(JSON.parse(body));
      return { status: 503, error: "Layout review service unavailable" };
    }
    return { data: { section, categories: [category, shelf], items: [], total: 0, limit: 500, hasMore: false, nextCursor: "", capabilities: {} } };
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/mods/workshop/data/sections/section01/arrange");
    const row = (name: string) => page.locator("section").filter({ has: page.getByRole("textbox", { name: "Localized name: " + name, exact: true }) }).last();
    const parent = (name: string) => row(name).getByRole("combobox", { name: "Parent category", exact: true });
    await parent("Tools").selectOption(shelf.publicId);
    assert.deepEqual(await parent("Shelf").locator("option").evaluateAll(options => options.map(item => (item as HTMLOptionElement).value)), [section.publicId]);
    const article = (text: string) => page.getByRole("article").filter({ has: page.getByText(text, { exact: true }) });
    await article("Shelf").dragTo(article("Tools"));
    assert.equal(await parent("Shelf").inputValue(), section.publicId);
    assert.equal(await parent("Tools").inputValue(), shelf.publicId);
    await article("Tools").dragTo(article("Uncategorized / page root"));
    assert.equal(await parent("Tools").inputValue(), section.publicId);
    await page.getByRole("combobox", { name: "Parent category", exact: true }).first().selectOption(category.publicId);
    await row("Tools").getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("textbox", { name: "New category name", exact: true }).fill("New bin");
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === "PATCH"),
      page.getByRole("button", { name: "Submit layout for review", exact: true }).first().click(),
    ]);
    const items = patches[0].categories;
    assert.deepEqual(items.map(item => [item.localizations[0].name, item.parentPublicId, item.ordinal]), [
      ["Shelf", section.publicId, 0], ["New bin", section.publicId, 1],
    ]);
  } finally { await browser.close(); }
});
