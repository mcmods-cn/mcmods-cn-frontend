import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

// Real production React and browser focus navigation; only API/provider
// responses are synthetic. These cases do not verify database persistence.
const editorAPI: APIHandler = ({ path, method }) => {
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [
    { code: "1.21", type: "release" }, { code: "1.21.1", type: "release" },
    { code: "24w01a", type: "snapshot" },
  ], loaders: [] } };
  if (path === "/api/v1/creator-roles") return { data: { items: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/users/me/drafts") return { data: method === "POST" ? { updatedAt: "2026-10-02T01:00:00Z" } : { items: [] } };
};

test("FP072 Minecraft picker keeps keyboard focus modal and restores its trigger", { timeout: 30_000 }, async () => {
  for (const [locale, title, search, snapshots, confirm] of [
    ["en-US", "Select Minecraft versions", "Search versions", "Show snapshots", "Confirm"],
    ["zh-CN", "选择 Minecraft 版本", "搜索版本", "显示快照版本", "确定"],
  ]) {
    const browser = await fixture.page(editorAPI);
    try {
      const { page } = browser;
      await page.context().addCookies([{ name: "mcmods-ui-locale", value: locale, url: fixture.origin }]);
      if (locale === "zh-CN") await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${fixture.origin}/plugins/new`);
      const trigger = page.getByTitle(title, { exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
      for (const key of ["Tab", "Shift+Tab"]) {
        for (let index = 0; index < 12; index++) {
          await page.keyboard.press(key);
          assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, "Tab must not reach the background form");
        }
      }
      const searchInput = dialog.getByRole("textbox", { name: search, exact: true });
      await searchInput.fill("1.21");
      const snapshotToggle = dialog.getByRole("button", { name: snapshots, exact: true });
      assert.equal(await snapshotToggle.getAttribute("aria-pressed"), "false");
      await snapshotToggle.click();
      assert.equal(await snapshotToggle.getAttribute("aria-pressed"), "true");
      await dialog.getByRole("button", { name: /^1\.21\s/ }).click();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
      assert.equal(await trigger.textContent().then(value => value?.includes(title)), true, "Cancel must discard pending selection");
      await page.keyboard.press("Enter");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: /^1\.21\s/ }).click();
      await dialog.getByRole("button", { name: confirm, exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "1.21" }).count(), 1);
      assert.equal(await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "1.21" }).evaluate(element => element === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await browser.close(); }
  }
});

test("FP074 mod catalog corrects an out of range URL page and re-fetches its results", { timeout: 30_000 }, async () => {
  const offsets: number[] = [];
  const record = {
    id: "fp074mod1", uniqueId: "fp074mod1", siteId: "fp074-mod", primaryName: "Recovered catalog result",
    secondaryName: "", abbreviation: "FP074", summary: "Synthetic catalog item", defaultLocale: "en-US",
    localizations: [], modIds: [], environment: "bothRequired", primaryCategory: "utility", compatibilities: [],
    officialStatus: "active", sourceStatus: "open", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "",
    githubProjectPath: "", iconUrl: "", bodyMarkdown: "", searchKeywords: [], submissionMethod: "manual",
    reviewStatus: "approved", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    tags: [], authors: [], links: [], relationshipGroups: [], galleryImages: [],
  };
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/mods") {
      const offset = Number(request.url.searchParams.get("offset"));
      offsets.push(offset);
      assert.equal(request.url.searchParams.get("q"), "recover");
      assert.equal(request.url.searchParams.get("sort"), "updated");
      assert.equal(request.url.searchParams.get("order"), "asc");
      return { data: { items: offset ? [] : [record], total: 10 } };
    }
    if (request.path === "/api/v1/users/me/favorites/summary") return { data: { entityPublicIds: [], collectionIdsByEntity: {} } };
    return editorAPI(request);
  });
  try {
    await browser.page.goto(`${fixture.origin}/mods?q=recover&sort=updated&order=asc&page=999&size=20`);
    await browser.page.getByRole("heading", { name: "[FP074] Recovered catalog result", exact: true }).waitFor();
    const url = new URL(browser.page.url());
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("q"), "recover");
    assert.equal(url.searchParams.get("sort"), "updated");
    assert.equal(url.searchParams.get("order"), "asc");
    assert.equal(url.searchParams.get("size"), "20");
    assert.equal(await browser.page.getByRole("searchbox", { name: "Search", exact: true }).inputValue(), "recover");
    assert(offsets.includes(19_960), "The initial request must use the original URL page");
    assert(offsets.includes(0), "Correcting the URL must issue a new request for the actual first page");
  } finally { await browser.close(); }
});

test("FP077 modpack catalog uses its own category vocabulary", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/modpacks") return { data: { total: 1, items: [{
      id: "fp077pack1", siteId: "fp077-pack", primaryName: "Vocabulary fixture pack", secondaryName: "",
      abbreviation: "FP077", summary: "Synthetic modpack", defaultLocale: "en-US", primaryCategory: "skyblock",
      packType: "native", packagingMethod: "other", environment: "bothRequired", compatibilities: [],
      tags: ["kitchen_sink", "chinese"], searchKeywords: [], authors: [], officialStatus: "active",
      sourceStatus: "open", license: "MIT", curseforgeProjectId: "", modrinthProjectId: "", iconUrl: "",
      bodyMarkdown: "", submissionMethod: "manual", reviewStatus: "approved", links: [], hasGallery: false,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    }] } };
    if (request.path === "/api/v1/users/me/favorites/summary") return { data: { entityPublicIds: [], collectionIdsByEntity: {} } };
    return editorAPI(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/modpacks`);
    const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name: "[FP077] Vocabulary fixture pack", exact: true }) });
    await card.getByText("Skyblock", { exact: true }).waitFor();
    await card.getByText("Kitchen sink", { exact: true }).waitFor();
    await card.getByText("Chinese original", { exact: true }).waitFor();
    assert.equal(await card.getByText(/mods\.(tags|categories)\./).count(), 0);
  } finally { await browser.close(); }
});

test("FP084 GitHub-only automation preserves an empty compatibility source and retries failed reads", { timeout: 30_000 }, async () => {
  for (const failFirst of [false, true]) {
    let reads = 0;
    let allowRead = !failFirst;
    const writes: Array<{ items: Array<{ kind: string; sourceType: string }> }> = [];
    const projectId = "fp084p001";
    const base = `/api/v1/projects/plugin/${projectId}/automation`;
    const settings = [
      { updateKind: "minecraft_versions", sourceType: "", interval: "quarter", enabled: false },
      { updateKind: "changelog", sourceType: "github", interval: "never", enabled: false },
      { updateKind: "site_downloads", sourceType: "github", interval: "never", enabled: false },
    ];
    const browser = await fixture.page(request => {
      if (request.path === "/api/v1/content-projects/plugin/github-only") return { data: {
        id: projectId, projectType: "plugin", siteId: "github-only", primaryName: "GitHub-only fixture", abbreviation: "",
        defaultLocale: "en-US", localizations: [], summary: "Synthetic project", bodyMarkdown: "", reviewStatus: "approved",
        canEdit: true, minecraftVersions: [], loaders: [], categories: [], features: [], authors: [], links: [], galleryImages: [],
        parentProjects: [], license: "MIT", iconUrl: "",
      } };
      if (request.path === base && request.method === "GET") {
        reads++;
        if (!allowRead) return { status: 503, error: "Synthetic automation read failure" };
        return { data: { project: { id: projectId, type: "plugin", url: "/plugins/github-only" }, settings,
          sources: [{ sourceType: "github", externalProjectId: "fixture/project", externalProjectUrl: "https://github.com/fixture/project", verifiedAt: "2026-10-02T01:00:00Z" }],
        } };
      }
      if (request.path === base && request.method === "PUT") {
        const payload = JSON.parse(request.body) as { items: Array<{ kind: string; sourceType: string }> };
        writes.push(payload);
        if (payload.items.some(item => item.kind === "minecraft_versions" && item.sourceType === "github")) return { status: 400, error: "Invalid Minecraft compatibility source" };
        return { data: {} };
      }
      if (request.path === `${base}/runs`) return { data: { items: [] } };
      if (request.path === `/api/v1/projects/${projectId}/follow`) return { data: { followed: false, notificationsEnabled: false } };
      if (request.path === `/api/v1/review-locks/plugin/${projectId}`) return { data: { locked: false } };
      if (request.path === `/api/v1/ratings/plugin/${projectId}`) return { data: { dimensions: [], canRate: false, canViewReviews: false,
        ratingCount: 0, overallAverage: 0, heatScore: 0, heatComponents: {}, engagement: {},
      } };
      if (request.path === `/api/v1/content-metrics/${projectId}/view`) return { data: {} };
      if (request.path === `/api/v1/content-metrics/${projectId}`) return { data: { id: projectId, type: "plugin", createdAt: "2026-10-02T01:00:00Z",
        editCount: 0, directViews: 0, childViews: 0, totalViews: 0, recentEditors: [], editors: [], developers: [], tutorials: [], issues: [], news: [], discussions: [],
      } };
      if (request.path === `/api/v1/comment-targets/plugin/${projectId}/comments`) return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
      if (request.path === "/api/v1/anti-abuse/form-token") return { data: { token: "fp084form", fieldName: "contact_reference", expiresAt: "2099-10-02T01:00:00Z" } };
      return editorAPI(request);
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/plugins/github-only`);
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Project auto updates", exact: true }) });
      if (failFirst) {
        await panel.getByText("Synthetic automation read failure", { exact: true }).waitFor();
        const failedReads = reads;
        allowRead = true;
        await panel.getByRole("button", { name: "Retry", exact: true }).click();
        await panel.getByRole("button", { name: "Save", exact: true }).waitFor();
        assert(reads > failedReads, "Retry must make a new automation settings request");
      }
      const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === base && response.request().method() === "PUT");
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      assert.equal((await savedResponse).status(), 200, "Saving a GitHub-only project must not submit GitHub as Minecraft compatibility source");
      await panel.getByText("Auto-update settings saved.", { exact: true }).waitFor();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].items.find(item => item.kind === "minecraft_versions")?.sourceType, "");
      assert.equal(writes[0].items.find(item => item.kind === "changelog")?.sourceType, "github");
      assert.equal(writes[0].items.find(item => item.kind === "site_downloads")?.sourceType, "github");
    } finally { await browser.close(); }
  }
});
