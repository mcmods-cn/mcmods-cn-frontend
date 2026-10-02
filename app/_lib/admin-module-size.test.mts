import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const components = new URL("../_components/", import.meta.url);

function lines(name: string) {
  return readFileSync(new URL(name, components), "utf8").split(/\r?\n/).length;
}

test("admin UI modules keep reviewable business boundaries", () => {
  assert.ok(lines("admin-console.tsx") <= 1200, "admin-console.tsx must remain a coordinating shell");
  for (const name of readdirSync(components).filter((entry) => entry.startsWith("admin-") && entry.endsWith(".tsx"))) {
    assert.ok(lines(name) <= 2000, `${name} exceeds the 2,000-line admin module boundary`);
  }
});
