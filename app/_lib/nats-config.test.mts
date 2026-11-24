import assert from "node:assert/strict";
import test from "node:test";

import { buildNATSUpdatePayload, bytesPerMiB, streamCapacityBytes, type NATSConfig } from "./nats-config.mts";

test("NATS update payload always includes reliability settings and explicit secret actions", () => {
  const draft: NATSConfig = {
    revision: "a".repeat(64),
    enabled: true,
    url: "nats://127.0.0.1:4222",
    username: "worker",
    password: "",
    hasPassword: true,
    clearPassword: true,
    token: "replacement",
    hasToken: true,
    clearToken: false,
    subjectPrefix: "mcmods",
    tasks: [{ code: "ai", enabled: true, subject: "ai.tasks", queueGroup: "ai", maxConcurrent: 2, timeoutSeconds: 300 }],
    outboxEnabled: false,
    realtime: true,
    jetStream: { enabled: true, stream: "MCMODS_TASKS", maxDeliver: 8, ackWaitSeconds: 300, publishTimeoutSeconds: 5 },
    status: { enabled: true, connected: true, url: "nats://127.0.0.1:4222", subjectPrefix: "mcmods", tasks: [], jetStream: true },
  };

  assert.deepEqual(buildNATSUpdatePayload(draft), {
    revision: "a".repeat(64),
    enabled: true,
    url: "nats://127.0.0.1:4222",
    username: "worker",
    password: "",
    clearPassword: true,
    token: "replacement",
    clearToken: false,
    subjectPrefix: "mcmods",
    tasks: draft.tasks,
    outboxEnabled: true,
    realtime: true,
    jetStream: draft.jetStream,
  });
  draft.jetStream.newStreamMaxBytes = 256 * bytesPerMiB;
  assert.equal(Object.hasOwn(buildNATSUpdatePayload(draft).jetStream, "newStreamMaxBytes"), false, "untouched budgets retain database precision");
  assert.equal(buildNATSUpdatePayload(draft, streamCapacityBytes("16.5")).jetStream.newStreamMaxBytes, 17_301_504);
  assert.equal(draft.jetStream.newStreamMaxBytes, 268_435_456, "editing a payload must not mutate the last read snapshot");
});

test("stream capacity edits require a positive, exactly representable number of bytes", () => {
  assert.equal(streamCapacityBytes(String(1 / bytesPerMiB)), 1);
  for (const invalid of ["", "0", "-1", "0.1", "Infinity", "1e300", "not a number"]) {
    assert.equal(streamCapacityBytes(invalid), undefined, invalid);
  }
});
