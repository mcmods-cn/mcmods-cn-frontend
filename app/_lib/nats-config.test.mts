import assert from "node:assert/strict";
import test from "node:test";

import { buildNATSUpdatePayload, type NATSConfig } from "./nats-config.mts";

test("NATS update payload always includes reliability settings and explicit secret actions", () => {
  const draft: NATSConfig = {
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
    enabled: true,
    url: "nats://127.0.0.1:4222",
    username: "worker",
    password: "",
    clearPassword: true,
    token: "replacement",
    clearToken: false,
    subjectPrefix: "mcmods",
    tasks: draft.tasks,
    outboxEnabled: false,
    realtime: true,
    jetStream: draft.jetStream,
  });
});
