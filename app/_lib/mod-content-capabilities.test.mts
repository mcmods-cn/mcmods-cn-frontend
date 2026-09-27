import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseModContentCapabilities } from "./mod-content-capabilities.mts";

test("mod content capabilities accept only explicit server booleans", () => {
  assert.deepEqual(parseModContentCapabilities({ manageLayout: true, createResource: true, editResource: false }), {
    manageLayout: true,
    createResource: true,
    editResource: false,
  });
  assert.deepEqual(parseModContentCapabilities({ manageLayout: 1, createResource: "yes", editResource: null }), {
    manageLayout: false,
    createResource: false,
    editResource: false,
  });
  assert.deepEqual(parseModContentCapabilities(undefined), {
    manageLayout: false,
    createResource: false,
    editResource: false,
  });
});

test("every mod content edit entrance consumes the same response capability contract", async () => {
  const [api, detail, section, actions] = await Promise.all([
    readFile(new URL("./mod-content-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-content-resource-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-content-section-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/mod-content-section-actions.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /parseModContentCapabilities\(value\.capabilities\)/);
  assert.match(detail, /detail\.capabilities\.editResource/);
  assert.match(section, /capabilities\.manageLayout/);
  assert.match(section, /capabilities\.createResource/);
  assert.doesNotMatch(section, /\/editor/);
  assert.match(actions, /canArrange/);
  assert.match(actions, /canCreateResource/);
});
