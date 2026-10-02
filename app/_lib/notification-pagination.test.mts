import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("notification center traverses cursor pages and read-all consumes a watermark response", async () => {
  const source = await readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8");
  assert.match(source, /type NotificationPage/);
  assert.match(source, /nextCursor/);
  assert.match(source, /loadMoreNotifications/);
  assert.match(source, /cursor=\$\{encodeURIComponent/);
  assert.match(source, /readBefore/);
});
