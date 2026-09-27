import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project downloads keep an independent opaque cursor for every source", async () => {
  const [component, api] = await Promise.all([
    readFile(new URL("../_components/project-downloads.tsx", import.meta.url), "utf8"),
    readFile(new URL("./project-download-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(api, /hasMore:\s*boolean/);
  assert.match(api, /nextCursor:\s*string/);
  assert.match(api, /source:\s*ProjectFileSource/);
  assert.doesNotMatch(api, /totals:/);
  assert.match(component, /sourceCursors/);
  assert.match(component, /loadMore/);
  assert.match(component, /Promise\.all/);
  assert.doesNotMatch(component, /apiRequest<ProjectFilesResponse>\(basePath, \{\}, token\)/);
});

test("project downloads treat only clean or trusted generated files as downloadable", async () => {
  const component = await readFile(new URL("../_components/project-downloads.tsx", import.meta.url), "utf8");
  assert.match(component, /file\.scanStatus !== "clean" && file\.scanStatus !== "trusted_generated"/);
  assert.match(component, /scanPending/);
  assert.match(component, /scanRejected/);
});
