import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "@playwright/test";
import type * as UploadStore from "../app/_lib/mod-export-upload-store";

test("native IndexedDB keeps per-account import records and releases database connections", async ({ page }) => {
  // This is an isolated browser storage test. No backend/OSS/AI request is made.
  const source = readFileSync(path.resolve("app/_lib/mod-export-upload-store.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  // A dedicated origin without application CSP hosts the actual storage module.
  await page.route("**/__isolated_indexeddb_test", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body>isolated storage test</body></html>" }));
  await page.goto("/__isolated_indexeddb_test");
  await page.addScriptTag({ content: `var exports = {};\n${compiled}` });
  const result = await page.evaluate(async () => {
    const store = (window as Window & { exports: typeof UploadStore }).exports;
    const keyA = store.modExportUploadTaskKey("project", "version", "cookie-session", "account-a");
    const keyB = store.modExportUploadTaskKey("project", "version", "cookie-session", "account-b");
    const file = new File(["synthetic zip"], "isolated.zip", { type: "application/zip" });
    await store.createPersistedModExportUploadTask({ key: keyA, siteId: "project", targetVersionId: "version", overwriteExistingImportData: false, phase: "uploading", completedPartNumbers: [], createdAt: 1, updatedAt: 1 }, file);
    await store.updatePersistedModExportUploadTask(keyA, { completedPartNumbers: [1] });
    const storedA = await store.readPersistedModExportUploadTask(keyA);
    const storedB = await store.readPersistedModExportUploadTask(keyB);
    await store.deletePersistedModExportUploadTask(keyA);
    const deleted = await store.readPersistedModExportUploadTask(keyA);
    const upgrade = await new Promise<string>((resolve) => {
      const request = indexedDB.open("mcmods-cn-import-uploads", 2);
      request.onblocked = () => resolve("blocked");
      request.onerror = () => resolve("error");
      request.onsuccess = () => { request.result.close(); resolve("ready"); };
    });
    return { filename: storedA?.file.name, parts: storedA?.task.completedPartNumbers, crossAccount: storedB === undefined, deleted: deleted === undefined, upgrade };
  });
  expect(result).toEqual({ filename: "isolated.zip", parts: [1], crossAccount: true, deleted: true, upgrade: "ready" });
});
