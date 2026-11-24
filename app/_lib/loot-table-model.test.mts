import assert from "node:assert/strict";
import test from "node:test";
import * as loot from "./loot-table-model.ts";

test("custom loot types keep their namespace and their function semantics", () => {
  assert.equal(loot.lootEntryFamily({entry_type: "example:item", entry_kind: "item"}), "custom");
  assert.equal(loot.lootSetCountFunction({functions: [{function: "example:set_count", count: 3}]}), undefined);
});

test("editing the first vanilla quantity preserves its conditions, additive mode and neighbors", () => {
  const first = {function: "set_count", add: true, count: 2, conditions: [{condition: "minecraft:survives_explosion"}]};
  const second = {function: "minecraft:set_count", count: 7};
  const custom = {function: "example:set_count", label: "opaque"};
  const input = {functions: [custom, first, second], weight: 0};
  const edited = loot.withLootEntryQuantity(input, 0);
  assert.deepEqual(edited, {functions: [custom, {...first, count: 0}, second], weight: 0});
  assert.deepEqual(loot.withLootEntryQuantity(edited, undefined), {functions: [custom, second], weight: 0});
  assert.equal(input.functions[1], first);
});

test("editing projected resource identifiers updates the identity displayed after saving", () => {
  for (const [type, alias] of [["item", "item_id"], ["tag", "tag_id"], ["loot_table", "loot_table_id"]] as const) {
    const input = {entry_type: "minecraft:" + type, entry_kind: type, name: "demo:before", [alias]: "demo:before", weight: 0};
    const edited = loot.withLootEntryIdentifier(input, type, "demo:after");
    assert.equal(loot.lootEntryIdentifier(edited), "demo:after");
    assert.equal(edited[alias], "demo:after");
    assert.equal(edited.name, "demo:after");
    assert.equal(edited.weight, 0);
    assert.equal(input[alias], "demo:before");
  }
});
