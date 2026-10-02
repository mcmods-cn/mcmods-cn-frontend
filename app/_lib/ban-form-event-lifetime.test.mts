import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-ban-panel.tsx", import.meta.url), "utf8");
const create = panel.match(/async function create\(event: FormEvent<HTMLFormElement>\)([\s\S]*?)\n\s*async function revoke/)?.[1] || "";

test("the ban form captures its DOM element before the first asynchronous boundary", () => {
  const capture = create.indexOf("const formElement = event.currentTarget");
  const request = create.indexOf("await apiRequest");
  assert.ok(capture >= 0, "missing stable form element capture");
  assert.ok(request > capture, "form element must be captured before awaiting the request");
});

test("successful ban cleanup never dereferences the event after await", () => {
  const afterRequest = create.slice(create.indexOf("await apiRequest"));
  assert.doesNotMatch(afterRequest, /event\.currentTarget/);
  assert.match(afterRequest, /formElement\.reset\(\)/);
});

test("request failures return before success-only reset and refresh work", () => {
  assert.match(create, /catch \(error\)\s*\{\s*setMessage\(errorMessage\(error\)\);\s*return;\s*\}[\s\S]*formElement\.reset\(\)/);
});
