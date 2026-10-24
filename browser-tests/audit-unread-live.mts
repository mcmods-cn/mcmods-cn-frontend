import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserContext } from "playwright";

async function waitForJSON(path: string, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, "utf8")); }
    catch (error) { if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await delay(20);
  }
  throw new Error("Owned actual-response barrier did not reach its declared observation point");
}

test("MSG-R01 actual PostgreSQL A/B summaries and native cross-tab switching survive a delayed unmodified A response", { timeout: 90_000 }, async () => {
  const runtimePath = process.env.MCMODS_AUDIT_JOURNEY_RUNTIME;
  assert(runtimePath, "Set the owned live fixture runtime JSON");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  const directory = resolve(dirname(runtimePath));
  const barrier = runtime.unreadBarrier;
  assert(barrier, "Start the owned fixture with MCMODS_AUDIT_UNREAD_BARRIER=1; no synthetic API fallback is used");
  const owned = (path: string) => { const absolute = resolve(path); assert(absolute.startsWith(`${directory}/`), "Only this fixture's control files are writable"); return absolute; };
  const armPath = owned(barrier.armPath);
  const startedPath = owned(barrier.startedPath);
  const releasePath = owned(barrier.releasePath);
  assert.equal(await stat(startedPath).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return false; }), false, "Use a fresh owned barrier fixture; earlier evidence is retained");
  const auth = JSON.parse(await readFile(owned(runtime.authPath), "utf8"));
  const api = new URL(runtime.apiOrigin);
  const frontend = new URL(runtime.frontendOrigin);
  for (const url of [api, frontend]) assert(url.hostname === "127.0.0.1" && url.protocol === "http:" && !url.username && !url.password && url.pathname === "/");
  const runId = String(Date.now());
  const report: Record<string, unknown> = { caseId: "MSG-R01-LIVE", runId, status: "IN_PROGRESS", startedAt: new Date().toISOString(), scope: "Real Next frontend, actual API authentication and PostgreSQL summaries; server-side test transport buffers the actual handler response and writes its original bytes after a controlled release. No API response is fabricated.", runtimeRevisions: runtime.repoRevisions, milestones: [] };
  const milestones = report.milestones as unknown[];
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  let armed = false;
  const sessionCookie = (token: string) => ({ name: "mcmods_session", value: token, url: api.origin, httpOnly: true, sameSite: "Lax" as const });
  async function context(token: string) {
    const result = await browser.newContext({ locale: "en-US", serviceWorkers: "block" });
    contexts.push(result);
    await result.addCookies([sessionCookie(token), { name: "mcmods-ui-locale", value: "en-US", url: frontend.origin }]);
    await result.route(url => ![api.origin, frontend.origin].includes(url.origin), route => route.abort());
    return result;
  }
  async function get(context: BrowserContext, path: string) {
    const response = await context.request.get(`${api.origin}${path}`);
    const result = await response.json();
    assert.equal(response.status(), 200, `${path}: ${result.code || result.error || "unexpected status"}`);
    return result.data;
  }
  try {
    const main = await context(auth.creatorToken);
    const preflightB = await context(auth.otherEditorToken);
    const [actorA, actorB, unreadA, unreadB, noticesA, conversationsA, conversationsB] = await Promise.all([
      get(main, "/api/v1/auth/me"), get(preflightB, "/api/v1/auth/me"), get(main, "/api/v1/me/unread-summary"), get(preflightB, "/api/v1/me/unread-summary"), get(main, "/api/v1/notifications?kind=system"), get(main, "/api/v1/messages/conversations?limit=30"), get(preflightB, "/api/v1/messages/conversations?limit=30"),
    ]);
    assert.equal(actorA.id, barrier.actorAPublicId);
    assert.equal(actorB.id, barrier.actorBPublicId);
    assert.notEqual(actorA.id, actorB.id);
    assert(Number(unreadA.notifications) > 0);
    assert.equal(Number(unreadB.notifications), 0);
    report.actors = { actorA: actorA.id, actorB: actorB.id };
    report.actualPreflight = { unreadA, unreadB, notificationAIds: noticesA.items.map((item: { id: string }) => item.id), conversationAIds: conversationsA.items.map((item: { id: string }) => item.id), conversationBIds: conversationsB.items.map((item: { id: string }) => item.id) };
    await preflightB.close();
    const page = await main.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", error => errors.push(error.message));
    await writeFile(armPath, runId);
    armed = true;
    await page.goto(`${frontend.origin}/messages`);
    const actualBarrier = await waitForJSON(startedPath);
    assert.equal(actualBarrier.status, 200);
    assert(Number(actualBarrier.actualCounts.notifications) > 0);
    report.actualBarrier = actualBarrier;
    milestones.push({ stage: "actual_A_handler_and_database_response_buffered", time: new Date().toISOString() });
    const switcher = await main.newPage();
    await switcher.goto(`${frontend.origin}/robots.txt`);
    const bSummary = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/me/unread-summary" && response.status() === 200);
    await main.addCookies([sessionCookie(auth.otherEditorToken)]);
    await switcher.evaluate(() => localStorage.setItem("mcmods-auth-sync", `login:${Date.now()}:actual-B`));
    const bResponse = await bSummary;
    const bData = (await bResponse.json()).data;
    assert.equal(Number(bData.notifications), 0);
    await page.getByRole("link", { name: actorB.username, exact: true }).waitFor();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByRole("button", { name: "Mark all as read", exact: true }).isDisabled(), true);
    milestones.push({ stage: "native_second_tab_storage_event_and_real_B_identity_visible", time: new Date().toISOString() });
    const late = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/me/unread-summary");
    await writeFile(releasePath, runId);
    const actualLate = await late;
    assert.equal(actualLate.status(), actualBarrier.status);
    const bytes = await actualLate.body();
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, actualBarrier.bodySha256, "The late browser response must be the exact decoded bytes produced by the real A handler");
    const aData = JSON.parse(bytes.toString()).data;
    assert(Number(aData.notifications) > 0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await page.getByRole("link", { name: actorB.username, exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Mark all as read", exact: true }).isDisabled(), true);
    for (const notice of noticesA.items) assert.equal(await page.getByText(notice.title, { exact: true }).count(), 0, "A's actual notification must not remain visible in B");
    const expectedBadge = Number(bData.total) > 0 ? [Number(bData.total) > 99 ? "99+" : String(bData.total)] : [];
    assert.deepEqual(await page.locator('a[title="Message center"] span').allTextContents(), expectedBadge);
    await page.getByRole("button", { name: "Private chats", exact: true }).click();
    const bPartners = new Set(conversationsB.items.map((item: { partnerId: string }) => item.partnerId));
    for (const conversation of conversationsB.items) await page.getByText(conversation.username, { exact: true }).waitFor();
    for (const conversation of conversationsA.items) if (!bPartners.has(conversation.partnerId)) assert.equal(await page.getByText(conversation.username, { exact: true }).count(), 0);
    assert.equal((await get(main, "/api/v1/auth/me")).id, actorB.id);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(directory, `unread-live-${runId}.png`), fullPage: true });
    report.lateActualSummary = aData;
    report.currentActualSummary = bData;
    report.lateDecodedBodySha256 = digest;
    report.status = "NOT_REPRODUCED_IN_ACTUAL_A_B_TRANSPORT_BARRIER";
    report.limitations = conversationsA.items.length === 0 ? ["Distinct private message bodies were not seeded; conversation isolation was checked against the actual returned lists. This does not exclude all cross-account asynchronous risks."] : ["Evidence applies to these actual actors, transport schedule and returned conversation/notification data, not all future asynchronous flows."];
    milestones.push({ stage: "unmodified_late_A_bytes_delivered_B_summary_and_content_unchanged", time: new Date().toISOString() });
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    if (armed) await writeFile(releasePath, runId);
    report.finishedAt = new Date().toISOString();
    report.reactErrors = errors;
    const path = join(directory, `unread-browser-${runId}.json`);
    await writeFile(path, JSON.stringify(report, null, 2));
    await writeFile(join(directory, "unread-browser-latest.json"), JSON.stringify({ runId, path, status: report.status }, null, 2));
    for (const context of contexts) await context.close();
    await browser.close();
    console.log("Actual unread barrier evidence saved", path, report.status);
  }
});
