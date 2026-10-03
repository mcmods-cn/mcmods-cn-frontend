import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

const editPath = "/news/oct03edit/edit";
const updatedAt = "2026-10-03T00:00:00Z";
const payload = (title: string) => ({ kind: "news", category: "site", title, sourceLocale: "en-US", bodyMarkdown: "Synthetic body", minecraftVersions: [], modVersionMin: "", modVersionMax: "", severity: "minor", hasFix: false, issueUrl: "", bountyCurrency: "", bountyAmount: 0, projects: [], resources: [] });
const providers: APIHandler = ({ path }) => {
  if (path === "/api/v1/community/posts/oct03edit") return { data: { ...payload("A"), id: "oct03edit", publishedRevisionId: "oct03rev", coverFileId: "", coverUrl: "" } };
  if (path === "/api/v1/community/post-categories") return { data: { kind: "news", items: ["site"] } };
  if (path === "/api/v1/review-locks/community_post/oct03edit") return { data: { locked: false, subscribed: false, canSubscribe: false } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
};

async function startEditing(page: Page, query = "") {
  // Advance the original 15-second timer with Chromium's clock; do not change
  // application code or substitute the hook/React/browser event machinery.
  await page.clock.install();
  await page.goto(`${fixture.origin}${editPath}${query}`);
  await page.getByLabel("Title", { exact: true }).waitFor();
}

async function autosaveTick(page: Page) {
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/v1/users/me/drafts" && reply.request().method() === "POST");
  await page.clock.runFor(15_001);
  await response;
}

// The actual production React editor and draft HTTP client run unchanged.
// API replies are controlled fixtures: these prove browser behavior, not PG
// persistence or backend draft authorization (covered by separate Go tests).
test("OCT03 BUG126 A to B to A persists both changes and skips only the latest saved snapshot", { timeout: 30_000 }, async () => {
  const titles: string[] = [];
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/users/me/drafts" && request.method === "POST") {
      titles.push(JSON.parse(request.body).payload.title);
      return { data: { updatedAt } };
    }
    return providers(request);
  });
  try {
    const { page } = browser;
    await startEditing(page);
    const title = page.getByLabel("Title", { exact: true });
    assert.equal(await title.inputValue(), "A");
    await page.clock.runFor(15_001);
    assert.deepEqual(titles, [], "Initialization must not create a redundant draft");
    await title.fill("B");
    await autosaveTick(page);
    await page.getByText(/^Draft autosaved at /).waitFor();
    await title.fill("A");
    await autosaveTick(page);
    assert.deepEqual(titles, ["B", "A"]);
    await page.clock.runFor(15_001);
    assert.deepEqual(titles, ["B", "A"], "An unchanged latest remote snapshot must not be reposted");
  } finally { await browser.close(); }
});

test("OCT03 BUG126 edits during an in-flight save follow up once and failed follow-up remains retryable", { timeout: 30_000 }, async () => {
  let release: () => void = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let started: () => void = () => {};
  const firstRequest = new Promise<void>(resolve => { started = resolve; });
  const titles: string[] = [];
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/users/me/drafts" && request.method === "POST") {
      titles.push(JSON.parse(request.body).payload.title);
      if (titles.length === 1) { started(); await blocked; }
      if (titles.length === 2) return { status: 503, code: "DRAFT_TEST_UNAVAILABLE", error: "Synthetic follow-up failure" };
      return { data: { updatedAt } };
    }
    return providers(request);
  });
  try {
    const { page } = browser;
    await startEditing(page);
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("B");
    await page.clock.runFor(15_001);
    await firstRequest;
    await title.fill("C");
    release();
    await page.getByText("Draft autosave failed", { exact: true }).waitFor();
    assert.equal(await title.inputValue(), "C", "A failed follow-up must preserve the user's latest input");
    assert.deepEqual(titles, ["B", "C"], "Exactly one immediate follow-up is allowed per timer invocation");
    await autosaveTick(page);
    await page.getByText(/^Draft autosaved at /).waitFor();
    assert.deepEqual(titles, ["B", "C", "C"], "Failure must not advance the last successful B snapshot to C");
    await page.clock.runFor(15_001);
    assert.deepEqual(titles, ["B", "C", "C"]);
  } finally { release(); await browser.close(); }
});

test("OCT03 BUG126 restoring remote B then reverting to editor A is saved", { timeout: 30_000 }, async () => {
  const titles: string[] = [];
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/users/me/drafts/oct03draft") return { data: { draftKey: "community:news:oct03edit", payload: payload("remote B"), updatedAt } };
    if (request.path === "/api/v1/users/me/drafts" && request.method === "POST") {
      titles.push(JSON.parse(request.body).payload.title);
      return { data: { updatedAt } };
    }
    return providers(request);
  });
  try {
    const { page } = browser;
    await startEditing(page, "?draft=oct03draft");
    await page.getByText("Draft restored", { exact: true }).waitFor();
    const title = page.getByLabel("Title", { exact: true });
    assert.equal(await title.inputValue(), "remote B");
    await title.fill("A");
    await autosaveTick(page);
    assert.deepEqual(titles, ["A"]);
  } finally { await browser.close(); }
});

for (const sameActor of [false, true]) test(`OCT03 BUG126 a late restore cannot overwrite a ${sameActor ? "new session of the same actor" : "new actor"} or release its restore guard`, { timeout: 30_000 }, async () => {
  let actor = "actor-a";
  let restores = 0;
  let releaseA: () => void = () => {};
  const delayedA = new Promise<void>(resolve => { releaseA = resolve; });
  let releaseB: () => void = () => {};
  const delayedB = new Promise<void>(resolve => { releaseB = resolve; });
  let startedA: () => void = () => {};
  const requestA = new Promise<void>(resolve => { startedA = resolve; });
  let startedB: () => void = () => {};
  const requestB = new Promise<void>(resolve => { startedB = resolve; });
  const titles: string[] = [];
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/auth/me") return { data: { id: actor, username: actor, email: `${actor}@example.invalid`, roleCodes: [], permissionRules: [{ code: "*", allow: true, priority: 100 }] } };
    if (request.path === "/api/v1/users/me/drafts/oct03draft") {
      restores++;
      if (restores === 1) { startedA(); await delayedA; return { data: { draftKey: "community:news:oct03edit", payload: payload("Private old session draft"), updatedAt } }; }
      startedB(); await delayedB;
      return sameActor
        ? { status: 503, code: "DRAFT_TEST_UNAVAILABLE", error: "Synthetic new-session restore failure" }
        : { status: 403, code: "FORBIDDEN", error: "Draft belongs to another actor" };
    }
    if (request.path === "/api/v1/users/me/drafts" && request.method === "POST") { titles.push(JSON.parse(request.body).payload.title); return { data: { updatedAt } }; }
    return providers(request);
  });
  try {
    const { page } = browser;
    await startEditing(page, "?draft=oct03draft");
    await requestA;
    if (sameActor) {
      await page.evaluate(() => window.dispatchEvent(new Event("mcmods-auth-expired")));
      await page.getByLabel("Title", { exact: true }).waitFor({ state: "hidden" });
    } else actor = "actor-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor-b" })));
    await requestB;
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("Actor B unsaved input");
    releaseA();
    await page.clock.runFor(15_001);
    assert.deepEqual(titles, [], "Old restore finally must not release the new editor's active restore guard");
    assert.equal(await title.inputValue(), "Actor B unsaved input");
    releaseB();
    await page.getByText("Draft autosave failed", { exact: true }).waitFor();
    await autosaveTick(page);
    assert.deepEqual(titles, ["Actor B unsaved input"]);
    assert.equal(await title.inputValue(), "Actor B unsaved input");
    assert.notEqual(await title.inputValue(), "Private old session draft");
  } finally { releaseA(); releaseB(); await browser.close(); }
});
