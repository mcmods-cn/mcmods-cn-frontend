import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createOSSUploadBatchTasks,
  processOSSUploadBatch,
} from "./oss-upload-batch.mts";

type TestFile = {
  key: string;
  lastModified: number;
  name: string;
  size: number;
  type: string;
};

function file(key: string, type = "image/png"): TestFile {
  return { key, lastModified: 1, name: `${key}.png`, size: 100, type };
}

function tasks(files: TestFile[], capacity = files.length) {
  return createOSSUploadBatchTasks(files, {
    capacity,
    identity: (item) => item.key,
    validate: (item) => item.type.startsWith("image/") ? "" : "images only",
    capacityError: "gallery full",
  });
}

test("the complete local classification is published before the first OSS request", async () => {
  const snapshots: string[][] = [];
  let initialSnapshotSeen = false;
  const result = await processOSSUploadBatch(tasks([
    file("first"),
    file("bad", "application/zip"),
    file("second"),
    file("overflow"),
  ], 2), {
    upload: async (item) => {
      assert.equal(initialSnapshotSeen, true);
      return { id: `stored-${item.key}` };
    },
    onChange: (items) => {
      snapshots.push(items.map((item) => item.stage));
      initialSnapshotSeen ||= snapshots.length === 1;
    },
  });

  assert.deepEqual(snapshots[0], ["pending", "invalid", "pending", "invalid"]);
  assert.deepEqual(result.map((item) => [item.stage, item.error]), [
    ["uploaded", ""],
    ["invalid", "images only"],
    ["uploaded", ""],
    ["invalid", "gallery full"],
  ]);
});

test("each successful file ID becomes observable immediately and failed siblings do not hide it", async () => {
  const events: string[] = [];
  const result = await processOSSUploadBatch(tasks([file("first"), file("broken"), file("last")]), {
    upload: async (item) => {
      events.push(`start:${item.key}`);
      if (item.key === "broken") throw new Error("quota exhausted");
      return { id: `stored-${item.key}` };
    },
    onUploaded: (task, record) => events.push(`commit:${task.key}:${record.id}`),
  });

  assert.deepEqual(events, [
    "start:first",
    "commit:first:stored-first",
    "start:broken",
    "start:last",
    "commit:last:stored-last",
  ]);
  assert.deepEqual(result.map((item) => [item.stage, item.uploadedFileId]), [
    ["uploaded", "stored-first"],
    ["failed", ""],
    ["uploaded", "stored-last"],
  ]);
});

test("retry uploads only failed items and retains successful records", async () => {
  let brokenAttempts = 0;
  let successfulUploads = 0;
  const initial = await processOSSUploadBatch(tasks([file("small"), file("large")]), {
    upload: async (item) => {
      if (item.key === "large" && brokenAttempts++ === 0) throw new Error("network reset");
      successfulUploads += 1;
      return { id: `stored-${item.key}`, rendition: item.key };
    },
  });
  assert.deepEqual(initial.map((item) => item.stage), ["uploaded", "failed"]);

  const retried = await processOSSUploadBatch(initial, {
    upload: async (item) => {
      if (item.key === "small") throw new Error("successful item uploaded twice");
      successfulUploads += 1;
      return { id: `stored-${item.key}`, rendition: item.key };
    },
  });
  assert.equal(successfulUploads, 2);
  assert.deepEqual(retried.map((item) => [item.stage, item.uploadedFileId, item.result?.rendition]), [
    ["uploaded", "stored-small", "small"],
    ["uploaded", "stored-large", "large"],
  ]);
});

test("all affected editors use the shared per-file status boundary", async () => {
  const names = [
    "simple-project-editor.tsx",
    "modpack-editor.tsx",
    "mod-editor.tsx",
    "mod-content-resource-editor.tsx",
  ];
  for (const name of names) {
    const source = await readFile(new URL(`../_components/${name}`, import.meta.url), "utf8");
    assert.match(source, /processOSSUploadBatch/);
    assert.match(source, /OSSUploadBatchStatus/);
    assert.match(source, /onUploaded/);
  }

  const simple = await readFile(new URL("../_components/simple-project-editor.tsx", import.meta.url), "utf8");
  const modpack = await readFile(new URL("../_components/modpack-editor.tsx", import.meta.url), "utf8");
  const mod = await readFile(new URL("../_components/mod-editor.tsx", import.meta.url), "utf8");
  const resource = await readFile(new URL("../_components/mod-content-resource-editor.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(simple, /Promise\.all\([\s\S]{0,500}uploadUserFileToOSS/);
  assert.doesNotMatch(resource, /Promise\.all\(\[\s*uploadUserFileToOSS/);
  assert.match(modpack, /galleryImages\.some\(\(image\) => image\.fileId === record\.id\)/);
  assert.match(mod, /galleryImages\.some\(\(image\) => image\.fileId === record\.id\)/);
  assert.match(simple, /galleryImages\.some\(\(image\) => image\.fileId === record\.id\)/);
  assert.match(resource, /setIconSmallFilePublicId\(record\.id\)/);
  assert.match(resource, /setIconFilePublicId\(record\.id\)/);

  const status = await readFile(new URL("../_components/oss-upload-batch-status.tsx", import.meta.url), "utf8");
  assert.match(status, /task\.uploadedFileId/);
  assert.match(status, /task\.error/);
  assert.match(status, /task\.stage === "failed"/);
  assert.match(status, /onRetry\(task\.key\)/);
});
