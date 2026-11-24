import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import ts from "typescript";
import type * as Recovery from "../app/_lib/mod-export-upload-store.ts";

test("upload recovery releases its database after persisting multipart checkpoints", { timeout: 20_000 }, async () => {
  const source = await readFile(new URL("../app/_lib/mod-export-upload-store.ts", import.meta.url), "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("https://recovery.test/**", (route) => route.request().url().endsWith("store.js")
      ? route.fulfill({ contentType: "text/javascript", body: script })
      : route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Recovery</title>" }));
    await page.goto("https://recovery.test/");
    const observed = await page.evaluate(async () => {
      const path = "/store.js";
      const store = await import(path) as typeof Recovery;
      const subject = "u00000001";
      const key = store.modExportUploadTaskKey("fixture", "v00000001", subject);
      await store.createPersistedModExportUploadTask({
        key, subjectId: subject, siteId: "fixture", targetVersionId: "v00000001",
        overwriteExistingImportData: false, phase: "uploading", completedPartNumbers: [],
        createdAt: 1, updatedAt: 1,
      }, new File(["fixture"], "test.zip"));
      await store.updatePersistedModExportUploadTask(key, subject, { completedPartNumbers: [1] });
      const recovered = await store.readPersistedModExportUploadTask(key, subject);
      await store.deletePersistedModExportUploadTask(key, subject);
      const afterDeletion = await store.readPersistedModExportUploadTask(key, subject);
      // Make the second put fail synchronously after the task was queued, as a
      // browser may do when it cannot clone the selected File for this store.
      const put = IDBObjectStore.prototype.put;
      const failedTask = { ...recovered!.task, completedPartNumbers: [] };
      IDBObjectStore.prototype.put = function (value: unknown, id?: IDBValidKey) {
        if (this.name === "files") throw new DOMException("Cannot persist selected file", "DataCloneError");
        return put.call(this, value, id);
      };
      let failure = "";
      try {
        await store.createPersistedModExportUploadTask(failedTask, recovered!.file);
      } catch (error) {
        if (error instanceof DOMException) failure = error.name;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      const taskCount = await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("mcmods-cn-import-uploads", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("tasks");
          const count = transaction.objectStore("tasks").count();
          transaction.oncomplete = () => { database.close(); resolve(count.result); };
          transaction.onabort = () => { database.close(); reject(transaction.error); };
        };
      });
      const upgrade = await new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("mcmods-cn-import-uploads", 2);
        request.onblocked = () => resolve("blocked");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { request.result.close(); resolve("upgraded"); };
      });
      return {
        name: recovered?.file.name,
        contents: await recovered?.file.text(),
        parts: recovered?.task.completedPartNumbers,
        deleted: afterDeletion === undefined, failure, taskCount,
        upgrade,
      };
    });
    assert.deepEqual(observed, {
      name: "test.zip", contents: "fixture", parts: [1], deleted: true, failure: "DataCloneError", taskCount: 0, upgrade: "upgraded",
    });
  } finally {
    await browser.close();
  }
});
