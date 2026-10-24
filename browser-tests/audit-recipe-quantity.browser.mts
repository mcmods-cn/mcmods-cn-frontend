import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

for (const [kind, amount, unit, expected] of [["item", 3, "", "3"], ["fluid", 250, "mB", "250 mB"], ["gas", 80, "mB", "80 mB"]] as const) test(`CONT-002/GR-010 ${kind} output quantity survives the visual projection`, { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: { id: "ordinary1", username: "Ordinary reader", roleCodes: [], permissionRules: [] } };
    if (path === "/api/v1/catalog/recipes/manualamount/render") return { data: { publicId: "manualamount", recipeTypePublicId: "manualtype", recipeId: "audit:manual_quantity", recipeIdSource: "canonical", recipeIdCanonical: true, semanticFingerprint: "fixture", revisionId: "", modSiteId: "", note: "", layout: { canvas: { width: 100, height: 50 }, slots: [
      { role: "input", ingredient_present: false, rect: { x: 1, y: 1, width: 16, height: 16 }, alternatives: [] },
      { role: "output", ingredient_present: true, rect: { x: 30, y: 1, width: 20, height: 24 }, visual_rect: { x: 32, y: 3, width: 16, height: 16 }, alternatives: [{ id: "audit:result", kind, amount, unit, probability: .5, names: { en_us: "Manual result" } }] },
    ] } } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?recipePublicId=manualamount`);
    const card = page.locator("#recipe-manualamount");
    await card.getByText(expected, { exact: true }).waitFor();
    await card.getByText("50%", { exact: true }).waitFor();
    const slot = card.locator('span[tabindex="0"]');
    assert.equal(await slot.count(), 1, "The empty input must stay empty");
    assert.equal(await slot.evaluate(node => (node as HTMLElement).style.width), "40px", "Count must not change the interaction rectangle");
    const visual = slot.locator("span.pointer-events-none.absolute.block");
    assert.equal(await visual.evaluate(node => (node as HTMLElement).style.left), "4px");
    assert.equal(await visual.evaluate(node => (node as HTMLElement).style.width), "32px");
    assert.equal(await visual.getByText(expected, { exact: true }).count(), 1, "Quantity belongs to the visual rectangle");
  } finally { await browser.close(); }
});
