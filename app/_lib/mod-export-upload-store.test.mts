import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  modExportUploadTaskKey,
  persistedModExportUploadTaskBelongsToSubject,
  type PersistedModExportUploadTask,
} from "./mod-export-upload-store.ts";

function task(subjectId: string): PersistedModExportUploadTask {
  return {
    key: modExportUploadTaskKey("create", "v00000001", subjectId),
    subjectId,
    siteId: "create",
    targetVersionId: "v00000001",
    overwriteExistingImportData: false,
    phase: "uploading",
    completedPartNumbers: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test("Cookie Session upload keys are derived from the authenticated user snapshot", () => {
  const first = modExportUploadTaskKey("create", "v00000001", "u00000001");
  const second = modExportUploadTaskKey("create", "v00000001", "u00000002");
  assert.notEqual(first, second);
  assert.match(first, /^exporter:u00000001:/);
  assert.throws(() => modExportUploadTaskKey("create", "v00000001", "cookie-session"), /user public ID/);
  assert.throws(() => modExportUploadTaskKey("create", "v00000001", ""), /user public ID/);
});

test("persisted tasks fail closed when the stored subject differs or is missing", () => {
  const first = task("u00000001");
  assert.equal(persistedModExportUploadTaskBelongsToSubject(first, "u00000001"), true);
  assert.equal(persistedModExportUploadTaskBelongsToSubject(first, "u00000002"), false);
  assert.equal(persistedModExportUploadTaskBelongsToSubject({ ...first, subjectId: "" }, "u00000001"), false);
  assert.equal(persistedModExportUploadTaskBelongsToSubject({ ...first, key: first.key.replace("u00000001", "u00000002") }, "u00000001"), false);
});

test("account changes abort recovery and every storage operation carries the subject", async () => {
  const [store, modal, manager, workspace] = await Promise.all([
    readFile(new URL("./mod-export-upload-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-catalog-data.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-content-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-content-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(store, /tokenSubject|split\("\."\)/);
  assert.match(manager, /subjectId=\{user\.id\}/);
  assert.match(workspace, /subjectId=\{subjectId\}/);
  assert.match(modal, /uploading\.current\?\.abort\(\)/);
  assert.match(modal, /polling\.current\?\.abort\(\)/);
  assert.match(modal, /readPersistedModExportUploadTask\(taskKey, subjectId\)/);
  assert.match(modal, /updatePersistedModExportUploadTask\(taskKey, subjectId,/);
  assert.match(modal, /deletePersistedModExportUploadTask\(taskKey, subjectId\)/);
});
