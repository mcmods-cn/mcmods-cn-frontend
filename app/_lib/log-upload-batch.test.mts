import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLogUploadTasks, processLogUploadBatch } from "./log-upload-batch.mts";

type TestFile = { name: string; key: string };

function tasks(...names: string[]) {
  return createLogUploadTasks<TestFile>(names.map((name) => ({ name, key: name })), (file) => file.key, 10);
}

test("the whole batch is locally classified before any upload starts", async () => {
  const snapshots: Array<Array<[string, string]>> = [];
  const result = await processLogUploadBatch(tasks("good.log", "bad.jar", "also.txt"), {
    upload: async (file) => ({ id: `file-${file.key}` }),
    createShares: async (fileIds) => ({ items: fileIds.map((fileId) => ({ fileId, publicCode: `share-${fileId}`, status: "ready" })) }),
    onChange: (items) => snapshots.push(items.map((item) => [item.file.name, item.stage])),
  });
  assert.deepEqual(snapshots[0], [["good.log", "pending"], ["bad.jar", "invalid"], ["also.txt", "pending"]]);
  assert.deepEqual(result.map((item) => item.stage), ["ready", "invalid", "ready"]);
});

test("one upload failure cannot hide or block successful siblings", async () => {
  const created: string[][] = [];
  const result = await processLogUploadBatch(tasks("first.log", "broken.log", "last.zip"), {
    upload: async (file) => {
      if (file.name === "broken.log") throw new Error("quota exhausted");
      return { id: `file-${file.key}` };
    },
    createShares: async (fileIds) => {
      created.push(fileIds);
      return { items: fileIds.map((fileId) => ({ fileId, publicCode: `share-${fileId}`, status: "ready" })) };
    },
  });
  assert.deepEqual(created, [["file-first.log", "file-last.zip"]]);
  assert.deepEqual(result.map((item) => [item.stage, item.uploadedFileId, item.error]), [
    ["ready", "file-first.log", ""],
    ["failed", "", "quota exhausted"],
    ["ready", "file-last.zip", ""],
  ]);
});

test("a failed share request retains uploaded IDs and retry never uploads twice", async () => {
  let uploads = 0;
  let createAttempts = 0;
  const options = {
    upload: async (file: TestFile) => { uploads++; return { id: `file-${file.key}` }; },
    createShares: async (fileIds: string[]) => {
      createAttempts++;
      if (createAttempts === 1) throw new Error("gateway unavailable");
      return { items: fileIds.map((fileId) => ({ fileId, publicCode: `share-${fileId}`, status: "ready" })) };
    },
  };
  const failed = await processLogUploadBatch(tasks("one.log", "two.txt"), options);
  assert.deepEqual(failed.map((item) => [item.stage, item.uploadedFileId]), [
    ["failed", "file-one.log"], ["failed", "file-two.txt"],
  ]);
  const retried = await processLogUploadBatch(failed, options);
  assert.equal(uploads, 2);
  assert.deepEqual(retried.map((item) => item.stage), ["ready", "ready"]);
});

test("per-item backend failure remains retryable without changing successful results", async () => {
  const initial = await processLogUploadBatch(tasks("one.log", "two.log"), {
    upload: async (file) => ({ id: `file-${file.key}` }),
    createShares: async (fileIds) => ({ items: fileIds.map((fileId) => fileId.endsWith("two.log")
      ? { fileId, status: "failed", error: "unsafe archive" }
      : { fileId, publicCode: "share-one", status: "ready" }) }),
  });
  assert.deepEqual(initial.map((item) => [item.stage, item.error]), [["ready", ""], ["failed", "unsafe archive"]]);
  let uploads = 0;
  const retried = await processLogUploadBatch(initial, {
    upload: async () => { uploads++; return { id: "unexpected" }; },
    createShares: async (fileIds) => ({ items: fileIds.map((fileId) => ({ fileId, publicCode: "share-two", status: "ready" })) }),
  });
  assert.equal(uploads, 0);
  assert.deepEqual(retried.map((item) => item.stage), ["ready", "ready"]);
});

test("the log tool renders stable per-file task facts through the shared boundary", async () => {
  const source = await readFile(new URL("../_components/log-share-tool.tsx", import.meta.url), "utf8");
  assert.match(source, /processLogUploadBatch/);
  assert.match(source, /LogUploadTask/);
  assert.match(source, /uploadedFileId/);
  assert.match(source, /task\.stage/);
  assert.doesNotMatch(source, /for \(const file of files\)[\s\S]{0,400}throw new Error/);
});

test("local upload and share failures use the caller's localized messages", async () => {
  const messages = { unsupportedFile: (name: string) => `Unsupported: ${name}`, missingUploadID: "Missing uploaded ID", missingResult: "Missing share", failed: "Share failed", invalidStatus: "Invalid share status" };
  const result = await processLogUploadBatch(tasks("bad.jar", "noid.log", "missing.log", "failed.log", "invalid.log"), {
    messages,
    upload: async (file) => ({ id: file.name === "noid.log" ? "" : file.name }),
    createShares: async () => ({ items: [{ fileId: "failed.log", status: "failed" }, { fileId: "invalid.log", status: "unknown" }] }),
  });
  assert.deepEqual(result.map((item) => item.error), ["Unsupported: bad.jar", "Missing uploaded ID", "Missing share", "Share failed", "Invalid share status"]);
});
