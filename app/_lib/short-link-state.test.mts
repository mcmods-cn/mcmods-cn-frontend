import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyShortLinkFailure } from "./short-link-state.mts";

test("only explicit missing and gone API statuses become not found", () => {
  assert.equal(classifyShortLinkFailure(404), "not_found");
  assert.equal(classifyShortLinkFailure(410), "not_found");
  assert.equal(classifyShortLinkFailure(500), "error");
  assert.equal(classifyShortLinkFailure(undefined), "error");
});

test("public short links expose retry and cancel obsolete navigation", async () => {
  const source = await readFile(new URL("../[publicId]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /return \(\) => controller\.abort\(\)/);
  assert.match(source, /classifyShortLinkFailure/);
  assert.match(source, /setAttempt\(\(current\) => current \+ 1\)/);
  assert.equal(source.includes("if (error instanceof ApiError) setFailed(true)"), false);
});
