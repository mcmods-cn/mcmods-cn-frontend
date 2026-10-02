import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beginAdminProjectDetailLoad,
  completeAdminProjectDetailLoad,
  failAdminProjectDetailLoad,
  visibleAdminProjectDetail,
} from "./admin-project-detail-state.mts";

type Detail = { project: { id: string }; days: number; name: string };

test("a ready detail is visible only for the selected project and range", () => {
  const request = beginAdminProjectDetailLoad("project-a", 30);
  const detail: Detail = { project: { id: "project-a" }, days: 30, name: "A" };
  const ready = completeAdminProjectDetailLoad(request, detail.project.id, detail.days, detail);

  assert.equal(visibleAdminProjectDetail(ready, "project-a", 30), detail);
  assert.equal(visibleAdminProjectDetail(ready, "project-b", 30), undefined);
  assert.equal(visibleAdminProjectDetail(ready, "project-a", 90), undefined);
});

test("selection changes and failures cannot retain a previous project detail", () => {
  const loadingB = beginAdminProjectDetailLoad("project-b", 30);
  assert.equal(visibleAdminProjectDetail(loadingB, "project-b", 30), undefined);

  const failedB = failAdminProjectDetailLoad(loadingB);
  assert.deepEqual(failedB, { status: "error", projectID: "project-b", days: 30 });
  assert.equal(visibleAdminProjectDetail(failedB, "project-b", 30), undefined);
});

test("a response whose identity differs from its request fails closed", () => {
  const request = beginAdminProjectDetailLoad("project-b", 30);
  const stale: Detail = { project: { id: "project-a" }, days: 30, name: "A" };
  const result = completeAdminProjectDetailLoad(request, stale.project.id, stale.days, stale);

  assert.deepEqual(result, { status: "error", projectID: "project-b", days: 30 });
  assert.equal(visibleAdminProjectDetail(result, "project-b", 30), undefined);
});

test("the admin workbench aborts obsolete requests and renders explicit load states", async () => {
  const source = await readFile(new URL("../_components/admin-dashboard-panel.tsx", import.meta.url), "utf8");

  assert.match(source, /beginAdminProjectDetailLoad/);
  assert.match(source, /visibleAdminProjectDetail/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /common\.retry/);
  assert.doesNotMatch(source, /!selectedID \|\| !projectDetail/);
});
