import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-01-02T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
  if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "test048u1", username: "Test reviewer", signature: "Synthetic signature", signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
  if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
  if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { limitTokens: 0, remainingTokens: 0, usedTokens: 0, reservedTokens: 0, unlimited: false } } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
// Native production editors; backend snapshots/writes and texture responses
// are explicit synthetic fixtures, not actual persistence or vendor quality.
test("BUG144 FP057 PERF068 recipe edits preserve nested definitions and picker selection while locale resets its page offset", { timeout: 35_000 }, async () => {
  const typeId = "type-real-01", recipeId = "recipe-real-01", templateId = "template-real-01";
  const nested = { imported: { condition: [{ key: "preserve", values: [1, 2, { enabled: true }] }] } };
  const bindingDefinition = { binding: { custom: "keep-binding" } };
  const candidateDefinition = { candidate: { components: { nested: ["keep-candidate"] } } };
  const template = { publicId: templateId, recipeTypePublicId: typeId, templateKey: "synthetic_crafting", canvas: { width: 176, height: 86, imageScale: 1 }, slots: [{ slotKey: "result", role: "output", outputIndex: 0, rect: { x: 100, y: 20, width: 18, height: 18 } }] };
  const resource = { publicId: "resource01", id: "fixture:item", kind: "minecraft.item", registry: "minecraft:item", names: {}, name: "", unresolved: false };
  const writes: Array<Record<string, unknown>> = [];
  const resourceReads: Array<{offset:number;locale:string}> = [];
  const batches: Array<Record<string, unknown>> = [];
  const browser = await controlled(({ path, method, body, url }) => {
    if (path === `/api/v1/catalog/recipes/${recipeId}`) {
      if (method === "PUT") { writes.push(JSON.parse(body)); return { status: 503, error: "Controlled recipe save failure" }; }
      return { data: { publicId: recipeId, recipeTypePublicId: typeId, templatePublicId: templateId, canonicalSourceId: "fixture:crafting_source", applicableVersions: ["1.21"], defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Synthetic recipe", summary: "", contentMarkdown: "", provenance: "human", reviewStatus: "approved", editable: true }], publishedRevisionId: "revision-before", reviewStatus: "approved", definition: nested, bindings: { result: { definition: bindingDefinition, candidates: [{ resourcePublicId: "resource01", canonicalId: "fixture:item", kindCode: "minecraft.item", amount: 1, definition: candidateDefinition }] } } } };
    }
    if (path === "/api/v1/recipe-types") return { data: { items: [{ publicId: typeId, canonicalId: "minecraft:crafting", name: "Synthetic crafting" }], total: 1 } };
    if (path === "/api/v1/catalog/recipe-source-versions") return { data: { items: [] } };
    if (path === `/api/v1/recipe-types/${typeId}/templates`) return { data: { items: [template] } };
    if (path === `/api/v1/recipe-templates/${templateId}`) return { data: template };
    if (path === "/api/v1/catalog/resource-presentations") { batches.push(JSON.parse(body)); return { data: { items: [{ ...resource, names: { "en-US": "Hydrated item", "zh-CN": "水合物品" } }] } }; }
    if (path === "/api/v1/catalog/resources") {
      const offset=Number(url.searchParams.get("offset")), locale=url.searchParams.get("locale") || "";
      assert.equal(url.searchParams.has("cursor"),false);resourceReads.push({offset,locale});
      return {data:{items:[{...resource,names:{"en-US":"Hydrated item","zh-CN":"水合物品"}}],total:80,limit:40,offset}};
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/recipe-types?editor=recipe-edit&publicId=${typeId}&recipePublicId=${recipeId}`);
    const name = page.getByLabel("Localized name", { exact: true });
    await name.waitFor();
    await page.getByLabel(/^Recipe methods/).locator(`option[value="${typeId}"]`).waitFor({ state: "attached" });
    await page.getByLabel("Amount", { exact: true }).fill("3");
    await name.fill("Changed recipe with imported extensions");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Controlled recipe save failure", { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].definition, nested);
    const result = (writes[0].bindings as Record<string, {definition:unknown;candidates:Array<{amount:number;definition:unknown}>}>).result;
    assert.deepEqual(result.definition, bindingDefinition);
    assert.deepEqual(result.candidates[0].definition, candidateDefinition);
    assert.equal(result.candidates[0].amount, 3);
    await page.getByRole("button", { name: "Choose resources", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('button[aria-pressed="true"]').filter({hasText:"Hydrated item"}).waitFor();
    assert.equal(await dialog.locator('button[aria-pressed="true"]').count(), 1);
    assert.equal(batches.length, 1, "one batch hydrates the missing selected presentation");
    assert.equal((batches[0].items as unknown[]).length, 1);
    const continuation=page.waitForResponse(response=>response.url().includes("offset=40"));
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await (await continuation).finished();
    await dialog.getByRole("button",{name:"Previous",exact:true}).waitFor();
    assert.equal(resourceReads.at(-1)?.offset,40);
    const languagePage = await page.context().newPage();
    try { await languagePage.goto(`${fixture.origin}/login`); await languagePage.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN"); await page.waitForFunction(() => document.documentElement.lang === "zh-CN"); } finally { await languagePage.close(); }
    await dialog.locator('button[aria-pressed="true"]').filter({hasText:"水合物品"}).waitFor();
    assert.equal(resourceReads.at(-1)?.offset,0);
    assert.equal(resourceReads.at(-1)?.locale, "zh-CN");
    assert.equal(await dialog.locator('button[aria-pressed="true"]').count(), 1, "selected resource remains selected after the locale reset");
    assert.equal(batches.length, 2, "language change performs one further batch rather than per-resource reads");
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    assert.equal(await page.getByLabel("本地化名称", { exact: true }).inputValue(), "Changed recipe with imported extensions");
  } finally { await browser.close(); }
});

test("FP046 character bio remains unsaved across UI locale and successful appearance updates", { timeout: 30_000 }, async () => {
  const texture = { publicId: "skin0001", kind: "skin", model: "default", name: "Synthetic wardrobe skin", description: "", tags: [], visibility: "public", reviewStatus: "approved", textureHash: "", canEdit: false, canUse: true, inWardrobe: true, downloads: 0, createdAt: stamp };
  const profile = { publicId: "player01", uuid: "synthetic-uuid", name: "PlayerOne", bio: "Server character bio", visibility: "public", isDefault: true, skin: null, cape: null, createdAt: stamp, updatedAt: stamp };
  const writes: Array<Record<string, unknown>> = [];
  let profileReads = 0;
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/skin-service") return { data: { enabled: false } };
    if (path === "/api/v1/users/me/player-profiles") { profileReads++; return { data: { items: [profile] } }; }
    if (path === "/api/v1/users/me/skin-wardrobe") return { data: { items: [texture], total: 1, limit: 100, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/users/me/launcher-sessions") return { data: { items: [] } };
    if (path === "/api/v1/users/me/player-profiles/player01/textures") { assert.equal(method, "PUT"); writes.push(JSON.parse(body)); return { data: { ...profile, skin: texture } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=players`);
    const bio = page.getByRole("textbox", { name: "Character bio", exact: true });
    await bio.waitFor(); await bio.fill("Unsaved player biography");
    const readsBefore = profileReads;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const chineseBio = page.locator('textarea[maxlength="500"]');
    assert.equal(await chineseBio.inputValue(), "Unsaved player biography");
    assert.equal(profileReads, readsBefore);
    await page.locator('select:has(option[value="skin0001"])').selectOption("skin0001");
    await page.getByRole("button", { name: "保存角色外观", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    assert.deepEqual(writes, [{ skinPublicId: "skin0001", capePublicId: null }]);
    assert.equal(await chineseBio.inputValue(), "Unsaved player biography", "same profile's response must not reset unsaved bio");
  } finally { await browser.close(); }
});

test("BUG147 addon parent facets preserve an off-page selection and load more with a bounded cursor", { timeout: 30_000 }, async () => {
  const calls: Array<{cursor:string;selected:string[]}> = [];
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/content-projects/addon") return { data: { items: [], total: 0 } };
    if (path === "/api/v1/content-projects/addon/facets/parents") {
      assert.equal(url.searchParams.get("limit"), "50"); assert.equal(url.searchParams.has("offset"), false);
      const cursor = url.searchParams.get("cursor") || "", selected = url.searchParams.getAll("selected"); calls.push({cursor,selected});
      return { data: { items: cursor ? [{ key: "parent-second", label: "Second-page parent" }] : [{ key: "parent-first", label: "First-page parent" }], selectedItems: [{ key: "selected-last", label: "Selected off-page parent" }], hasMore: !cursor, nextCursor: cursor ? "" : "parent-next" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/addons?parent=selected-last`);
    const selected = page.getByRole("checkbox", { name: "Selected off-page parent", exact: true });
    await selected.waitFor();
    assert.equal(await selected.isChecked(), true);
    await page.getByRole("button", { name: "Load more parent projects", exact: true }).click();
    await page.getByRole("checkbox", { name: "Second-page parent", exact: true }).waitFor();
    assert.equal(await selected.isChecked(), true);
    assert.deepEqual(calls, [{cursor:"",selected:["selected-last"]},{cursor:"parent-next",selected:["selected-last"]}]);
  } finally { await browser.close(); }
});
