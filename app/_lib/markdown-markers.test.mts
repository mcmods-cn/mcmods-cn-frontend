import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMarkdownMarker, escapeMarkdownMarkerLiterals, restoreMarkdownMarkerLiterals } from "./markdown-markers.mts";

test("user marker payloads remain literals until extension processing is finished", () => {
  for (const payload of ["%", "%E0%A4%A", "javascript:alert(1)", "forged-resource"]) {
    const original = `before \uE000MCINTRO_${payload}\uE001 after`;
    const protectedSource = escapeMarkdownMarkerLiterals(original);
    assert.equal(protectedSource.includes("\uE000MCINTRO_"), false);
    assert.equal(restoreMarkdownMarkerLiterals(protectedSource), original);
  }
});

test("malformed encoding cannot throw; valid generated marker payloads round trip", () => {
  assert.equal(decodeMarkdownMarker("%"), undefined);
  assert.equal(decodeMarkdownMarker("%E0%A4%A"), undefined);
  const content = "[icon:item=2,MB] · 中文 / 100%";
  assert.equal(decodeMarkdownMarker(encodeURIComponent(content)), content);
  const privateCharacters = "\uE002MCLITERAL_START\uE003 \uE002MCLITERAL_ESCAPE\uE003 \uE000";
  assert.equal(restoreMarkdownMarkerLiterals(escapeMarkdownMarkerLiterals(privateCharacters)), privateCharacters);
});
