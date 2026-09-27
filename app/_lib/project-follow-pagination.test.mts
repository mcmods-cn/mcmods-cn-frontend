import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mergeFollowedProjectPage, projectFollowPagePath } from "./project-follow-pagination.ts";

const panel = readFileSync(new URL("../_components/project-follows-panel.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("./project-follow-api.ts", import.meta.url), "utf8");

test("project follow page paths use a scoped cursor instead of offset", () => {
  assert.equal(projectFollowPagePath("  mekanism  ", "mod", "next+/="), "/api/v1/users/me/project-follows?limit=40&q=mekanism&type=mod&cursor=next%2B%2F%3D");
  assert.doesNotMatch(projectFollowPagePath("", "", ""), /offset=/);
});

test("follow pages merge by stable project identity without reordering prior rows", () => {
  const first = [{ id: "a", type: "mod", value: 1 }, { id: "b", type: "plugin", value: 2 }];
  const second = [{ id: "a", type: "mod", value: 3 }, { id: "c", type: "mod", value: 4 }];
  assert.deepEqual(mergeFollowedProjectPage(first, second), [...first, second[1]]);
});

test("the panel traverses nextCursor and invalidates old filter requests", () => {
  assert.match(panel, /nextCursor/);
  assert.match(panel, /loadMore/);
  assert.match(panel, /requestGeneration/);
  assert.match(panel, /AbortController/);
  assert.match(panel, /mergeFollowedProjectPage/);
  assert.doesNotMatch(panel, /offset/);
});

test("follow notification preferences are mutable and reflected from persisted responses", () => {
  assert.match(api, /setProjectFollowNotifications/);
  assert.match(api, /method:\s*"PATCH"/);
  assert.match(api, /notificationsEnabled/);
  assert.match(panel, /setProjectFollowNotifications/);
  assert.match(panel, /notificationsEnabled/);
  assert.match(panel, /projectFollows\.notifications/);
});
