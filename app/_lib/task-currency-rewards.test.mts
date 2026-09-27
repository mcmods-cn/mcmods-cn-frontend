import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canUseTaskRewardCurrency,
  renameTaskCurrencyReward,
  taskRewardCurrencyCodesAreUnique,
} from "./task-currency-rewards.mts";

test("renaming a reward cannot overwrite another occupied currency", () => {
  const rewards = { gold: 1, diamond: 2 };
  assert.equal(canUseTaskRewardCurrency(rewards, "gold", "diamond"), false);
  assert.equal(renameTaskCurrencyReward(rewards, "gold", "diamond"), null);
  assert.deepEqual(rewards, { gold: 1, diamond: 2 });

  assert.equal(canUseTaskRewardCurrency(rewards, "gold", "emerald"), true);
  assert.deepEqual(renameTaskCurrencyReward(rewards, "gold", "emerald"), { diamond: 2, emerald: 1 });
});

test("save guard rejects currency keys that collide after normalization", () => {
  assert.equal(taskRewardCurrencyCodesAreUnique({ gold: 1, diamond: 2 }), true);
  assert.equal(taskRewardCurrencyCodesAreUnique({ Gold: 1, " gold ": 2 }), false);
});

test("task editor disables occupied options and routes rename plus save through the shared guard", async () => {
  const source = await readFile(new URL("../_components/admin-community-panels.tsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{!canUseTaskRewardCurrency\(draft\.rewards\.currencies \?\? \{\}, code, currency\.code\)\}/);
  assert.match(source, /renameTaskCurrencyReward\(draft\.rewards\.currencies \?\? \{\}, code, event\.target\.value\)/);
  assert.match(source, /if \(!taskRewardCurrencyCodesAreUnique\(draft\.rewards\.currencies \?\? \{\}\)\)/);
  assert.doesNotMatch(source, /delete next\[code\];\s*next\[event\.target\.value\] = amount/);
});
