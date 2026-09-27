import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8");

test("switching conversations clears the previous body in the same selection action", () => {
  assert.match(source, /const selectConversation = useCallback/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setSelectedConversationID\(item\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => selectConversation\(item\.id\)\}/);

  const selection = source.slice(
    source.indexOf("const selectConversation = useCallback"),
    source.indexOf("const loadNotifications = useCallback"),
  );
  const invalidateIndex = selection.indexOf("invalidateMessageRequests()");
  const clearIndex = selection.indexOf("setMessages([])");
  const selectIndex = selection.indexOf("setSelectedConversationID(conversationID)");
  assert.ok(invalidateIndex >= 0 && clearIndex > invalidateIndex && selectIndex > clearIndex, selection);
});

test("conversation message requests are aborted and identity checked before commits", () => {
  assert.match(source, /messageRequestAbortRef = useRef<AbortController \| null>/);
  assert.match(source, /olderMessageRequestAbortRef = useRef<AbortController \| null>/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: requestController\.signal/);
  assert.match(source, /selectedConversationIDRef\.current !== conversationID/);
  assert.match(source, /requestVersion !== messageRequestVersionRef\.current/);
});
