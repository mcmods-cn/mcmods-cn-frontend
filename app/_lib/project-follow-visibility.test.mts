import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("hidden project follows remain removable without rendering hidden metadata", () => {
  const api = read("./project-follow-api.ts");
  const panel = read("../_components/project-follows-panel.tsx");
  const button = read("../_components/project-follow-button.tsx");

  assert.match(api, /unavailable\?: boolean/);
  assert.match(panel, /item\.unavailable/);
  assert.match(panel, /projectFollows\.unavailable/);
  assert.match(panel, /item\.unavailable \? null/);
  assert.match(button, /reason instanceof ApiError && reason\.status === 404/);
  assert.match(button, /targetUnavailable && !followed/);
  assert.match(button, /setTargetUnavailable\(result\.target\?\.unavailable === true\)/);
});
