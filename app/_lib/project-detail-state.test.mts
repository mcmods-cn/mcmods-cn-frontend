import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyProjectDetailFailure } from "./project-detail-state.mts";

test("only an explicit 404 response becomes a missing project", () => {
  assert.deepEqual(classifyProjectDetailFailure({ status: 404 }), { status: "not_found", message: "" });
  assert.equal(classifyProjectDetailFailure({ status: 401 }).status, "error");
  assert.equal(classifyProjectDetailFailure({ status: 410 }).status, "error");
  assert.equal(classifyProjectDetailFailure({ status: 500 }).status, "error");
  assert.equal(classifyProjectDetailFailure(new TypeError("network unavailable")).status, "error");
  assert.equal(classifyProjectDetailFailure(undefined).status, "error");
});

test("project detail failures preserve a useful retry description", () => {
  assert.deepEqual(classifyProjectDetailFailure(new Error("backend unavailable")), {
    status: "error",
    message: "backend unavailable",
  });
});

test("all public project details share retryable, abortable load states", async () => {
  const [boundary, mod, simple, modpack] = await Promise.all([
    readFile(new URL("../_components/project-detail-load-boundary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-detail-loader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/simple-project-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/modpack-detail.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(boundary, /new AbortController\(\)/);
  assert.match(boundary, /controller\.abort\(\)/);
  assert.match(boundary, /classifyProjectDetailFailure/);
  assert.match(boundary, /setAttempt\(\(current\) => current \+ 1\)/);
  assert.match(boundary, /common\.retry/);

  for (const source of [mod, simple, modpack]) {
    assert.match(source, /useProjectDetailQuery/);
    assert.match(source, /ProjectDetailLoadFeedback/);
    assert.match(source, /signal/);
    assert.doesNotMatch(source, /error instanceof ApiError && error\.status === 404/);
  }
});
