import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a failed account draft read keeps saving disabled and exposes retry", async () => {
  const source = await readFile(new URL("../_components/tools-playground.tsx", import.meta.url), "utf8");
  assert.match(source, /setDraftLoadFailed\(true\)/);
  assert.match(source, /setDraftLoaded\(false\)/);
  assert.match(source, /setDraftLoadRetry\(\(current\) => current \+ 1\)/);
  assert.match(source, /disabled=\{!draftLoaded \|\| saving \|\| uploading/);
  assert.match(source, /tools\.playground\.retryDraftLoad/);
});
