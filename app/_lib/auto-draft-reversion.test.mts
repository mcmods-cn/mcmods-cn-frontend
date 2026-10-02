import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldPersistAutoDraft } from "./auto-draft-save-state.ts";

const hook = readFileSync(new URL("./use-auto-draft.ts", import.meta.url), "utf8");

test("A to B to A compares only with the latest successful remote snapshot", () => {
  const initial = JSON.stringify({ title: "A" });
  const changed = JSON.stringify({ title: "B" });

  assert.equal(shouldPersistAutoDraft(initial, initial), false);
  assert.equal(shouldPersistAutoDraft(changed, initial), true);
  assert.equal(shouldPersistAutoDraft(initial, changed), true);
});

test("editing during a successful save requires an immediate follow-up snapshot", () => {
  const savedInFlight = JSON.stringify({ title: "B" });
  const latest = JSON.stringify({ title: "C" });
  assert.equal(shouldPersistAutoDraft(latest, savedInFlight), true);
  assert.equal(shouldPersistAutoDraft(savedInFlight, savedInFlight), false);
});

test("restored drafts use the restored payload as the sole remote baseline", () => {
  const restored = JSON.stringify({ title: "remote B" });
  const reverted = JSON.stringify({ title: "initial A" });
  assert.equal(shouldPersistAutoDraft(reverted, restored), true);
});

test("the hook has no permanent initial baseline shortcut and flushes edits made in flight", () => {
  assert.doesNotMatch(hook, /baselineRef/);
  assert.match(hook, /shouldPersistAutoDraft\(serialized,\s*lastSavedRef\.current\)/);
  assert.match(hook, /savedOnce[\s\S]*shouldPersistAutoDraft\(latest,\s*lastSavedRef\.current\)[\s\S]*await persistCurrent\(false\)/);
});
