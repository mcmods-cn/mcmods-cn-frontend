import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

test("global resource governance exposes only the authorized app route", async () => {
  await access(new URL("../admin/global-resources/page.tsx", import.meta.url));
  await assert.rejects(access(new URL("../catalog/resources/page.tsx", import.meta.url)));
});
