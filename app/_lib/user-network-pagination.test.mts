import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceUserNetworkCursor,
  rewindUserNetworkCursor,
  userNetworkPagePath,
} from "./user-network-pagination.mts";

test("public user network paths carry bounded opaque cursors without page offsets", () => {
  assert.equal(
    userNetworkPagePath("user id", "followers", 24, ""),
    "/api/v1/users/user%20id/followers?limit=24",
  );
  assert.equal(
    userNetworkPagePath("user/id", "following", 24, "opaque+/="),
    "/api/v1/users/user%2Fid/following?limit=24&cursor=opaque%2B%2F%3D",
  );
});

test("cursor history supports next and previous navigation without manufacturing cursors", () => {
  const initial = [""];
  const second = advanceUserNetworkCursor(initial, "cursor-two");
  assert.deepEqual(initial, [""]);
  assert.deepEqual(second, ["", "cursor-two"]);
  assert.strictEqual(advanceUserNetworkCursor(second, ""), second);
  assert.deepEqual(rewindUserNetworkCursor(second), [""]);
  assert.strictEqual(rewindUserNetworkCursor(initial), initial);
});

test("network UI consumes cursor pages while the private block list keeps its separate page API", () => {
  const source = readFileSync(new URL("../_components/user-network-list.tsx", import.meta.url), "utf8");
  assert.match(source, /userNetworkPagePath/);
  assert.match(source, /cursorHistory/);
  assert.match(source, /nextCursor/);
  assert.match(source, /hasMore/);
  assert.match(source, /\}, \[network, ready, t, token, userId\]\);/);
  assert.match(source, /\[canLoadNetwork, currentCursor, network, page, ready, t, token, userId\]/);
  assert.doesNotMatch(source, /users\/\$\{encodeURIComponent\(userId\)\}\/\$\{network\}\?page=/);
  assert.match(source, /users\/me\/blocks\?page=/);
});
