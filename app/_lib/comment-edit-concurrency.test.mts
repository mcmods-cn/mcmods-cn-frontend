import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(new URL("./comment-api.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../_components/comment-section.tsx", import.meta.url), "utf8");

test("comment edits carry the rendered version and recover from an explicit conflict", () => {
  assert.match(apiSource, /updateComment\(commentId: string, body: string, baseUpdatedAt: string, token: string\)/);
  assert.match(apiSource, /JSON\.stringify\(\{ body, baseUpdatedAt \}\)/);
  assert.match(componentSource, /updateComment\(comment\.id, nextBody\.trim\(\), comment\.updatedAt, props\.token\)/);
  assert.match(componentSource, /error\.code === "COMMENT_EDIT_CONFLICT"/);
  assert.match(componentSource, /current\.updatedAt/);
  assert.match(componentSource, /mods\.comments\.editConflict/);
});
