import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { waitForPolledJob } from "./job-polling.mts";

test("polling state machine reports every state and stops on one shared terminal set", async () => {
  const states = ["queued", "importing", "ready"];
  const progress: string[] = [];
  const delays: number[] = [];
  const completed = await waitForPolledJob(
    async () => ({ status: states.shift() ?? "failed" }),
    new Set(["ready", "failed", "cancelled"]),
    (job) => progress.push(job.status),
    undefined,
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.equal(completed.status, "ready");
  assert.deepEqual(progress, ["queued", "importing", "ready"]);
  assert.deepEqual(delays, [1200, 1200]);
});

test("polling state machine rejects an already aborted request before loading", async () => {
  const controller = new AbortController();
  controller.abort();
  let loads = 0;
  await assert.rejects(
    waitForPolledJob(async () => ({ status: ++loads ? "ready" : "queued" }), new Set(["ready"]), () => undefined, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(loads, 0);
});

test("mod export domain entry points share one internal polling implementation", async () => {
  const source = await readFile(new URL("./mod-export-api.ts", import.meta.url), "utf8");
  assert.equal(source.match(/waitForPolledJob\(/g)?.length, 1);
  assert.equal(source.match(/for \(;;\)/g)?.length ?? 0, 0);
  assert.equal(source.match(/confirmation_required", "ready", "partial", "failed", "cancelled/g)?.length, 1);
  assert.equal(source.includes("abortableDelay"), false);
});
