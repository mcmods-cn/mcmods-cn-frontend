import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRealtimeQueryCoordinator,
  realtimeQueryKeys,
} from "./realtime-query-cache.mts";

function controlledScheduler() {
  const pending: Array<() => void> = [];
  return {
    schedule: (callback: () => void) => pending.push(callback),
    flush() {
      const callbacks = pending.splice(0);
      for (const callback of callbacks) callback();
    },
  };
}

test("realtime events invalidate only their precise query keys once per tick", () => {
  const scheduler = controlledScheduler();
  const coordinator = createRealtimeQueryCoordinator({ schedule: scheduler.schedule });
  const userID = "user-1";
  const conversationID = "conversation-1";
  const counts = { unread: 0, conversations: 0, messages: 0, otherMessages: 0, system: 0, review: 0 };

  coordinator.subscribe(realtimeQueryKeys.unreadSummary(userID), () => { counts.unread++; });
  coordinator.subscribe(realtimeQueryKeys.conversations(userID), () => { counts.conversations++; });
  coordinator.subscribe(realtimeQueryKeys.notifications(userID, "system"), () => { counts.system++; });
  coordinator.subscribe(realtimeQueryKeys.notifications(userID, "review"), () => { counts.review++; });

  coordinator.routeRealtimeEvent(userID, {
    type: "message.created",
    data: { conversationId: conversationID, messageId: "message-1" },
  });
  coordinator.routeRealtimeEvent(userID, {
    type: "message.created",
    data: { conversationId: conversationID, messageId: "message-1" },
  });
  scheduler.flush();

  assert.deepEqual(counts, { unread: 1, conversations: 1, messages: 0, otherMessages: 0, system: 0, review: 0 });

  coordinator.subscribe(realtimeQueryKeys.messages(userID, conversationID), () => { counts.messages++; });
  coordinator.subscribe(realtimeQueryKeys.messages(userID, "conversation-2"), () => { counts.otherMessages++; });
  coordinator.routeRealtimeEvent(userID, {
    type: "message.created",
    data: { conversationId: conversationID, messageId: "message-2" },
  });
  scheduler.flush();

  assert.deepEqual(counts, { unread: 1, conversations: 2, messages: 1, otherMessages: 0, system: 0, review: 0 });

  coordinator.routeRealtimeEvent(userID, { type: "unread.changed", data: { kind: "messages" } });
  coordinator.routeRealtimeEvent(userID, { type: "unread.changed", data: { kind: "messages" } });
  coordinator.routeRealtimeEvent(userID, { type: "notification.created", data: { kind: "system" } });
  coordinator.routeRealtimeEvent(userID, { type: "notification.created", data: { kind: "system" } });
  scheduler.flush();

  assert.deepEqual(counts, { unread: 2, conversations: 2, messages: 1, otherMessages: 0, system: 1, review: 0 });
});

test("query reads share one in-flight request and discard an invalidated response", async () => {
  const coordinator = createRealtimeQueryCoordinator();
  const key = realtimeQueryKeys.unreadSummary("user-1");
  let loads = 0;
  let resolveOld!: (value: { total: number }) => void;
  let resolveFresh!: (value: { total: number }) => void;

  const oldLoader = () => {
    loads++;
    return new Promise<{ total: number }>((resolve) => { resolveOld = resolve; });
  };
  const oldRead = coordinator.readQuery(key, oldLoader, { maxAgeMs: 1_000 });
  const joinedRead = coordinator.readQuery(key, oldLoader, { maxAgeMs: 1_000 });
  assert.equal(loads, 1);

  coordinator.invalidate(key);
  const freshRead = coordinator.readQuery(key, () => {
    loads++;
    return new Promise<{ total: number }>((resolve) => { resolveFresh = resolve; });
  }, { maxAgeMs: 1_000 });
  assert.equal(loads, 2);

  resolveOld({ total: 1 });
  resolveFresh({ total: 2 });
  assert.deepEqual(await Promise.all([oldRead, joinedRead, freshRead]), [
    { total: 2 },
    { total: 2 },
    { total: 2 },
  ]);

  const cached = await coordinator.readQuery(key, async () => {
    loads++;
    return { total: 3 };
  }, { maxAgeMs: 1_000 });
  assert.deepEqual(cached, { total: 2 });
  assert.equal(loads, 2);
});

test("an event storm produces one request per affected query instead of per listener", async () => {
  const scheduler = controlledScheduler();
  const coordinator = createRealtimeQueryCoordinator({ schedule: scheduler.schedule });
  const userID = "user-1";
  const conversationID = "conversation-1";
  const unreadKey = realtimeQueryKeys.unreadSummary(userID);
  const pending: Array<Promise<unknown>> = [];
  const requests = { unread: 0, conversations: 0, messages: 0, notifications: 0 };
  const loadUnread = () => coordinator.readQuery(unreadKey, async () => {
    requests.unread++;
    return { total: requests.unread };
  }, { maxAgeMs: 1_000 });

  coordinator.subscribe(unreadKey, () => { pending.push(loadUnread()); });
  coordinator.subscribe(unreadKey, () => { pending.push(loadUnread()); });
  coordinator.subscribe(realtimeQueryKeys.conversations(userID), () => {
    pending.push(coordinator.readQuery(realtimeQueryKeys.conversations(userID), async () => {
      requests.conversations++;
      return [];
    }, { maxAgeMs: 1_000 }));
  });
  coordinator.subscribe(realtimeQueryKeys.messages(userID, conversationID), () => { requests.messages++; });
  coordinator.subscribe(realtimeQueryKeys.notifications(userID, "system"), () => { requests.notifications++; });

  for (let index = 0; index < 100; index++) {
    coordinator.routeRealtimeEvent(userID, { type: "message.created", data: { conversationId: conversationID } });
    coordinator.routeRealtimeEvent(userID, { type: "unread.changed", data: { kind: "messages" } });
  }
  scheduler.flush();
  await Promise.all(pending.splice(0));
  assert.deepEqual(requests, { unread: 1, conversations: 1, messages: 1, notifications: 0 });

  for (let index = 0; index < 100; index++) {
    coordinator.routeRealtimeEvent(userID, { type: "notification.created", data: { kind: "system" } });
  }
  scheduler.flush();
  await Promise.all(pending.splice(0));
  assert.deepEqual(requests, { unread: 2, conversations: 1, messages: 1, notifications: 1 });
});

test("site shell and message center consume the coordinator without legacy DOM refresh fan-out", async () => {
  const [shell, center] = await Promise.all([
    readFile(new URL("../_components/site-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /routeRealtimeEvent/);
  assert.match(shell, /readQuery/);
  assert.match(center, /realtimeQueryKeys\.messages/);
  assert.match(center, /realtimeQueryKeys\.notifications/);
  assert.match(center, /realtimeQueryKeys\.conversations/);
  assert.doesNotMatch(shell + center, /mcmods-unread-change|mcmods-realtime/);
});
