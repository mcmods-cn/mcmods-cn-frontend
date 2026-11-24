import assert from "node:assert/strict";
import { test } from "node:test";
import { exceedsCommentTextLimit, maxCommentCharacters, maxCommentDraftUnits, trimCommentBody } from "./comment-text-limit.mts";

test("comments follow the backend's trimmed Unicode code-point boundary", () => {
  const valid = "𠮷".repeat(maxCommentCharacters - 2) + "e\u0301";
  assert.equal(valid.length, maxCommentDraftUnits - 2);
  assert.equal(exceedsCommentTextLimit("\u0085" + valid + "\u3000"), false);
  assert.equal(exceedsCommentTextLimit(valid + "🌿"), true);
  assert.equal(exceedsCommentTextLimit(valid + "\uFEFF"), true);
  assert.equal(trimCommentBody("\u0085\uFEFF\u3000"), "\uFEFF");
});
