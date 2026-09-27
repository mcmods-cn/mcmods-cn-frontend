import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { preserveRecipeDefinition } from "./recipe-definition-roundtrip.mts";

test("opaque recipe definition survives an ordinary editor mutation unchanged", () => {
  const loaded = {
    layoutKind: "exporter-specific",
    nested: { flags: [true, false], metadata: { namespace: "example", level: 3 } },
    nullable: null,
  };
  const mutation = preserveRecipeDefinition(loaded);
  assert.deepEqual(mutation, loaded);
  assert.notEqual(mutation, loaded);
  assert.notEqual(mutation.nested, loaded.nested);
});

test("missing definitions normalize to an empty JSON object for new recipes", () => {
  assert.deepEqual(preserveRecipeDefinition(undefined), {});
});

test("the visual recipe editor sends its loaded definition instead of synthesizing an empty object", async () => {
  const source = await readFile(new URL("../_components/editor/recipe-editor.tsx", import.meta.url), "utf8");
  assert.match(source, /preserveRecipeDefinition\(draft\.definition\)/);
  assert.doesNotMatch(source, /const definition:\s*Record<string, unknown>\s*=\s*\{\}/);
});
