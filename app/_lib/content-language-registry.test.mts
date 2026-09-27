import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { supportedUILocales, uiLocaleCodes } from "./ui-locale.mts";

test("editable content languages are derived from the UI locale registry", async () => {
  const source = await readFile(new URL("./content-language.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /editableContentLanguages\s*=\s*\[/);
  assert.doesNotMatch(source, /from "\.\/i18n-provider"/);
  assert.match(source, /from "\.\/ui-locale\.mts"/);
  assert.match(source, /editableContentLanguages\s*=\s*uiLocaleCodes/);
  assert.deepEqual(uiLocaleCodes, supportedUILocales.map(({ code }) => code));
});
