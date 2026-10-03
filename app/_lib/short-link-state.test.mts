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

test("short links preserve local paths and reject executable or external destinations", async () => {
  const { resolveSafeShortLinkTarget } = await import("./short-link-state.mts");
  const origin = "https://mcmods.example";
  assert.equal(resolveSafeShortLinkTarget("/projects/mod?q=forge#files", origin), "/projects/mod?q=forge#files");
  assert.equal(resolveSafeShortLinkTarget(`${origin}/projects/mod`, origin), "/projects/mod");
  for (const candidate of ["javascript:alert(1)", "data:text/html,hi", "//evil.example", "/\\evil.example", "/\n/evil.example", "https://evil.example", "https://user@mcmods.example", "///evil.example", "https://mcmods.example//evil.example", "/%2f%2fevil.example", "/%5cevil.example", " projects/mod", "projects/mod", ""]) {
    assert.equal(resolveSafeShortLinkTarget(candidate, origin), undefined, candidate);
  }
});
