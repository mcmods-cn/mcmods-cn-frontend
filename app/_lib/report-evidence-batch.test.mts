import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { processEvidenceUploadBatch } from "./report-evidence-batch.ts";

const dialog = readFileSync(new URL("../_components/unified-report-dialog.tsx", import.meta.url), "utf8");

test("evidence batches publish each success immediately and continue after a failure", async () => {
  const events: string[] = [];
  const result = await processEvidenceUploadBatch(
    [{ name: "one.log" }, { name: "two.log" }, { name: "three.log" }],
    async (file) => {
      if (file.name === "two.log") throw new Error("rejected");
      return { id: file.name };
    },
    (value) => events.push(`success:${value.id}`),
    (file) => events.push(`failure:${file.name}`),
  );

  assert.deepEqual(events, ["success:one.log", "failure:two.log", "success:three.log"]);
  assert.deepEqual(result.successes.map((item) => item.id), ["one.log", "three.log"]);
  assert.deepEqual(result.failures.map((item) => item.file.name), ["two.log"]);
});

test("the report dialog commits successes per file and renders structured failures", () => {
  assert.match(dialog, /processEvidenceUploadBatch\(files/);
  assert.match(dialog, /setEvidence\(\(current\)\s*=>\s*current\.some/);
  assert.match(dialog, /setEvidenceFailures\(\(current\)\s*=>\s*\[\.\.\.current/);
  assert.match(dialog, /evidenceFailures\.map/);
  assert.doesNotMatch(dialog, /const uploaded:\s*UploadedEvidence\[\]/);
});

test("leaving an evidence batch keeps completed files and starts no new upload after cancellation", async () => {
  const controller = new AbortController();
  const started: number[] = [];
  const published: number[] = [];
  const failed: number[] = [];
  const result = await processEvidenceUploadBatch([1, 2, 3], async item => {
    started.push(item);
    if (item === 2) controller.abort();
    return item;
  }, item => published.push(item), item => failed.push(item), controller.signal);
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(published, [1]);
  assert.deepEqual(failed, []);
  assert.deepEqual(result, { successes: [1], failures: [] });
});
