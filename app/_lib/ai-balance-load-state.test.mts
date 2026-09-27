import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../_components/messages-center.tsx", import.meta.url), "utf8");

test("the first translatable notification loads the current account balance", () => {
  assert.match(source, /const hasTranslatableNotifications = notifications\.items\.some/);
  assert.match(source, /const aiBalance = aiBalanceSnapshot\?\.token === token/);
  assert.match(source, /const hasCurrentAIBalance = aiBalance !== null/);
  assert.match(source, /if \(!hasTranslatableNotifications \|\| hasCurrentAIBalance\) return/);
  assert.match(source, /void loadBalance\(controller\.signal\)/);
  assert.match(source, /window\.clearTimeout\(timer\)/);
  assert.match(source, /controller\.abort\(\)/);
});

test("a newly queued translation refreshes balance in the terminal cleanup path", () => {
  const translation = source.slice(source.indexOf("async function translate"), source.indexOf("async function sendMessage"));
  assert.match(translation, /balanceRefreshNeeded = !started\.cached/);
  assert.match(translation, /finally\s*\{/);
  assert.match(translation, /if \(balanceRefreshNeeded\)/);
  assert.match(translation, /await loadBalance\(\)/);
});
