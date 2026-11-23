import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

const serverID = "r3fixture1";
const serverPath = `/api/v1/servers/${serverID}`;
const serverName = "Synthetic Minecraft server";

function record(name = serverName, canEdit = true) {
  return {
    id: serverID, name, canEdit, reviewStatus: "approved", address: "play.example.invalid:25565",
    shortDescription: "Synthetic public summary", bodyMarkdown: "Synthetic public introduction",
    modded: false, primaryTag: "survival", languages: ["en-US"], minecraftVersions: ["1.20.1"],
    minecraftVersion: "1.20.1", online: true, latencyMs: 10, playersOnline: 2, playersMax: 20,
    dedicatedClient: false, hasWhitelist: false, onlineMode: true, links: [], mods: [], modListComplete: true,
  };
}

const relatedEndpoints: APIHandler = ({ path }) => {
  if (path === `${serverPath}/history`) return { data: { range: "24h", points: [] } };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === `/api/v1/projects/${serverID}/follow`) return { data: { followed: false } };
  if (path === "/api/v1/servers/settings") return { data: { maxProofFiles: 5, maxProofTotalBytes: 10485760, nameMaxLength: 80, summaryMaxLength: 240, historyDays: 90, reviewRequired: true } };
  if (path === "/api/v1/minecraft/versions" || path === "/api/v1/markdown/config" || path === "/api/v1/changelogs" || path.startsWith("/api/v1/content-metrics/") || path.startsWith("/api/v1/ratings/")) {
    return { status: 404, error: "No related fixture data" };
  }
};

test("changing the interface language in another tab preserves unsaved server edits", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(request => request.path === serverPath ? { data: record() } : relatedEndpoints(request));
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/${serverID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const name = page.getByRole("dialog").getByRole("textbox", { name: "Server name", exact: true });
    await name.fill("My unsaved server name");

    const preferencesTab = await page.context().newPage();
    try {
      await preferencesTab.goto(`${fixture.origin}/login`);
      await preferencesTab.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
      const localizedName = page.getByRole("dialog", { name: "编辑 Minecraft 服务器" }).getByRole("textbox", { name: "服务器名称", exact: true });
      assert.equal(await localizedName.inputValue(), "My unsaved server name");
    } finally {
      await preferencesTab.close();
    }
  } finally {
    await browser.close();
  }
});

test("a save reports draft completion failure before closing the server editor", { timeout: 30_000 }, async () => {
  let savedName = serverName;
  let saves = 0;
  let completions = 0;
  const browser = await fixture.page(request => {
    if (request.path === serverPath && request.method === "PATCH") {
      saves += 1;
      savedName = JSON.parse(request.body).name;
      return { data: { id: serverID } };
    }
    if (request.path === serverPath) return { data: record(savedName) };
    if (request.path === "/api/v1/users/me/drafts/complete") {
      completions += 1;
      return { status: 503, error: "Synthetic draft completion failure" };
    }
    return relatedEndpoints(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/${serverID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit Minecraft server" });
    await editor.getByRole("textbox", { name: "Server name", exact: true }).fill("Saved server name");
    const warnings: string[] = [];
    page.on("dialog", async dialog => { warnings.push(dialog.message()); await dialog.accept(); });
    await editor.getByRole("button", { name: "Save server", exact: true }).click();
    await page.getByRole("heading", { name: "Saved server name", exact: true }).waitFor();
    assert.equal(saves, 1);
    assert.equal(completions, 1);
    assert.equal(warnings.length, 1, "a successful server edit with a failed draft completion needs a visible warning");
    assert.match(warnings[0], /saved.*draft/i);
  } finally {
    await browser.close();
  }
});

test("a read-only server detail retries transient failure without opening a previous draft", { timeout: 30_000 }, async () => {
  let reads = 0;
  let draftReads = 0;
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") {
      return { data: { id: "readonlyactor", username: "Read-only user", email: "readonly@example.invalid", roleCodes: [], permissionRules: [] } };
    }
    if (request.path === serverPath) {
      reads += 1;
      return reads === 1 ? { status: 503, error: "Synthetic server detail outage" } : { data: record(serverName, false) };
    }
    if (request.path === "/api/v1/users/me/drafts/previous-draft") {
      draftReads += 1;
      return { status: 404, error: "No editable draft" };
    }
    return relatedEndpoints(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/servers/${serverID}?draft=previous-draft`);
    await page.getByText("Synthetic server detail outage", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: serverName, exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Edit Minecraft server" }).count(), 0);
    assert.equal(reads, 2);
    assert.equal(draftReads, 0);
  } finally {
    await browser.close();
  }
});
