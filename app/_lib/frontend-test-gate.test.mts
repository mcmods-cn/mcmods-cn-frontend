import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function collectTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTestFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".test.mts") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

test("the repository test command relies on automatic whole-tree discovery", async () => {
  const packageJSON = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const testFiles = await collectTestFiles("app");

  assert.equal(packageJSON.scripts?.test, "node --test");
  assert.equal(packageJSON.scripts?.pretest, undefined);
  assert.ok(testFiles.length > 1, "the frontend must retain a real automated test suite");
  assert.ok(
    testFiles.some((file) => file.endsWith("frontend-test-gate.test.mts")),
    "the discovery gate itself must be inside the discovered tree",
  );
});
