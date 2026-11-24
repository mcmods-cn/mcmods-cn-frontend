import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project downloads treat only clean or trusted generated files as downloadable", async () => {
  const component = await readFile(new URL("../_components/project-downloads.tsx", import.meta.url), "utf8");
  assert.match(component, /file\.scanStatus !== "clean" && file\.scanStatus !== "trusted_generated"/);
  assert.match(component, /scanPending/);
  assert.match(component, /scanRejected/);
});
