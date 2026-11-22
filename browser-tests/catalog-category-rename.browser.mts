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
      await language.selectOption("en-US");
      await input.fill("Workbench tools");
      const submit = page.getByRole("button", { name: "Submit layout for review", exact: true }).first();
      await submit.click();
      await page.getByText("Layout review service unavailable", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), "Workbench tools");
      assert.deepEqual(patches[0].categories[0].localizations, [{ ...english, name: "Workbench tools" }, chinese]);
      assert.equal(missingValue, "", "an absent German translation must remain empty");
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
