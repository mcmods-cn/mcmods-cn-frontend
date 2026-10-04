import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-01-02T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }], loaders: [] } };
  if (path === "/api/v1/users/me/drafts") return { data: { id: "synthetic-draft", updatedAt: stamp } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
const actor = (id: string) => ({ id, username: id, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 });

// Browser components are shipped production code. All backend writes, revision
// conflicts and vendor messages are explicit synthetic transport fixtures.
test("BUG151 playground read failure disables writes and CAS conflict requires an explicit version choice", { timeout: 30_000 }, async () => {
  let readFails = true;
  const writes: Array<Record<string, unknown>> = [];
  const browser = await controlled(({ path, method, body }) => {
    if (path !== "/api/v1/users/me/markdown-playground") return;
    if (method === "GET") return readFails ? { status: 503, error: "Controlled draft read failure" } : { data: { content: "Original server content", revision: 7, updatedAt: stamp } };
    const payload = JSON.parse(body); writes.push(payload);
    if (writes.length === 1) return { status: 409, code: "MARKDOWN_DRAFT_CONFLICT", error: "Synthetic concurrent revision", details: { content: "Another tab server content", revision: 8, clientSequence: payload.clientSequence, updatedAt: stamp } };
    return { data: { revision: 9, clientSequence: payload.clientSequence, updatedAt: stamp } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/playground`);
    await page.getByRole("button", { name: "Retry loading draft", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
    assert.equal(await page.locator('textarea[spellcheck="false"]').isDisabled(), true);
    assert.equal(writes.length, 0);
    readFails = false;
    await page.getByRole("button", { name: "Retry loading draft", exact: true }).click();
    const editor = page.locator('textarea[spellcheck="false"]');
    await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[spellcheck="false"]')?.value === "Original server content");
    await editor.fill("Local unsaved revision");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Keep my version", exact: true }).waitFor();
    assert.equal(await editor.inputValue(), "Local unsaved revision");
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
    assert.equal(writes[0].baseRevision, 7);
    await page.getByRole("button", { name: "Keep my version", exact: true }).click();
    await page.getByText("Saved.", { exact: true }).waitFor();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].baseRevision, 8);
    assert.equal(writes[1].content, "Local unsaved revision");
    assert.equal(writes[1].saveSessionId, writes[0].saveSessionId);
    assert.equal(writes[1].clientSequence, Number(writes[0].clientSequence) + 1);
    assert.equal(await editor.inputValue(), "Local unsaved revision");
  } finally { await browser.close(); }
});

test("FP021 FP059 draw.io accepts only the current iframe and maps the actual UI locale", { timeout: 30_000 }, async () => {
  const browser = await controlled(({ path, url }) => {
    if (url.origin === "https://embed.diagrams.net") return { contentType: "text/html", bytes: Buffer.from("<!doctype html><title>Controlled diagram vendor</title>") };
    if (path === "/api/v1/users/me/markdown-playground") return { data: { content: "Original diagram document", revision: 1, updatedAt: stamp } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/playground`);
    const editor = page.locator('textarea[spellcheck="false"]');
    await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[spellcheck="false"]')?.value === "Original diagram document");
    await page.getByRole("button", { name: "Edit / insert draw.io diagram", exact: true }).click();
    const frame = page.locator('iframe[title="draw.io visual editor"]');
    await frame.waitFor();
    assert.equal(new URL((await frame.getAttribute("src"))!).searchParams.get("lang"), "en");
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://embed.diagrams.net", source: window, data: JSON.stringify({ event: "save", xml: "Wrong window must not insert", exit: true }) })));
    assert.equal(await editor.inputValue(), "Original diagram document");
    assert.equal(await frame.count(), 1);
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example.invalid", source: document.querySelector("iframe")!.contentWindow, data: JSON.stringify({ event: "save", xml: "Wrong origin must not insert", exit: true }) })));
    assert.equal(await editor.inputValue(), "Original diagram document");
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
    await page.evaluate(xml => window.dispatchEvent(new MessageEvent("message", { origin: "https://embed.diagrams.net", source: document.querySelector("iframe")!.contentWindow, data: JSON.stringify({ event: "save", xml, exit: true }) })), xml);
    await frame.waitFor({ state: "detached" });
    assert.match(await editor.inputValue(), /```drawio/);
    assert((await editor.inputValue()).includes(xml));
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("ja-JP");
    await page.waitForFunction(() => document.documentElement.lang === "ja-JP");
    await page.getByRole("button", { name: /draw.io.*|.*draw.io/ }).first().click();
    const localizedFrame = page.locator('iframe[title="draw.io visual editor"]');
    await localizedFrame.waitFor();
    assert.equal(new URL((await localizedFrame.getAttribute("src"))!).searchParams.get("lang"), "ja");
  } finally { await browser.close(); }
});

test("FP006 FP032 creator failed reads and account changes never expose a writable private snapshot", { timeout: 30_000 }, async () => {
  let account = "creator-a";
  let readFails = true;
  let reads = 0;
  const lateRead = Promise.withResolvers<APIReply>();
  const readStarted = Promise.withResolvers<void>();
  const write = Promise.withResolvers<APIReply>();
  const writeStarted = Promise.withResolvers<void>();
  const writes: Array<Record<string, unknown>> = [];
  const creator = { creator: { publicId: "author0001", kind: "author", name: "Author A", avatarUrl: "" }, defaultLocale: "en-US", localizations: [{ locale: "en-US", name: "Author A", contentMarkdown: "Private author description" }], links: [], canEditProfile: true, members: [] };
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: actor(account) };
    if (path === "/api/v1/review-locks/creator/author0001") return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === "/api/v1/creators/author0001") {
      if (method === "PUT") { writes.push(JSON.parse(body)); writeStarted.resolve(); return write.promise; }
      reads++;
      if (account === "creator-b") { readStarted.resolve(); return lateRead.promise; }
      return readFails ? { status: 503, error: "Controlled creator read failure" } : { data: creator };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/authors/author0001/edit`);
    await page.getByRole("heading", { name: "Controlled creator read failure", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
    readFails = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const name = page.getByRole("textbox", { name: "Name", exact: true });
    await name.fill("Unsaved creator name");
    const readCount = reads;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await page.getByRole("textbox", { name: "名称", exact: true }).inputValue(), "Unsaved creator name");
    assert.equal(reads, readCount);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await writeStarted.promise;
    assert.equal(await page.getByRole("textbox", { name: "名称", exact: true }).isDisabled(), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].name, "Unsaved creator name");
    write.resolve({ status: 503, error: "Controlled creator write failure" });
    await page.getByRole("alertdialog").filter({ hasText: "Controlled creator write failure" }).waitFor();
    await page.keyboard.press("Escape");
    account = "creator-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:creator-b" })));
    await readStarted.promise;
    assert.equal(await page.getByRole("textbox", { name: "名称", exact: true }).count(), 0);
    lateRead.resolve({ status: 403, error: "Controlled creator actor denied" });
    await page.getByRole("heading", { name: "Controlled creator actor denied", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "名称", exact: true }).count(), 0);
  } finally { lateRead.resolve({ status: 403, error: "Controlled creator actor denied" }); write.resolve({ data: {} }); await browser.close(); }
});

test("FP014 PERF054 bounded history cursor traversal clears page data and isolates a new actor", { timeout: 30_000 }, async () => {
  let account = "history-a";
  const oldPage = Promise.withResolvers<APIReply>();
  const oldStarted = Promise.withResolvers<void>();
  const cursors: string[] = [];
  const row = (id: string, reason: string) => ({ id, version: 1, status: "approved", origin: "manual", source: "", submittedByName: "Synthetic editor", createdAt: stamp, current: true, reason });
  const browser = await controlled(({ path, url }) => {
    if (path === "/api/v1/auth/me") return { data: actor(account) };
    if (path === "/api/v1/content-projects/plugin/fixture-plugin/history") {
      assert.equal(url.searchParams.get("limit"), "50");
      assert.equal(url.searchParams.has("offset"), false);
      const cursor = url.searchParams.get("cursor") || ""; cursors.push(`${account}:${cursor}`);
      if (account === "history-b") return { data: { items: [row("b1", "New actor first page")], limit: 50, hasMore: false, nextCursor: "" } };
      if (cursor) { oldStarted.resolve(); return oldPage.promise; }
      return { data: { items: [row("a1", "Actor A first page")], limit: 50, hasMore: true, nextCursor: "opaque-next" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/plugins/fixture-plugin/history`);
    await page.getByText("Actor A first page", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await oldStarted.promise;
    assert.equal(await page.getByText("Actor A first page", { exact: true }).count(), 0);
    assert.equal(await page.getByText("No edit history yet.", { exact: true }).count(), 0, "loading a new cursor must not announce an empty history");
    account = "history-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:history-b" })));
    await page.getByText("New actor first page", { exact: true }).waitFor();
    oldPage.resolve({ data: { items: [row("late-a", "Late private history A")], limit: 50, hasMore: false, nextCursor: "" } });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText("Late private history A", { exact: true }).count(), 0);
    assert.equal(await page.getByText("New actor first page", { exact: true }).count(), 1);
    assert(cursors.includes("history-a:opaque-next"));
    assert(cursors.includes("history-b:"));
    assert.equal(cursors.includes("history-b:opaque-next"), false);
  } finally { oldPage.resolve({ data: { items: [], hasMore: false, nextCursor: "", limit: 50 } }); await browser.close(); }
});

test("FP034 permission comparison retains the chosen subjects across UI languages and clears old results", { timeout: 30_000 }, async () => {
  const delayed = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  let hold = false;
  const posts: Array<Record<string, {kind:string;code:string}>> = [];
  const browser = await controlled(({ path, body }) => {
    if (path === "/api/v1/permissions/compare/options") return { data: [{ kind: "me", code: "me", name: "Me" }, { kind: "role", code: "alpha", name: "Alpha role" }, { kind: "role", code: "beta", name: "Beta role" }] };
    if (path === "/api/v1/permissions/compare") {
      const request = JSON.parse(body); posts.push(request);
      const reply = { data: { left: { ...request.left, name: "Left", groups: [], permissions: [] }, right: { ...request.right, name: request.right.code, groups: [], permissions: [] }, rows: [{ code: "synthetic.permission", name: "Synthetic permission", description: "", left: { code: "synthetic.permission", allow: true, priority: 1, source: "Me" } }] } };
      if (hold) { started.resolve(); return delayed.promise; }
      return reply;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/permissions/compare`);
    await page.getByText("Synthetic permission", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Right side", exact: true }).selectOption("role:beta");
    await page.waitForFunction(() => document.querySelector("table")?.textContent?.includes("beta"));
    hold = true;
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await started.promise;
    assert.equal(await page.getByRole("combobox", { name: "右侧对象", exact: true }).inputValue(), "role:beta");
    assert.equal(await page.locator("table").count(), 0, "a pending comparison must not display a result in the old display scope");
    delayed.resolve({ status: 503, error: "Controlled comparison failure" });
    await page.getByRole("alert").filter({ hasText: "Controlled comparison failure" }).waitFor();
    assert.equal(await page.locator("table").count(), 0);
    assert.equal(posts.at(-1)?.right.code, "beta");
  } finally { delayed.resolve({ data: { left: {}, right: {}, rows: [] } }); await browser.close(); }
});
