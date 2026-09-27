import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { modRevisionHistoryPagePath, toggleModRevisionSelection } from "./mod-history-pagination.mts";

test("Mod history page path carries the hard limit and opaque cursor", () => {
  assert.equal(
    modRevisionHistoryPagePath("example mod", "opaque+/="),
    "/api/v1/mods/example%20mod/revisions?limit=50&cursor=opaque%2B%2F%3D",
  );
});

test("Mod history selection survives page changes and remains bounded to two", () => {
  const first = { id: "first", version: 100 };
  const second = { id: "second", version: 50 };
  const third = { id: "third", version: 1 };
  assert.deepEqual(toggleModRevisionSelection(toggleModRevisionSelection([first], second), third), [second, third]);
  assert.deepEqual(toggleModRevisionSelection([first, second], first), [second]);
});

test("Mod history renders a bounded cursor page with previous and next controls", async () => {
  const source = await readFile(new URL("../_components/mod-history.tsx", import.meta.url), "utf8");
  assert.match(source, /modRevisionHistoryPagePath/);
  assert.match(source, /nextCursor/);
  assert.match(source, /cursorHistory/);
  assert.match(source, /common\.previous/);
  assert.match(source, /common\.next/);
  assert.doesNotMatch(source, /revisions`, \{\}, token/);
});
