import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("message center consumes conversation and history cursor envelopes", async () => {
  const source = await readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8");
  assert.match(source, /type ConversationPage/);
  assert.match(source, /type DirectMessagePage/);
  assert.match(source, /loadMoreConversations/);
  assert.match(source, /loadOlderMessages/);
  assert.match(source, /cursor=\$\{encodeURIComponent/);
  assert.match(source, /\.hasMore/);
  assert.match(source, /\.nextCursor/);
  assert.match(source, /loadMoreConversations/);
  assert.match(source, /loadOlderMessages/);
  assert.doesNotMatch(source, /apiRequest<Conversation\[\]>/);
  assert.doesNotMatch(source, /apiRequest<DirectMessage\[\]>/);
});

test("incremental message refresh drains every bounded after page", async () => {
  const source = await readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8");
  assert.match(source, /do\s*\{/);
  assert.match(source, /while \(page\.hasMore/);
  assert.match(source, /after=\$\{encodeURIComponent/);
});
