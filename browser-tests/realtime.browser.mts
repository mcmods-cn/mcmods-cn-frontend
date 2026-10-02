import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

type ControlledSource = EventTarget & {
  closed: boolean;
  onerror: ((event: Event) => void) | null;
};
declare global {
  interface Window {
    __test023: { sources: ControlledSource[]; aborted: string[]; visibility: DocumentVisibilityState };
  }
}

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

// These are explicit transport substitutes, not copies of any React component.
// Every assertion runs against the production SiteShell and MessagesCenter.
async function controlEventSource(page: Page, uncooperativeConversation = "") {
  await page.addInitScript(({ uncooperativeConversation }) => {
    window.__test023 = { sources: [], aborted: [], visibility: "visible" };
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__test023.visibility });
    class ControlledEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      closed = false;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readonly url: string;
      readonly options?: EventSourceInit;
      constructor(url: string, options?: EventSourceInit) {
        super();
        this.url = url;
        this.options = options;
        if (!url.endsWith("/api/v1/realtime/events") || !options?.withCredentials) throw new Error("Unexpected EventSource contract");
        window.__test023.sources.push(this);
        queueMicrotask(() => { if (!this.closed) this.onopen?.(new Event("open")); });
      }
      close() { this.closed = true; this.readyState = ControlledEventSource.CLOSED; }
    }
    Object.defineProperty(window, "EventSource", { value: ControlledEventSource, configurable: true });
    if (uncooperativeConversation) {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes(`/messages/conversations/${uncooperativeConversation}?`)) {
          init?.signal?.addEventListener("abort", () => window.__test023.aborted.push(url), { once: true });
          // Model an already-dispatched, uncooperative transport completing
          // after cancellation. The actual request-version guards must hold.
          const options = { ...init };
          delete options.signal;
          return nativeFetch(input, options);
        }
        return nativeFetch(input, init);
      };
    }
  }, { uncooperativeConversation });
}

async function emit(page: Page, events: Array<{ id: string; type: string; data: unknown }>) {
  await page.evaluate(events => {
    const source = window.__test023.sources.findLast(source => !source.closed);
    if (!source) throw new Error("Expected a live React EventSource");
    for (const event of events) source.dispatchEvent(new MessageEvent(event.type, { data: JSON.stringify(event.data), lastEventId: event.id }));
  }, events);
}

async function settledFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

const timestamp = "2026-10-01T00:00:00Z";
const conversations = ["a", "b"].map(name => ({
  id: `conv-${name}`, partnerId: `partner-${name}`, username: `Partner ${name.toUpperCase()}`,
  avatarUrl: "", onlineStatus: "offline", lastMessage: "Preview only", unreadCount: 0, canMessage: true,
}));
const pageOf = (items: unknown[], limit = 100) => ({ items, limit, hasMore: false, nextCursor: "" });
const message = (id: string, conversationId: string, body: string) => ({ id, conversationId, body, senderId: "partner-b", recipientId: "test048u1", createdAt: timestamp });

test("TEST023 actual React clears A and its draft, aborts A, and rejects a late A body after switching to B", { timeout: 30_000 }, async () => {
  let callsA = 0;
  const callsB: string[] = [];
  const requests: string[] = [];
  const lateA = Promise.withResolvers<APIReply>();
  const aStarted = Promise.withResolvers<void>();
  const browser = await fixture.page(({ path, method, url }) => {
    requests.push(`${method} ${url.pathname}${url.search}`);
    if (path === "/api/v1/notifications") return { data: pageOf([], 50) };
    if (path === "/api/v1/messages/conversations") return { data: pageOf(conversations, 30) };
    if (method === "PUT" && path.endsWith("/presence")) return { data: { online: true } };
    if (path.endsWith("/conv-a") && method === "GET") {
      callsA++;
      if (callsA === 1) return { data: pageOf([message("a1", "conv-a", "A private body")]) };
      aStarted.resolve();
      return lateA.promise;
    }
    if (path.endsWith("/conv-b") && method === "GET") {
      callsB.push(url.search);
      return { data: pageOf([message("b1", "conv-b", "B private body")]) };
    }
  });
  const { page } = browser;
  if (process.env.MCMODS_BROWSER_TRACE) await page.context().tracing.start({ snapshots: true, sources: true });
  try {
    await controlEventSource(page, "conv-a");
    await page.goto(`${fixture.origin}/messages`);
    await page.getByRole("button", { name: "Private chats", exact: true }).click();
    await page.getByRole("button", { name: /Partner A/ }).click();
    await page.getByText("A private body", { exact: true }).waitFor();
    await page.getByPlaceholder("Write a private message").fill("A unsent draft");
    await emit(page, [{ id: "late-a", type: "message.created", data: { conversationId: "conv-a" } }]);
    await aStarted.promise;
    await page.getByRole("button", { name: /Partner B/ }).click();
    assert.equal(await page.getByText("A private body", { exact: true }).count(), 0);
    await page.getByText("B private body", { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder("Write a private message").inputValue(), "");
    assert.equal(await page.evaluate(() => window.__test023.aborted.length), 1);
    const response = page.waitForResponse(response => response.url().includes("/conv-a?") && response.url().includes("after=a1"));
    lateA.resolve({ data: pageOf([message("a2", "conv-a", "Late A secret must never show")]) });
    await (await response).finished();
    await settledFrames(page);
    assert.equal(await page.getByText("Late A secret must never show", { exact: true }).count(), 0);
    assert.equal(await page.getByText("B private body", { exact: true }).count(), 1);
    assert.deepEqual(callsB, ["?limit=100"]);
    assert.equal(callsA, 2);
  } catch (error) {
    console.error("TEST023 failed conversation navigation diagnostic", { callsA, callsB, requests, url: page.url() });
    if (process.env.MCMODS_BROWSER_TRACE) await page.context().tracing.stop({ path: process.env.MCMODS_BROWSER_TRACE });
    throw error;
  } finally {
    lateA.resolve({ data: pageOf([]) });
    await browser.close();
  }
});

test("TEST023 actual shell and message center deduplicate echoes and refresh only the affected queries", { timeout: 30_000 }, async () => {
  const calls = { conversations: 0, b: 0, unread: 0, notifications: 0 };
  const browser = await fixture.page(({ path, method, url }) => {
    if (path === "/api/v1/me/unread-summary") { calls.unread++; return { data: { total: 0, notifications: 0 } }; }
    if (path === "/api/v1/notifications") { calls.notifications++; return { data: pageOf([], 50) }; }
    if (path === "/api/v1/messages/conversations") { calls.conversations++; return { data: pageOf(conversations, 30) }; }
    if (method === "PUT" && path.endsWith("/presence")) return { data: { online: true } };
    if (path.endsWith("/conv-b") && method === "GET") {
      calls.b++;
      return { data: pageOf([message(url.searchParams.has("after") ? "b2" : "b1", "conv-b", url.searchParams.has("after") ? "B realtime arrival" : "B initial message")]) };
    }
  });
  const { page } = browser;
  try {
    await controlEventSource(page);
    await page.goto(`${fixture.origin}/messages`);
    await page.getByRole("button", { name: "Private chats", exact: true }).click();
    await page.getByRole("button", { name: /Partner B/ }).click();
    await page.getByText("B initial message", { exact: true }).waitFor();
    await settledFrames(page);
    const before = { ...calls };
    await emit(page, Array.from({ length: 3 }, () => ({ id: "same-message-event", type: "message.created", data: { conversationId: "conv-b" } })));
    await page.getByText("B realtime arrival", { exact: true }).waitFor();
    await settledFrames(page);
    assert.deepEqual(calls, { ...before, b: before.b + 1, conversations: before.conversations + 1 });
    const refreshed = { ...calls };
    const unreadResponse = page.waitForResponse(response => response.url().includes("/me/unread-summary"));
    await emit(page, [{ id: "other-conversation-event", type: "message.created", data: { conversationId: "conv-a" } }]);
    await (await unreadResponse).finished();
    await settledFrames(page);
    assert.deepEqual(calls, { ...refreshed, unread: refreshed.unread + 1, conversations: refreshed.conversations + 1 });
  } finally { await browser.close(); }
});

test("TEST023 actual notification view loads one AI balance before any translation and shares unread refresh", { timeout: 30_000 }, async () => {
  const calls = { balance: 0, unread: 0, notifications: 0, translate: 0 };
  let ready = false;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/me/unread-summary") { calls.unread++; return { data: { total: 0, notifications: 0 } }; }
    if (path === "/api/v1/messages/conversations") return { data: pageOf([], 30) };
    if (path === "/api/v1/notifications") {
      calls.notifications++;
      return { data: pageOf(ready ? [{ id: "n1", kind: "system", title: "A translatable notice", body: "Notice body", sourceLocale: "zh-CN", read: true, data: {}, actors: [], createdAt: timestamp, updatedAt: timestamp, translationAllowed: true }] : [], 50) };
    }
    if (path === "/api/v1/notifications/ai-balance") {
      calls.balance++;
      return { data: { usedTokens: 75, reservedTokens: 25, limitTokens: 1000, remainingTokens: 900, unlimited: false } };
    }
    if (method === "POST" && path.endsWith("/translate")) { calls.translate++; return { status: 500, error: "No translation was authorized by this test" }; }
  });
  const { page } = browser;
  try {
    await controlEventSource(page);
    await page.goto(`${fixture.origin}/messages`);
    await page.getByText("No notifications in this category.", { exact: true }).waitFor();
    await settledFrames(page);
    assert.equal(calls.balance, 0);
    const before = { ...calls };
    ready = true;
    await emit(page, [1, 2].map(() => ({ id: "same-notice-event", type: "notification.created", data: { kind: "system" } })));
    await page.getByText("Today's AI token balance", { exact: true }).waitFor();
    await page.getByText("900", { exact: true }).waitFor();
    await settledFrames(page);
    assert.deepEqual(calls, { balance: 1, unread: before.unread + 1, notifications: before.notifications + 1, translate: 0 });
    await emit(page, [{ id: "unrelated-notice-event", type: "notification.created", data: { kind: "review" } }]);
    await settledFrames(page);
    assert.equal(calls.balance, 1);
    assert.equal(calls.notifications, before.notifications + 1);
    assert.equal(calls.translate, 0);
  } finally { await browser.close(); }
});

test("TEST023 actual realtime lifecycle closes on error/hidden/logout and cancels delayed reconnect", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/notifications") return { data: pageOf([], 50) };
    if (path === "/api/v1/messages/conversations") return { data: pageOf([], 30) };
  });
  const { page } = browser;
  try {
    await page.clock.install();
    await controlEventSource(page);
    await page.goto(`${fixture.origin}/messages`);
    await page.getByText("No notifications in this category.", { exact: true }).waitFor();
    await page.waitForFunction(() => window.__test023.sources.length === 1);
    await page.evaluate(() => window.__test023.sources[0].onerror?.(new Event("error")));
    assert.equal(await page.evaluate(() => window.__test023.sources[0].closed), true);
    await page.clock.fastForward(2100);
    await page.waitForFunction(() => window.__test023.sources.length === 2);
    await page.evaluate(() => { window.__test023.visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    assert.equal(await page.evaluate(() => window.__test023.sources.every(source => source.closed)), true);
    await page.evaluate(() => { window.__test023.visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForFunction(() => window.__test023.sources.length === 3);
    await page.evaluate(() => {
      window.__test023.sources[2].onerror?.(new Event("error"));
      window.dispatchEvent(new Event("mcmods-auth-expired"));
    });
    await page.getByText("Log in to view the message center.", { exact: true }).waitFor();
    await page.clock.fastForward(30_000);
    assert.equal(await page.evaluate(() => window.__test023.sources.length), 3);
    assert.equal(await page.evaluate(() => window.__test023.sources.every(source => source.closed)), true);
  } finally { await browser.close(); }
});
