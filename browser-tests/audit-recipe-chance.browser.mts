import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

// Real production React/browser with controlled API responses, not live API/DB
// integration. The separate CORE_SAMPLE journey retains that required layer.
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

for (const known of [true, false]) test(`NEW-FRONTEND-RECIPE-CHANCE-001 ${known ? "both known output probabilities" : "unknown output probabilities"} in the real recipe card`, { timeout: 30_000 }, async () => {
  const publicId = known ? "knownchance" : "unknownchance";
  const chance = { chance_available: known, chance: known ? .25 : null, chance_percent: known ? 25 : null, chance_text: known ? "Chance: 25%" : "Chance: unknown" };
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: { id: "ordinary1", username: "Ordinary reader", roleCodes: [], permissionRules: [] } };
    if (path === `/api/v1/catalog/recipes/${publicId}/render`) return { data: {
      publicId, recipeTypePublicId: "chancefixture", recipeId: `sample:${publicId}`, recipeIdSource: "registered",
      revisionId: "", modSiteId: "", note: "", layout: { canvas: { width: 128, height: 64 }, slots: [
        { role: "input", rect: { x: 5, y: 5, width: 16, height: 16 }, alternatives: [{ id: "minecraft:stone", amount: known ? 3 : 7, names: { en_us: "Stone" } }] },
        { role: "output", rect: { x: 77, y: 23, width: 16, height: 16 }, alternatives: [{ id: "minecraft:iron_ingot", amount: known ? 4 : 12, names: { en_us: "Iron ingot" }, ...chance }] },
        { role: "byproduct", semantic_role: "byproduct", rect: { x: 99, y: 23, width: 16, height: 16 }, alternatives: [{ id: "minecraft:diamond", amount: 2, names: { en_us: "Diamond" }, ...chance }] },
      ] },
    } };
  });
  try {
    await browser.page.goto(`${fixture.origin}/recipe-types?recipePublicId=${publicId}`);
    const card = browser.page.locator(`#recipe-${publicId}`);
    const primary = card.locator('[aria-label="Iron ingot (minecraft:iron_ingot)"]');
    const secondary = card.locator('[aria-label="Diamond (minecraft:diamond)"]');
    await secondary.waitFor();
    assert.equal(await primary.getByText("25%", { exact: true }).count(), known ? 1 : 0);
    assert.equal(await secondary.getByText("25%", { exact: true }).count(), known ? 1 : 0);
    assert.equal(await card.getByText("25%", { exact: true }).count(), known ? 2 : 0, "Each known output owns a badge; unknown outputs invent none");
    assert.equal(await card.getByText("Chance: unknown", { exact: true }).count(), 0);
    assert.equal(await primary.getByText(known ? "4" : "12", { exact: true }).count(), 1);
    assert.equal(await secondary.getByText("2", { exact: true }).count(), 1, "Byproduct quantity remains separate from probability");
  } finally { await browser.close(); }
});

test("unknown candidates suppress old slot percentages while a semantic byproduct displays its upper bound", { timeout: 30_000 }, async () => {
  const publicId = "boundedchance";
  const browser = await fixture.page(({ path }) => {
    if (path === `/api/v1/catalog/recipes/${publicId}/render`) return { data: {
      publicId, recipeTypePublicId: "bounds", recipeId: "sample:bounds", recipeIdSource: "registered",
      layout: { canvas: { width: 128, height: 64 }, slots: [
        { role: "output", chance: .8, rect: { x: 32, y: 8, width: 16, height: 16 }, alternatives: [{ id: "sample:unknown", chance_available: false }] },
        { semantic_role: "byproduct", rect: { x: 64, y: 8, width: 16, height: 16 }, alternatives: [{ id: "sample:fluid", amount: 250, unit: "mB", chance_comparator: "less_than", probability: .01, chance_text: "Below one percent" }] },
      ] },
    } };
  });
  try {
    await browser.page.goto(`${fixture.origin}/recipe-types?recipePublicId=${publicId}`);
    const card = browser.page.locator(`#recipe-${publicId}`);
    await card.getByText("<1%", { exact: true }).waitFor();
    assert.equal(await card.getByTitle("Below one percent", { exact: true }).count(), 1);
    assert.equal(await card.getByText("250 mB", { exact: true }).count(), 1);
    assert.equal(await card.getByText("80%", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});
